/// <reference types="node" />
import { EventEmitter } from 'events';
export declare class TimelineCallback extends EventEmitter {
    getCurrentTime: () => number;
    private _queue;
    private _checkQueueTimeout;
    constructor(getCurrentTime: () => number);
    checkQueue(): void;
    queue(time: any, id: any, callbackName: any, data: any): void;
}
