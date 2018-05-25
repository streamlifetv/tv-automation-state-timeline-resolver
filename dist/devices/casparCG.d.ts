import { Device, DeviceOptions } from './device';
import { DeviceType } from './mapping';
import { TimelineState } from 'superfly-timeline';
import { CasparCG as StateNS } from 'casparcg-state';
import { Conductor } from '../conductor';
export interface CasparCGDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd) => void;
    };
}
export interface CasparCGOptions {
    host: string;
    port: number;
}
export declare enum TimelineContentTypeCasparCg {
    VIDEO = "video",
    IP = "ip",
    INPUT = "input",
    TEMPLATE = "template",
    ROUTE = "route",
    RECORD = "record",
    AUDIO = "audio",
}
export declare class CasparCGDevice extends Device {
    private _ccg;
    private _conductor;
    private _ccgState;
    private _queue;
    private _commandReceiver;
    private _timeToTimecodeMap;
    constructor(deviceId: string, deviceOptions: CasparCGDeviceOptions, options: any, conductor: Conductor);
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(connectionOptions: CasparCGOptions): Promise<boolean>;
    terminate(): Promise<boolean>;
    /**
     * Generates an array of CasparCG commands by comparing the newState against the oldState, or the current device state.
     * @param newState The state to target.
     * @param oldState The "current" state of the device. If omitted, will use the actual current state.
     */
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    readonly connected: boolean;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: (string | number)[][];
    /**
     * Takes a timeline state and returns a CasparCG State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToCaspar(timelineState: TimelineState): StateNS.State;
    private _diffStates(oldState, newState);
    private _addToQueue(commandsToAchieveState, oldState, time);
    private _defaultCommandReceiver(time, cmd);
    private convertTimeToTimecode(time);
}
