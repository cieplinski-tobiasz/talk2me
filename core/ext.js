const io = require('socket.io-client');
const events = require('./constants').Events;

/**
 * Returns an object used for interaction with matching microservice
 *
 * The function connects to the microservice and attaches handlers
 * of the events emitted by the matching microservice.
 *
 * @param {string!} dependencies.url - URL of the matching microservice
 * @param {Map<string, socket>} dependencies.sockets
 * @param dependencies.attachMatchHook
 * @param dependencies.attachDequeueHook
 * @returns {{enqueue: enqueue, dequeue: dequeue}}
 */
function matchService(dependencies) {
    const socket = io(dependencies.url);

    dependencies.attachMatchHook(socket);
    dependencies.attachDequeueHook(socket);

    /**
     * Enqueues the user with given socket id to the matching service
     *
     * @param {string!} socketId
     * @param {number!} score
     */
    async function enqueue(socketId, score) {
        socket.emit(events.MATCH, JSON.stringify({id: socketId, score}));
    }

    /**
     * Dequeues the user with given socket id to the matching service
     *
     * @param {string!} socketId
     */
    async function dequeue(socketId) {
        socket.emit(events.DEQUEUE, JSON.stringify({id: socketId}))
    }

    return {
        dequeue,
        enqueue,
    }
}

module.exports = {
    matchService,
};
