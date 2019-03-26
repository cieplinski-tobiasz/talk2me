const events = require('./constants').Events;

/**
 * Creates a function that hooks an event listener to the socket
 *
 * @param {string} event - Name of the event
 * @param {function} handler - Handler of the event, accepting socket and payload parameters
 * @param {boolean} toJson - If true, the payload will be parsed to json before calling the hander
 *
 * @returns {function(socket=): *}
 */
function createSocketHook(event, handler, toJson = true) {
    return socket => socket.on(event, payload => {
        const data = toJson ? JSON.parse(payload) : payload;
        handler(socket, data)
    });
}

/**
 * Sends an error event with given message if the socket is connected
 *
 * @param {string!} errorMessage
 * @param sockets - Sockets the error will be emitted to
 */
function safeError(errorMessage, ...sockets) {
    sockets
        .filter(socket => socket)
        .forEach(socket => {
            socket.emit(events.ERROR, errorMessage);
            socket.disconnect(true);
        });
}

/**
 * Disconnects the sockets if they are connected
 *
 * @param sockets - Sockets to disconnect
 */
function safeDisconnect(...sockets) {
    sockets
        .filter(socket => socket)
        .forEach(socket => socket.disconnect(true));
}

/**
 * Emits the event with given payload to the sockets if they are connected
 *
 * @param {string!} event - Name of the event
 * @param {Object?} payload - Payload of the event
 * @param sockets - Sockets to disconnect
 */
function safeEmit(event, payload, ...sockets) {
    sockets
        .filter(socket => socket)
        .forEach(socket => {
            if (payload) {
                socket.emit(event, JSON.stringify(payload));
            } else {
                socket.emit(event);
            }
        });
}

/**
 * Creates a function that joins arguments with given separator
 *
 * @param separator {string!} - Separator of the arguments
 * @returns {function(...[*]): string}
 */
function createKey(separator) {

    /**
     * Joins the given arguments with separator from the closure
     *
     * @param args - Arguments to join
     * @returns {string} - Joined arguments
     */
    function key(...args) {
        return args.join(separator)
    }

    return key
}

module.exports = {
    createKey,
    createSocketHook,
    safeDisconnect,
    safeEmit,
    safeError,
};