const app = require('http').createServer();
const io = require('socket.io')(app);
const events = require('./constants').Events;
const matching = require('./matching');
const config = require('./config').CONFIG;

app.listen(8080);

function onMatch(socket) {
    return match => socket.emit(events.MATCH, JSON.stringify(match));
}

function onFail(socket) {
    return userId => socket.emit(events.DEQUEUE, JSON.stringify(userId));
}

io.on(events.CONNECT, socket => {
    const success = onMatch(socket);
    const failure = onFail(socket);
    const matcher = matching.createMatcher({success, failure, starvationTimeout: config.timeouts.starvation});

    socket.on(events.MATCH, payload => {
        const user = JSON.parse(payload);
        matcher.put(user);
    });

    socket.on(events.DEQUEUE, payload => {
        const userId = JSON.parse(payload).id;
        matcher.remove(userId);
    })
});
