/**
 * Types of events
 *
 * @enum {string}
 */
const Events = {
    ANSWERS: 'answers',
    CHAT_START: 'chat-start',
    CHAT_STOP: 'chat-stop',
    CONFIRM: 'confirm',
    CONNECT: 'connect',
    DEQUEUE: 'dequeue',
    DISCONNECT: 'disconnect',
    ERROR: 'failure',
    FIND: 'find',
    MATCH: 'match',
    MESSAGE: 'message',
};

/**
 * Error messages
 *
 * @enum {string}
 */
const Errors = {
    ANSWER_TIMEOUT: 'Answers: timeout',
    ANSWER_DC: 'Answers: disconnected',
    BAD_TOKEN: 'Invalid token',
    MATCH_DC: 'Matching: disconnected',
    MATCH_TIMEOUT: 'Matching: timeout',
    TALK_DC: 'Talk: disconnected',
    QUESTIONS_DC: 'Questions: disconnected',
};

/**
 * Prefixes used for creating keys in the database
 *
 * @enum {string}
 */
const Prefixes = {
    ANSWERS: 'answers',
    ID: 'id',
    MATCHED: 'matched',
    MATCHING: 'matching',
    QUESTIONS: 'questions',
    SOCKET: 'socket',
};

module.exports = {
    Errors,
    Events,
    Prefixes,
};