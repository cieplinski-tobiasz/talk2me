const app = require('http').createServer();
const io = require('socket.io')(app);
const ext = require('./ext');
const Redis = require('ioredis');
const handlers = require('./handlers');
const utils = require('./utils');
const timersFactory = require('./timers');
const uuid = require('uuid/v1');
const events = require('./constants').Events;
const config = require('./config').CONFIG;

app.listen(config.app.port);

const db = new Redis({host: config.redis.host, port: config.redis.port});
db.on(events.CONNECT, () => db.flushdb());

const sockets = new Map();
const key = utils.makeKey(config.redis.keySeparator);

const timers = timersFactory.makeTimers({db, sockets, timeouts: config.timeouts, key});

const matchHandlers = handlers.makeMatchHandlers({uuid, sockets, db, key, timers, timeouts: config.timeouts});
const matchHook = utils.makeSocketHook(events.MATCH, matchHandlers.onMatch);
const dequeueHook = utils.makeSocketHook(events.DEQUEUE, matchHandlers.onDequeue);

const matchService = ext.matchService({url: config.micros.match.url, sockets, matchHook, dequeueHook});
const clientHandlers = handlers.makeClientEventsHandlers({timers, db, sockets, uuid, matchService, key});

const clientHooks = [
    utils.makeSocketHook(events.ANSWERS, clientHandlers.onAnswer),
    utils.makeSocketHook(events.CONFIRM, clientHandlers.onConfirm),
    utils.makeSocketHook(events.CONNECT, clientHandlers.onConnect, false),
    utils.makeSocketHook(events.DISCONNECT, clientHandlers.onDisconnect, false),
    utils.makeSocketHook(events.FIND, clientHandlers.onFind),
    utils.makeSocketHook(events.MESSAGE, clientHandlers.onMessage),
];

io.on(events.CONNECT, socket => {
    clientHandlers.onConnect(socket);
    clientHooks.forEach(hook => hook(socket));
});
