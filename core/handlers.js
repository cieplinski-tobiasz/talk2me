const utils = require('./utils');
const errors = require('./constants').Errors;
const events = require('./constants').Events;
const prefixes = require('./constants').Prefixes;

/**
 * Returns handlers for processing matching microservice events initialized with required dependencies
 *
 * @param {Object!} dependencies - Object containing the required dependencies
 * @param {Map<string, socket>!} dependencies.sockets
 * @param {Redis!} dependencies.db - Client of the database
 * @param dependencies.uuid - UUID generator
 * @param {Object!} dependencies.timers - Callbacks for setTimeout function
 * @param {Object!} dependencies.timeouts - Duration of timeouts
 * @param {function} dependencies.key - Function creating key for database from varargs
 * @callback dependencies.timers.matchTimer - Function invoked after waiting for confirmation
 *
 * @returns {function} `match` event handler
 */
function makeMatchHandlers(dependencies) {

    /**
     * Emits `match` event to users and starts the confirm timer
     *
     * The event contains talk UUID, which is used for assigning the answers to the talk.
     * If both users are connected, the events are send to them and setTimeout() is called
     * with function that takes care of connecting the sockets.
     * If one of the users has disconnected, error is send to the users that are still connected,
     * and they are disconnected.
     *
     * @async
     * @param _ign - Ignored parameter, added for consistency with convention of (socket, data) parameters
     * @param {Object!} data - Matching service's event payload
     * @param {string!} data.firstId - ID of first matched user
     * @param {string!} data.secondId - ID of second matched user
     */
    async function onMatch(_ign, data) {
        const talkUUID = dependencies.uuid();
        const firstSocket = dependencies.sockets.get(data.firstId);
        const secondSocket = dependencies.sockets.get(data.secondId);

        if (firstSocket && secondSocket) {
            const payload = {match_id: talkUUID};

            utils.safeEmit(events.MATCH, payload, firstSocket, secondSocket);
            setTimeout(
                () => dependencies.timers.matchTimer(talkUUID, data.firstId, data.secondId),
                dependencies.timeouts.CONFIRM
            );
        } else {
            utils.safeError(errors.MATCH_DC, firstSocket, secondSocket);
        }
    }

    /**
     * Disconnects the user if he is still connected
     *
     * @param _ign - Ignored parameter, used for (socket, data) convention
     * @param {Object} data - Payload of the event
     * @param {string!} data.id - ID of the dequeued user
     */
    async function onDequeue(_ign, data) {
        const socket = dependencies.sockets.get(data.id);

        if (socket !== undefined) {
            utils.safeError(errors.MATCH_TIMEOUT, socket);
        }
    }

    return {
        onDequeue,
        onMatch,
    }
}

/**
 * Returns handlers for processing events received from user
 *
 * @param {Object} dependencies - Object containing the required dependencies
 * @param {Map<string, socket>!} dependencies.sockets
 * @param {Redis!} dependencies.db - Client of the database
 * @param dependencies.uuid - UUID generator
 * @param {function} dependencies.key - Function creating key for database from varargs
 * @param dependencies.matchService - Object communicating with user matching microservice
 *
 * @returns {Object} - Handlers for events emitted by client
 */
function makeClientEventsHandlers(dependencies) {

    /**
     * Stores the answer for given talk ID and socket ID
     *
     * @async
     * @param socket - Socket of the user emitting the event
     * @param {Object!} data - Payload of the event
     * @param {Array<string>} data.answers
     * @param {string} data.match_id - UUID of the matching
     */
    async function onAnswer(socket, data) {
        const answers = data.answers;
        const talkId = data.match_id;

        const flatMapped = answers
            .map(obj => [obj.id, obj.answer])
            .reduce((x, y) => x.concat(y), []);

        const key = dependencies.key(prefixes.ANSWERS, talkId, socket.id);

        await dependencies.db.hmset(key, flatMapped);
    }

    /**
     * Puts the socket into the socket id to socket map.
     *
     * @param socket - Socket of the user emitting the event
     */
    function onConnect(socket) {
        dependencies.sockets.set(socket.id, socket);
    }

    /**
     * Adds socket id to the set of users that confirmed the match
     *
     * @async
     * @param socket - Socket of the user emitting the event
     * @param {Object!} data - Payload of the event
     * @param {string!} data.match_id - UUID of the matching
     */
    async function onConfirm(socket, data) {
        const matchId = data.match_id;

        const key = dependencies.key(prefixes.MATCHING, matchId);
        await dependencies.db.sadd(key, socket.id);
    }

    /**
     * Deletes the socket related data
     *
     * This function is ran on every disconnect of the socket.
     * It deletes all the questions send by the client and removes socket matching if exists.
     * The matching microservice is also notified about the disconnect.
     *
     * @async
     * @param socket - Socket of the user emitting the event
     */
    async function onDisconnect(socket) {
        dependencies.sockets.delete(socket.id);

        const questionsKey = dependencies.key(prefixes.QUESTIONS, socket.id);
        const socketKey = dependencies.key(prefixes.SOCKET, socket.id);

        await dependencies.db.multi()
            .del(questionsKey)
            .del(socketKey)
            .exec();

        await dependencies.matchService.dequeue(socket.id);
    }

    /**
     * Stores questions and calls user matching service
     *
     * The questions are transformed into a list and stored in the database.
     * Afterwards, if the socket is still connected, the function calls matching service,
     * forwarding the id of the socket and score of the questions.
     *
     * @async
     * @param socket - Socket of the user emitting the event
     * @param {Object!} data - Payload of the event
     * @param {Array<Object>} data.questions - Array of question objects containing fields:
     * - {string} id, which is the identifier of the question
     * - {string} question
     * @param {number} data.score - Scoring of the questions in [-1, 1] range
     */
    async function onFind(socket, data) {
        const questions = data.questions;
        const score = data.score;

        const flatMapped = questions
            .map(obj => [`${obj.id}`, obj.question])
            .reduce((x, y) => x.concat(y), []);

        const questionsKey = dependencies.key(prefixes.QUESTIONS, socket.id);

        await dependencies.db.hmset(questionsKey, flatMapped);

        if (dependencies.sockets.get(socket.id)) {
            dependencies.matchService.enqueue(socket.id, score);
        }
    }

    /**
     * Forwards the message to matched socket
     *
     * @async
     * @param socket - Socket of the user emitting the event
     * @param {Object!} data - Payload of the event
     * @param {string!} data.message - Message to be forwarded
     */
    async function onMessage(socket, data) {
        const socketKey = dependencies.key(prefixes.SOCKET, socket.id);

        const toSocketId = await dependencies.db.get(socketKey);
        const toSocket = dependencies.sockets.get(toSocketId);

        if (!toSocket) {
            utils.safeError(errors.TALK_DC, socket, toSocket);
            return;
        }

        utils.safeEmit(events.MESSAGE, {message: data.message}, toSocket);
    }

    return {
        onAnswer,
        onConnect,
        onConfirm,
        onDisconnect,
        onFind,
        onMessage,
    }
}

module.exports = {
    makeClientEventsHandlers,
    makeMatchHandlers,
};