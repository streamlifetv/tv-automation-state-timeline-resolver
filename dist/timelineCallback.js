"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
class TimelineCallback extends events_1.EventEmitter {
    constructor(getCurrentTime) {
        super();
        this._queue = [];
        this._checkQueueTimeout = 0;
        this.getCurrentTime = getCurrentTime;
    }
    checkQueue() {
        clearTimeout(this._checkQueueTimeout);
        let now = this.getCurrentTime();
        let nextTime = now + 99999;
        for (let i = this._queue.length - 1; i >= 0; i--) {
            let o = this._queue[i];
            if (o.time <= now) {
                this.emit('callback', o.time, o.id, o.callbackName, o.data);
                this._queue.splice(i, 1);
            }
            else {
                if (o.time < nextTime)
                    nextTime = o.time;
            }
        }
        // next check
        let timeToNext = Math.min(1000, nextTime - now);
        this._checkQueueTimeout = setTimeout(() => {
            this.checkQueue();
        }, timeToNext);
    }
    queue(time, id, callbackName, data) {
        this._queue.push({ time, id, callbackName, data });
        this.checkQueue();
    }
}
exports.TimelineCallback = TimelineCallback;
//# sourceMappingURL=timelineCallback.js.map