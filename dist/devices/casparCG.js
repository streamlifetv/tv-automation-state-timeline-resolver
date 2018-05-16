"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const casparcg_connection_1 = require("casparcg-connection");
const mapping_1 = require("./mapping");
const casparcg_state_1 = require("casparcg-state");
class CasparCGDevice extends device_1.Device {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._queue = {};
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._ccgState = new casparcg_state_1.CasparCGState({
            currentTime: this.getCurrentTime
        });
    }
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(connectionOptions) {
        this._ccg = new casparcg_connection_1.CasparCG({
            host: connectionOptions.host,
            port: connectionOptions.port,
            autoConnect: true,
            onConnectionChanged: (connected) => {
                this.emit('connectionChanged', connected);
            }
        });
        return Promise.all([
            new Promise((resolve, reject) => {
                this._ccg.info()
                    .then((command) => {
                    this._ccgState.initStateFromChannelInfo(_.map(command.response.data, (obj) => {
                        return {
                            channelNo: obj.channel,
                            videoMode: obj.format.toUpperCase(),
                            fps: obj.channelRate
                        };
                    }));
                    resolve(true);
                }).catch((e) => reject(e));
            }), new Promise((resolve, reject) => {
                this._ccg.time(1).then((cmd) => {
                    let segments = cmd.response.data.split(':');
                    let time = 0;
                    // fields:
                    time += Number(segments[3]) * 1000 / 50;
                    // seconds
                    time += Number(segments[2]) * 1000;
                    // minutes
                    time += Number(segments[1]) * 60 * 1000;
                    // hours
                    time += Number(segments[0]) * 60 * 60 * 1000;
                    this._timeToTimecodeMap = { time: this.getCurrentTime(), timecode: time };
                    resolve(true);
                }).catch(() => reject());
            })
        ]).then(() => {
            return true;
        });
    }
    terminate() {
        return new Promise((resolve) => {
            this._ccg.disconnect();
            this._ccg.onDisconnected = () => {
                resolve();
            };
        });
    }
    /**
     * Generates an array of CasparCG commands by comparing the newState against the oldState, or the current device state.
     * @param newState The state to target.
     * @param oldState The "current" state of the device. If omitted, will use the actual current state.
     */
    handleState(newState) {
        let oldState = this.getStateBefore(newState.time) || { time: 0, LLayers: {}, GLayers: {} };
        let newCasparState = this.convertStateToCaspar(newState);
        let oldCasparState = this.convertStateToCaspar(oldState);
        let commandsToAchieveState = this._diffStates(oldCasparState, newCasparState);
        // clear any queued commands on this time:
        let now = this.getCurrentTime();
        for (let token in this._queue) {
            if (this._queue[token] < now) {
                delete this._queue[token];
            }
            else if (this._queue[token] === newState.time) {
                this._commandReceiver(this.getCurrentTime(), new casparcg_connection_1.AMCP.ScheduleRemoveCommand(token));
                delete this._queue[token];
            }
        }
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, oldState, newState.time);
        // store the new state, for later use:
        this.setState(newState);
    }
    clearFuture(clearAfterTime) {
        // Clear any scheduled commands after this time
        for (let token in this._queue) {
            if (this._queue[token] > clearAfterTime)
                this._commandReceiver(this.getCurrentTime(), new casparcg_connection_1.AMCP.ScheduleRemoveCommand(token));
        }
    }
    get connected() {
        // Returns connection status
        return this._ccg.connected;
    }
    get deviceType() {
        return mapping_1.DeviceType.CASPARCG;
    }
    get deviceName() {
        return 'CasparCG ' + this._ccg.host + ':' + this._ccg.port;
    }
    get queue() {
        if (this._queue) {
            return _.map(this._queue, (val, index) => [val, index]);
        }
        else {
            return [];
        }
    }
    /**
     * Takes a timeline state and returns a CasparCG State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToCaspar(timelineState) {
        const caspar = new casparcg_state_1.CasparCG.State();
        _.each(timelineState.LLayers, (layer, layerName) => {
            const foundMapping = this.mapping[layerName];
            if (foundMapping.device === mapping_1.DeviceType.CASPARCG &&
                _.has(foundMapping, 'channel') &&
                _.has(foundMapping, 'layer')) {
                const mapping = {
                    device: mapping_1.DeviceType.CASPARCG,
                    deviceId: foundMapping.deviceId,
                    channel: foundMapping.channel || 0,
                    layer: foundMapping.layer || 0
                };
                const channel = caspar.channels[mapping.channel] ? caspar.channels[mapping.channel] : new casparcg_state_1.CasparCG.Channel();
                channel.channelNo = Number(mapping.channel) || 1;
                // @todo: check if we need to get fps.
                channel.fps = 50;
                caspar.channels[channel.channelNo] = channel;
                let stateLayer = null;
                if (layer.content.type === 'video') {
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.MEDIA,
                        media: layer.content.attributes.file,
                        playTime: layer.resolved.startTime || null,
                        playing: true,
                        looping: layer.content.attributes.loop,
                        seek: layer.content.attributes.seek
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === 'ip') {
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.MEDIA,
                        media: layer.content.attributes.uri,
                        playTime: layer.resolved.startTime || null,
                        playing: true,
                        seek: 0 // ip inputs can't be seeked
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === 'input') {
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.INPUT,
                        media: 'decklink',
                        input: {
                            device: layer.content.attributes.device
                        },
                        playing: true,
                        playTime: null
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === 'template') {
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.TEMPLATE,
                        media: layer.content.attributes.name,
                        playTime: layer.resolved.startTime || null,
                        playing: true,
                        templateType: layer.content.attributes.type || 'html',
                        templateData: layer.content.attributes.data,
                        cgStop: layer.content.attributes.useStopCommand
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === 'route') {
                    if (layer.content.attributes.LLayer) {
                        let routeMapping = this.mapping[layer.content.attributes.LLayer];
                        if (routeMapping) {
                            layer.content.attributes.channel = routeMapping.channel;
                            layer.content.attributes.layer = routeMapping.layer;
                        }
                    }
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.ROUTE,
                        media: 'route',
                        route: {
                            channel: layer.content.attributes.channel,
                            layer: layer.content.attributes.layer
                        },
                        playing: true,
                        playTime: null // layer.resolved.startTime || null
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === 'record') {
                    if (layer.resolved.startTime) {
                        let l = {
                            layerNo: mapping.layer,
                            content: casparcg_state_1.CasparCG.LayerContentType.RECORD,
                            media: layer.content.attributes.file,
                            encoderOptions: layer.content.attributes.encoderOptions,
                            playing: true,
                            playTime: layer.resolved.startTime
                        };
                        stateLayer = l;
                    }
                }
                if (!stateLayer) {
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.NOTHING,
                        playing: false,
                        pauseTime: 0
                    };
                    stateLayer = l;
                }
                if (stateLayer) {
                    if (layer.content.transitions) {
                        switch (layer.content.type) {
                            case 'video' || 'ip' || 'template' || 'input' || 'route':
                                // create transition object
                                let media = stateLayer.media;
                                let transitions = {};
                                if (layer.content.transitions.inTransition) {
                                    transitions.inTransition = new casparcg_state_1.CasparCG.Transition(layer.content.transitions.inTransition.type, layer.content.transitions.inTransition.duration, layer.content.transitions.inTransition.easing, layer.content.transitions.inTransition.direction);
                                }
                                if (layer.content.transitions.outTransition) {
                                    transitions.outTransition = new casparcg_state_1.CasparCG.Transition(layer.content.transitions.outTransition.type, layer.content.transitions.outTransition.duration, layer.content.transitions.outTransition.easing, layer.content.transitions.outTransition.direction);
                                }
                                stateLayer.media = new casparcg_state_1.CasparCG.TransitionObject(media, {
                                    inTransition: transitions.inTransition,
                                    outTransition: transitions.outTransition
                                });
                                break;
                            default:
                                // create transition using mixer
                                break;
                        }
                    }
                    if (layer.resolved.mixer) {
                        // just pass through values here:
                        let mixer = {};
                        _.each(layer.resolved.mixer, (value, property) => {
                            mixer[property] = value;
                        });
                        stateLayer.mixer = mixer;
                    }
                    stateLayer.layerNo = mapping.layer;
                    channel.layers[mapping.layer] = stateLayer;
                }
            }
        });
        return caspar;
    }
    _diffStates(oldState, newState) {
        let commands = this._ccgState.diffStates(oldState, newState);
        let returnCommands = [];
        _.each(commands, (cmdObject) => {
            returnCommands = returnCommands.concat(cmdObject.cmds);
        });
        return returnCommands;
    }
    _addToQueue(commandsToAchieveState, oldState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            if (cmd._commandName === 'PlayCommand' && cmd._objectParams.clip !== 'empty') {
                if (oldState.time > 0 && time > this.getCurrentTime()) { // @todo: put the loadbg command just after the oldState.time when convenient?
                    let loadbgCmd = Object.assign({}, cmd); // make a deep copy
                    loadbgCmd._commandName = 'LoadbgCommand';
                    let command = casparcg_connection_1.AMCPUtil.deSerialize(loadbgCmd, 'id');
                    let scheduleCommand = command;
                    if (oldState.time >= this.getCurrentTime()) {
                        scheduleCommand = new casparcg_connection_1.AMCP.ScheduleSetCommand({ token: command.token, timecode: this.convertTimeToTimecode(oldState.time), command });
                    }
                    this._commandReceiver(this.getCurrentTime(), scheduleCommand);
                    cmd._objectParams = {
                        channel: cmd.channel,
                        layer: cmd.layer,
                        noClear: cmd._objectParams.noClear
                    };
                }
            }
            let command = casparcg_connection_1.AMCPUtil.deSerialize(cmd, 'id');
            let scheduleCommand = new casparcg_connection_1.AMCP.ScheduleSetCommand({ token: command.token, timecode: this.convertTimeToTimecode(time), command });
            if (time <= this.getCurrentTime()) {
                this._commandReceiver(this.getCurrentTime(), command);
            }
            else {
                this._commandReceiver(this.getCurrentTime(), scheduleCommand);
                this._queue[command.token] = time;
            }
        });
    }
    _defaultCommandReceiver(time, cmd) {
        time = time;
        this._ccg.do(cmd)
            .then((resCommand) => {
            if (this._queue[resCommand.token]) {
                delete this._queue[resCommand.token];
            }
        }).catch((e) => {
            console.log(e);
            if (cmd.name === 'ScheduleSetCommand') {
                delete this._queue[cmd.getParam('command').token];
            }
        });
    }
    convertTimeToTimecode(time) {
        let relTime = time - this._timeToTimecodeMap.time;
        let timecodeTime = this._timeToTimecodeMap.timecode + relTime;
        let timecode = [
            ('0' + (Math.floor(timecodeTime / 3.6e6) % 24)).substr(-2),
            ('0' + (Math.floor(timecodeTime / 6e4) % 60)).substr(-2),
            ('0' + (Math.floor(timecodeTime / 1e3) % 60)).substr(-2),
            ('0' + (Math.floor(timecodeTime / 20) % 50)).substr(-2)
        ];
        return timecode.join(':');
    }
}
exports.CasparCGDevice = CasparCGDevice;
//# sourceMappingURL=casparCG.js.map