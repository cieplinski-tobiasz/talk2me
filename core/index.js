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
const key = utils.createKey(config.redis.keySeparator);

const timers = timersFactory.createTimers({db, sockets, timeouts: config.timeouts, key});

const matchHandlers = handlers.createMatchHandlers({uuid, sockets, db, key, timers, timeouts: config.timeouts});
const attachMatchHook = utils.createSocketHook(events.MATCH, matchHandlers.onMatch);
const attachDequeueHook = utils.createSocketHook(events.DEQUEUE, matchHandlers.onDequeue);

const matchService = ext.matchService({url: config.micros.match.url, sockets, attachMatchHook, attachDequeueHook});
const clientHandlers = handlers.createClientEventsHandlers({timers, db, sockets, uuid, matchService, key});

const clientHooks = [
    utils.createSocketHook(events.ANSWERS, clientHandlers.onAnswer),
    utils.createSocketHook(events.CONFIRM, clientHandlers.onConfirm),
    utils.createSocketHook(events.CONNECT, clientHandlers.onConnect, false),
    utils.createSocketHook(events.DISCONNECT, clientHandlers.onDisconnect, false),
    utils.createSocketHook(events.FIND, clientHandlers.onFind),
    utils.createSocketHook(events.MESSAGE, clientHandlers.onMessage),
];

io.on(events.CONNECT, socket => {
    clientHandlers.onConnect(socket);
    clientHooks.forEach(attachHook => attachHook(socket));
});
