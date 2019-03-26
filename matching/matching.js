function createBin(from, to) {
    const set = new Set();

    function fits(user) {
        return user.score >= from && user.score < to;
    }

    function match(user) {
        if (isEmpty()) {
            add(user);
            return null;
        }

        const iterator = set[Symbol.iterator]();
        const matched = iterator.next().value;

        set.delete(matched);

        return {firstId: user.id, secondId: matched.id}
    }

    function add(user) {
        set.add(user);
    }

    function remove(user) {
        set.delete(user);
    }

    function isEmpty() {
        return set.size === 0;
    }

    return {
        fits,
        isEmpty,
        match,
        remove
    }
}

function createMatcher(dependencies) {
    const bins = [createBin(-1, -.5), createBin(-.5, 0), createBin(0, .5), createBin(.5, 1)];
    const userIdToBin = new Map();
    const userIdToUser = new Map();

    function put(user) {
        for (const bin of bins) {
            if (bin.fits(user)) {
                const match = bin.match(user);

                if (match == null) {
                    userIdToBin.set(user.id, bin);
                    userIdToUser.set(user.id, user);
                    setTimeout(() => onStarve(user.id), dependencies.starvationTimeout);
                    return;
                }

                userIdToBin.delete(match.secondId);
                userIdToUser.delete(match.secondId);

                dependencies.success(match);
            }
        }
    }

    function onStarve(userId) {
        const user = userIdToUser.get(userId);

        if (user === undefined) {
            return;
        }

        const bin = userIdToBin.get(user.id);
        bin.remove(user);

        for (const bin of bins) {
            if (!bin.isEmpty()) {
                userIdToBin.delete(userId);
                userIdToUser.delete(userId);
                dependencies.success(bin.match(user));
                return;
            }
        }

        userIdToBin.delete(userId);
        userIdToUser.delete(userId);
        dependencies.failure({id: user.id})
    }

    function remove(userId) {
        const user = userIdToUser.get(userId);

        if (user !== undefined) {
            userIdToBin.get(user.id).remove(user);
            userIdToBin.delete(userId);
            userIdToUser.delete(userId);
        }
    }

    return {
        put,
        remove,
    }
}

module.exports = {createMatcher};