CONFIG = { 
    app: {
        port: process.env.CORE_PORT || 8080
    },
    redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        keySeparator: ':',
    },
    micros: {
        match: {
            url: process.env.MATCH_URL,
        },
        auth: {
            url: process.env.AUTH_URL,
        }
    },
    timeouts: {
        CONFIRM: 10 * 1000,
        CHAT: 20 * 1000,
        ANSWERS: 10 * 1000,
    },
};

module.exports = {CONFIG};