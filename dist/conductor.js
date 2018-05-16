"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const superfly_timeline_1 = require("superfly-timeline");
exports.TriggerType = superfly_timeline_1.TriggerType;
const casparCG_1 = require("./devices/casparCG");
const abstract_1 = require("./devices/abstract");
const mapping_1 = require("./devices/mapping");
const atem_1 = require("./devices/atem");
const events_1 = require("events");
const timelineCallback_1 = require("./timelineCallback");
const LOOKAHEADTIME = 5000; // Will look ahead this far into the future
const PREPARETIME = 2000; // Will prepare commands this time before the event is to happen
const MINTRIGGERTIME = 10; // Minimum time between triggers
const MINTIMEUNIT = 1; // Minimum unit of time
var device_1 = require("./devices/device");
exports.Device = device_1.Device;
/**
 * The main class that serves to interface with all functionality.
 */
class Conductor extends events_1.EventEmitter {
    constructor(options) {
        super();
        this._timeline = [];
        this._mapping = {};
        this.devices = {};
        this._nextResolveTime = 0;
        this._isInitialized = false;
        this._options = options;
        if (options.getCurrentTime)
            this._getCurrentTime = options.getCurrentTime;
        setInterval(() => {
            if (this.timeline) {
                this._resolveTimeline();
            }
        }, 2500);
        this._timelineCallback = new timelineCallback_1.TimelineCallback(this.getCurrentTime);
        this._timelineCallback.on('callback', (...args) => {
            this.emit('timelineCallback', ...args);
        });
        if (options.autoInit)
            this.init();
    }
    /**
     * Initializes the devices that were passed as options.
     */
    init() {
        return this._initializeDevices()
            .then(() => {
            this._isInitialized = true;
            this._resetResolver();
        });
    }
    /**
     * Returns a nice, synchronized time.
     */
    getCurrentTime() {
        // TODO: Implement time sync, NTP procedure etc...
        if (this._getCurrentTime) {
            // console.log(this._getCurrentTime)
            // return 0
            return this._getCurrentTime();
        }
        else {
            return Date.now();
        }
    }
    get mapping() {
        return this._mapping;
    }
    set mapping(mapping) {
        // Set mapping
        // re-resolve timeline
        this._mapping = mapping;
        _.each(this.devices, (device) => {
            device.mapping = this.mapping;
        });
        if (this._timeline) {
            this._resolveTimeline();
        }
    }
    get timeline() {
        return this._timeline;
    }
    set timeline(timeline) {
        this._timeline = timeline;
        // We've got a new timeline, anything could've happened at this point
        // Highest priority right now is to determine if any commands have to be sent RIGHT NOW
        // After that, we'll move further ahead in time, creating commands ready for scheduling
        this._resetResolver();
    }
    getDevices() {
        return _.values(this.devices);
    }
    getDevice(deviceId) {
        return this.devices[deviceId];
    }
    addDevice(deviceId, deviceOptions) {
        let newDevice = null;
        if (deviceOptions.type === mapping_1.DeviceType.ABSTRACT) {
            // Add Abstract device:
            newDevice = new abstract_1.AbstractDevice(deviceId, deviceOptions, {
                // TODO: Add options
                getCurrentTime: () => { return this.getCurrentTime(); }
            });
        }
        else if (deviceOptions.type === mapping_1.DeviceType.CASPARCG) {
            // Add CasparCG device:
            newDevice = new casparCG_1.CasparCGDevice(deviceId, deviceOptions, {
                // TODO: Add options
                getCurrentTime: () => { return this.getCurrentTime(); }
            });
        }
        else if (deviceOptions.type === mapping_1.DeviceType.ATEM) {
            newDevice = new atem_1.AtemDevice(deviceId, deviceOptions, {
                // TODO: Add options
                getCurrentTime: () => { return this.getCurrentTime(); }
            });
        }
        if (newDevice) {
            console.log('Initializing ' + mapping_1.DeviceType[deviceOptions.type] + '...');
            this.devices[deviceId] = newDevice;
            newDevice.mapping = this.mapping;
            return newDevice.init(deviceOptions.options)
                .then((device) => {
                console.log(mapping_1.DeviceType[deviceOptions.type] + ' initialized!');
                return device;
            });
        }
        // if we cannot find a device:
        return new Promise((resolve) => {
            resolve(false);
        });
    }
    removeDevice(deviceId) {
        let device = this.devices[deviceId];
        if (device) {
            let ps = device.terminate();
            ps.then((res) => {
                if (res) {
                    delete this.devices[deviceId];
                }
            });
            return ps;
        }
        else {
            return new Promise((resolve) => resolve(false));
        }
    }
    destroy() {
        return Promise.all(_.map(_.keys(this.devices), (deviceId) => {
            this.removeDevice(deviceId);
        }))
            .then(() => {
            return;
        });
    }
    /**
     * Sets up the devices as they were passed to the constructor via the options object.
     * @todo: allow for runtime reconfiguration of devices.
     */
    _initializeDevices() {
        const ps = [];
        _.each(this._options.devices, (deviceOptions, deviceId) => {
            ps.push(this.addDevice(deviceId, deviceOptions));
        });
        return Promise.all(ps);
    }
    /**
     * Resets the resolve-time, so that the resolving will happen for the point-in time NOW
     * next time
     */
    _resetResolver() {
        this._nextResolveTime = 0; // This will cause _resolveTimeline() to generate the state for NOW
        this._triggerResolveTimeline();
    }
    /**
     * This is the main resolve-loop.
     */
    _triggerResolveTimeline(timeUntilTrigger) {
        // console.log('_triggerResolveTimeline', timeUntilTrigger)
        if (this._resolveTimelineTrigger) {
            clearTimeout(this._resolveTimelineTrigger);
        }
        if (timeUntilTrigger) {
            // resolve at a later stage
            this._resolveTimelineTrigger = setTimeout(() => {
                this._resolveTimeline();
            }, timeUntilTrigger);
        }
        else {
            // resolve right away:
            this._resolveTimeline();
        }
    }
    /**
     * Resolves the timeline for the next resolve-time, generates the commands and passes on the commands.
     */
    _resolveTimeline() {
        if (!this._isInitialized) {
            console.log('TSR is not initialized yet');
            return;
        }
        const now = this.getCurrentTime();
        let resolveTime = this._nextResolveTime || now;
        // console.log('resolveTimeline ' + resolveTime + ' -----------------------------')
        this._fixNowObjects(resolveTime);
        let timeline = this.timeline;
        // Generate the state for that time:
        let tlState = superfly_timeline_1.Resolver.getState(timeline, resolveTime);
        // Split the state into substates that are relevant for each device
        let getFilteredLayers = (layers, device) => {
            let filteredState = {};
            _.each(layers, (o, layerId) => {
                let mapping = this._mapping[o.LLayer + ''];
                if (mapping) {
                    if (mapping.deviceId === device.deviceId &&
                        mapping.device === device.deviceType) {
                        filteredState[layerId] = o;
                    }
                }
            });
            return filteredState;
        };
        _.each(this.devices, (device /*, deviceName: string*/) => {
            // The subState contains only the parts of the state relevant to that device
            let subState = {
                time: tlState.time,
                LLayers: getFilteredLayers(tlState.LLayers, device),
                GLayers: getFilteredLayers(tlState.GLayers, device)
            };
            // Pass along the state to the device, it will generate its commands and execute them:
            device.handleState(subState);
        });
        // Now that we've handled this point in time, it's time to determine what the next point in time is:
        // console.log(tlState.time)
        const timelineWindow = superfly_timeline_1.Resolver.getTimelineInWindow(timeline, tlState.time, tlState.time + LOOKAHEADTIME);
        const nextEvents = superfly_timeline_1.Resolver.getNextEvents(timelineWindow, tlState.time + MINTIMEUNIT, 1);
        let timeUntilNextResolve = LOOKAHEADTIME;
        const now2 = this.getCurrentTime();
        if (nextEvents.length) {
            let nextEvent = nextEvents[0];
            // console.log('nextEvent', nextEvent)
            timeUntilNextResolve = Math.max(MINTRIGGERTIME, Math.min(LOOKAHEADTIME, (nextEvent.time - now2) - PREPARETIME));
            // resolve at nextEvent.time next time:
            this._nextResolveTime = nextEvent.time;
        }
        else {
            // there's nothing ahead in the timeline
            // Tell the devices that the future is clear:
            _.each(this.devices, (device) => {
                device.clearFuture(tlState.time);
            });
            // resolve at "now" then next time:
            this._nextResolveTime = 0;
        }
        // Special function: send callback to Core
        _.each(tlState.GLayers, (o) => {
            if (o.content.callBack) {
                this._timelineCallback.queue(resolveTime, o.id, o.content.callBack, o.content.callBackData);
            }
        });
        this._triggerResolveTimeline(timeUntilNextResolve);
    }
    _fixNowObjects(now) {
        let objectsFixed = [];
        _.each(this.timeline, (o) => {
            if ((o.trigger || {}).type === superfly_timeline_1.TriggerType.TIME_ABSOLUTE &&
                o.trigger.value === 'now') {
                o.trigger.value = now; // set the objects to "now" so that they are resolved correctly right now
                objectsFixed.push(o.id);
            }
        });
        if (objectsFixed.length) {
            let r = {
                time: now,
                objectIds: objectsFixed
            };
            this.emit('setTimelineTriggerTime', r);
        }
    }
}
exports.Conductor = Conductor;
//# sourceMappingURL=conductor.js.map