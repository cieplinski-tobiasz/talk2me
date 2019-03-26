const utils = require('./utils');
const errors = require('./constants').Errors;
const events = require('./constants').Events;
const prefixes = require('./constants').Prefixes;

/**
 * Creates callbacks used in setTimeout() for orchestrating
 * matching, chatting and answering process.
 *
 * @param {Object!} dependencies - Object containing the required dependencies
 * @param {Map<string, socket>!} dependencies.sockets
 * @param {Redis!} dependencies.db - Client of the database
 * @param {function} dependencies.key - Function creating key used in the database
 * @param {Object!} dependencies.timeouts - Duration of timeouts
 *
 * @returns {Object} Callbacks intended to use with setTimeout()
 */
function makeTimers(dependencies) {

    /**
     * Checks if both users confirmed the matching
     *
     * The function calls the database to check if two confirms have arrived.
     * If no, sockets that were going to be matched are disconnected with failure event.
     * If both confirmations are present, the function starts the chat timer.
     *
     * @async
     * @param {string!} talkId
     * @param {string!} firstSocketId
     * @param {string!} secondSocketId
     */
    async function matchTimer(talkId, firstSocketId, secondSocketId) {
        const matchingKey = dependencies.key(prefixes.MATCHING, talkId);

        const [[, confirmed],] = await dependencies.db.multi()
            .smembers(matchingKey)
            .del(matchingKey)
            .exec();

        const firstSocket = dependencies.sockets.get(firstSocketId);
        const secondSocket = dependencies.sockets.get(secondSocketId);

        if (confirmed.length !== 2) {
            utils.safeError(errors.MATCH_TIMEOUT, firstSocket, secondSocket);
            return;
        }

        const firstSocketKey = dependencies.key(prefixes.SOCKET, firstSocketId);
        const secondSocketKey = dependencies.key(prefixes.SOCKET, secondSocketId);

        await dependencies.db.multi()
            .set(firstSocketKey, secondSocketId)
            .set(secondSocketKey, firstSocketId)
            .exec();

        if (firstSocket && secondSocket) {
            utils.safeEmit(events.CHAT_START, null, firstSocket, secondSocket);
            setTimeout(
                () => chatTimer(talkId, firstSocketId, secondSocketId),
                dependencies.timeouts.CHAT
            );
        } else {
            utils.safeError(errors.MATCH_DC, firstSocket, secondSocket);
            await dependencies.db.multi()
                .del(firstSocketKey)
                .del(secondSocketKey)
                .exec();
        }
    }

    /**
     * Retrieves questions for given socket ids and parses them
     *
     * If questions of any user are not present, empty array will be returned
     *
     * @async
     * @param {string!} firstSocketId
     * @param {string!} secondSocketId
     * @returns {Promise<{first: Array, second: Array}>} - questions of first and second user
     */
    async function getQuestions(firstSocketId, secondSocketId) {
        const firstQuestionsKey = dependencies.key(prefixes.QUESTIONS, firstSocketId);
        const secondQuestionsKey = dependencies.key(prefixes.QUESTIONS, secondSocketId);

        const [[, firstUserQuestions], [, secondUserQuestions],] = await dependencies.db.multi()
            .hgetall(firstQuestionsKey)
            .hgetall(secondQuestionsKey)
            .exec();

        return {
            first: parseQuestions(firstUserQuestions),
            second: parseQuestions(secondUserQuestions),
        }
    }

    /**
     * Ends the chatting phase and sends the questions to the other sides
     *
     * If one of the users disconnected, the function will emit failure event and disconnect remaining users.
     * Otherwise, chat stop event will be sent and answer timer will be started.
     *
     * @async
     * @param {string!} talkId
     * @param {string!} firstSocketId
     * @param {string!} secondSocketId
     */
    async function chatTimer(talkId, firstSocketId, secondSocketId) {
        const firstSocket = dependencies.sockets.get(firstSocketId);
        const secondSocket = dependencies.sockets.get(secondSocketId);
        const questions = await getQuestions(firstSocketId, secondSocketId);

        if (questions.first.length === 0 || questions.second.length === 0) {
            utils.safeError(errors.QUESTIONS_DC, firstSocket, secondSocket);
            return;
        }

        const payloadForFirst = {match_id: talkId, questions: questions.second};
        const payloadForSecond = {match_id: talkId, questions: questions.first};

        utils.safeEmit(events.CHAT_STOP, payloadForFirst, firstSocket);
        utils.safeEmit(events.CHAT_STOP, payloadForSecond, secondSocket);

        const firstSocketKey = dependencies.key(prefixes.SOCKET, firstSocketId);
        const secondSocketKey = dependencies.key(prefixes.SOCKET, secondSocketId);
        const matchedKey = dependencies.key(prefixes.MATCHED, prefixes.ID);

        await dependencies.db.multi()
            .hdel(firstSocketKey, matchedKey)
            .hdel(secondSocketKey, matchedKey)
            .exec();

        setTimeout(() => answerTimer(talkId, firstSocketId, secondSocketId), dependencies.timeouts.ANSWERS);
    }

    /**
     * Retrieves questions and answers for given socket ids, parses them and deletes them from the database
     *
     * If questions or answers of any user are not present, empty array will be returned
     *
     * @async
     * @param {string!} talkId
     * @param {string!} firstSocketId
     * @param {string!} secondSocketId
     *
     * @returns {Promise<{answers: {first: Array, second: Array}, questions: {first: Array, second: Array}}>}
     *  Questions and answers of both users
     */
    async function popQuestionsAndAnswers(talkId, firstSocketId, secondSocketId) {
        const firstAnswersKey = dependencies.key(prefixes.ANSWERS, talkId, firstSocketId);
        const secondAnswersKey = dependencies.key(prefixes.ANSWERS, talkId, secondSocketId);
        const firstQuestionsKey = dependencies.key(prefixes.QUESTIONS, firstSocketId);
        const secondQuestionsKey = dependencies.key(prefixes.QUESTIONS, secondSocketId);

        const [[, firstAnswers], [, firstQuestions], [, secondAnswers], [, secondQuestions]] = await dependencies.db
            .multi()
            .hgetall(firstAnswersKey)
            .hgetall(firstQuestionsKey)
            .hgetall(secondAnswersKey)
            .hgetall(secondQuestionsKey)
            .del(firstAnswersKey)
            .del(secondAnswersKey)
            .del(firstQuestionsKey)
            .del(secondQuestionsKey)
            .exec();

        return {
            answers: {
                first: parseAnswers(firstAnswers),
                second: parseAnswers(secondAnswers),
            },
            questions: {
                first: parseQuestions(firstQuestions),
                second: parseQuestions(secondQuestions),
            },
        }
    }

    /**
     * Retrieves the answers for socket ids and forwards them to the sockets
     *
     * If any of users did not provide answers, the function will emit failure event and disconnect remaining users.
     * Otherwise, the answer event will be sent and users will be disconnected.
     *
     * @param {string!} talkId
     * @param {string!} firstSocketId
     * @param {string!} secondSocketId
     */
    async function answerTimer(talkId, firstSocketId, secondSocketId) {
        const responses = await popQuestionsAndAnswers(talkId, firstSocketId, secondSocketId);

        const firstSocket = dependencies.sockets.get(firstSocketId);
        const secondSocket = dependencies.sockets.get(secondSocketId);

        if (responses.answers.first.length === 0 || responses.answers.second.length === 0) {
            utils.safeError(errors.ANSWER_TIMEOUT, firstSocket, secondSocket);
            return;
        }

        if (firstSocket && secondSocket) {
            const forFirst = {answers: responses.answers.second, questions: responses.questions.first};
            const forSecond = {answers: responses.answers.first, questions: responses.questions.second};

            utils.safeEmit(events.ANSWERS, forFirst, firstSocket);
            utils.safeEmit(events.ANSWERS, forSecond, secondSocket);
            utils.safeDisconnect(firstSocket, secondSocket);
        } else {
            utils.safeError(errors.ANSWER_DC, firstSocket, secondSocket);
        }
    }

    /**
     * Creates array from unparsed questions
     *
     * The array contains id of the question and question content for each question.
     *
     * @param {string!} unparsed - Raw, unparsed questions
     * @returns {Array<string>}
     */
    function parseQuestions(unparsed) {
        const questions = [];

        for (const [id, question] of Object.entries(unparsed)) {
            questions.push({id, question});
        }

        return questions;
    }

    /**
     * Creates array from unparsed answers
     *
     * The array contains id of the answer and answer content for each answer.
     *
     * @param {string!} unparsed - Raw, unparsed answers
     * @returns {Array<string>}
     */
    function parseAnswers(unparsed) {
        const answers = [];

        for (const [id, answer] of Object.entries(unparsed)) {
            answers.push({id, answer});
        }

        return answers;
    }

    return {
        matchTimer,
    }
}

module.exports = {makeTimers};