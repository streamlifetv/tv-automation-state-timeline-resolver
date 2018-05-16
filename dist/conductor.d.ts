/// <reference types="node" />
import { TimelineObject, TriggerType } from 'superfly-timeline';
import { Device, DeviceOptions } from './devices/device';
import { Mappings } from './devices/mapping';
import { EventEmitter } from 'events';
export interface TimelineContentObject extends TimelineObject {
    roId: string;
}
export { TriggerType };
export interface TimelineTriggerTimeResult {
    time: number;
    objectIds: Array<string>;
}
export { Device } from './devices/device';
export interface ConductorOptions {
    devices: {
        [deviceName: string]: DeviceOptions;
    };
    initializeAsClear: boolean;
    getCurrentTime: () => number;
    autoInit?: boolean;
}
/**
 * The main class that serves to interface with all functionality.
 */
export declare class Conductor extends EventEmitter {
    private _timeline;
    private _mapping;
    private _options;
    private devices;
    private _getCurrentTime?;
    private _nextResolveTime;
    private _resolveTimelineTrigger;
    private _isInitialized;
    private _timelineCallback;
    constructor(options: ConductorOptions);
    /**
     * Initializes the devices that were passed as options.
     */
    init(): Promise<void>;
    /**
     * Returns a nice, synchronized time.
     */
    getCurrentTime(): number;
    mapping: Mappings;
    timeline: Array<TimelineContentObject>;
    getDevices(): Array<Device>;
    getDevice(deviceId: any): Device;
    addDevice(deviceId: any, deviceOptions: DeviceOptions): Promise<any>;
    removeDevice(deviceId: string): Promise<boolean>;
    destroy(): Promise<void>;
    /**
     * Sets up the devices as they were passed to the constructor via the options object.
     * @todo: allow for runtime reconfiguration of devices.
     */
    private _initializeDevices();
    /**
     * Resets the resolve-time, so that the resolving will happen for the point-in time NOW
     * next time
     */
    private _resetResolver();
    /**
     * This is the main resolve-loop.
     */
    private _triggerResolveTimeline(timeUntilTrigger?);
    /**
     * Resolves the timeline for the next resolve-time, generates the commands and passes on the commands.
     */
    private _resolveTimeline();
    private _fixNowObjects(now);
}
