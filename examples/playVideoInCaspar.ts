
import {
	Conductor,
	DeviceType,
	ConductorOptions,
	Device,
	TimelineContentObject,
	TriggerType,
	TimelineTriggerTimeResult,
	DeviceOptions
} from '../src/index' // from 'timeline-state-resolver'
import { TimelineContentTypeCasparCg } from '../src/devices/casparCG'

// Initialize TSR:
const tsr = new Conductor({
	externalLog: console.log
})
tsr.on('error', e => console.log('error', e))
tsr.on('info', e => console.log('info', e))
tsr.on('command', (deviceId, cmd) => console.log('command', deviceId, cmd))
// tsr.on('timelineCallback', e => console.log('timelineCallback', e))

let a = async function () {

	await tsr.init()

	await tsr.addDevice('casparcg0', {
		type: DeviceType.CASPARCG,
		options: {
			host: '127.0.0.1'
			// port: 5250
		},
		externalLog: (...args) => console.log(...args)
	})

	// Setup mappings from layers to outputs:
	tsr.mapping = {
		'layer0': {
			device: DeviceType.CASPARCG,
			deviceId: 'casparcg0',
			channel: 1,
			layer: 10
		}
	}
	// Set a new timeline:
	let video0: TimelineContentObject = {
		id: 'video0',
		trigger: {
			type: TriggerType.TIME_ABSOLUTE,
			value: Date.now()
		},
		duration: 60 * 1000,
		LLayer: 'layer0',
		content: {
			type: TimelineContentTypeCasparCg.VIDEO,
			attributes: {
				file: 'AMB',
				loop: true
			}
			// playing: false,
			// pauseTime: Date.now()
		}
	}
	console.log('set timeline')
	tsr.timeline = [
		video0
	]

}
a().catch(e => console.log(e))
