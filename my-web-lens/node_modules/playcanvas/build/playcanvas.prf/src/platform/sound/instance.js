import { EventHandler } from "../../core/event-handler.js";
import { math } from "../../core/math/math.js";
const STATE_PLAYING = 0;
const STATE_PAUSED = 1;
const STATE_STOPPED = 2;
const STOP_NEVER_DELAY = 1e6;
function capTime(time, duration) {
	return time % duration || 0;
}
class SoundInstance extends EventHandler {
	static EVENT_PLAY = "play";
	static EVENT_PAUSE = "pause";
	static EVENT_RESUME = "resume";
	static EVENT_STOP = "stop";
	static EVENT_END = "end";
	source = null;
	constructor(manager, sound, options) {
		super();
		this._manager = manager;
		this._volume = options.volume !== void 0 ? math.clamp(Number(options.volume) || 0, 0, 1) : 1;
		this._pitch = options.pitch !== void 0 ? Math.max(0.01, Number(options.pitch) || 0) : 1;
		this._loop = !!(options.loop !== void 0 ? options.loop : false);
		this._sound = sound;
		this._state = STATE_STOPPED;
		this._suspended = false;
		this._suspendEndEvent = 0;
		this._suspendInstanceEvents = false;
		this._playWhenLoaded = true;
		this._startTime = Math.max(0, Number(options.startTime) || 0);
		this._duration = Math.max(0, Number(options.duration) || 0);
		this._startOffset = null;
		this._onPlayCallback = options.onPlay;
		this._onPauseCallback = options.onPause;
		this._onResumeCallback = options.onResume;
		this._onStopCallback = options.onStop;
		this._onEndCallback = options.onEnd;
		this._startedAt = 0;
		this._currentTime = 0;
		this._currentOffset = 0;
		this._sourceOffset = 0;
		this._sourceOffsetAt = 0;
		this._sourceLooping = false;
		this._regionStopPending = false;
		this._inputNode = null;
		this._connectorNode = null;
		this._firstNode = null;
		this._lastNode = null;
		this._waitingContextSuspension = false;
		if (!this._manager.context) {
			return;
		}
		this._initializeNodes();
		this._endedHandler = this._onEnded.bind(this);
	}
	set currentTime(value) {
		value = Number(value) || 0;
		if (value < 0) return;
		const duration = this.duration;
		const currentTime = duration ? capTime(value, duration) : value;
		if (this._state === STATE_PLAYING) {
			const suspend = this._suspendInstanceEvents;
			this._suspendInstanceEvents = true;
			this.stop();
			this._startOffset = currentTime;
			this.play();
			this._suspendInstanceEvents = suspend;
		} else {
			this._startOffset = currentTime;
			this._currentTime = currentTime;
		}
	}
	get currentTime() {
		if (this._startOffset !== null) {
			return this._startOffset;
		}
		if (this._state === STATE_PAUSED) {
			return this._currentTime;
		}
		if (this._state === STATE_STOPPED || !this.source) {
			return 0;
		}
		this._updateCurrentTime();
		return this._currentTime;
	}
	set duration(value) {
		this._duration = Math.max(0, Number(value) || 0);
		const isPlaying = this._state === STATE_PLAYING;
		this.stop();
		if (isPlaying) {
			this.play();
		}
	}
	get duration() {
		if (!this._sound) {
			return 0;
		}
		if (this._duration) {
			const soundDuration = this._sound.duration;
			const startTime = capTime(this._startTime, soundDuration);
			return Math.min(this._duration, soundDuration - startTime);
		}
		return this._sound.duration;
	}
	get isPaused() {
		return this._state === STATE_PAUSED;
	}
	get isPlaying() {
		return this._state === STATE_PLAYING;
	}
	get isStopped() {
		return this._state === STATE_STOPPED;
	}
	get isSuspended() {
		return this._suspended;
	}
	set loop(value) {
		const loop = !!value;
		const wasLooping = this._loop;
		this._loop = loop;
		if (this.source) {
			this.source.loop = loop;
			if (wasLooping !== loop && this._duration && this._state === STATE_PLAYING) {
				this._updateRegionStop();
			}
		}
	}
	get loop() {
		return this._loop;
	}
	set pitch(pitch) {
		if (this._manager.context) {
			this._currentOffset = this.currentTime;
			this._startedAt = this._manager.context.currentTime;
			if (this.source) {
				this._syncSourcePosition();
			}
		}
		this._pitch = Math.max(Number(pitch) || 0, 0.01);
		if (this.source) {
			this.source.playbackRate.value = this._pitch;
			if (this._regionStopPending) {
				this._updateRegionStop();
			}
		}
	}
	get pitch() {
		return this._pitch;
	}
	set sound(value) {
		this._sound = value;
		if (this._state !== STATE_STOPPED) {
			this.stop();
		} else {
			this._createSource();
		}
	}
	get sound() {
		return this._sound;
	}
	set startTime(value) {
		this._startTime = Math.max(0, Number(value) || 0);
		const isPlaying = this._state === STATE_PLAYING;
		this.stop();
		if (isPlaying) {
			this.play();
		}
	}
	get startTime() {
		return this._startTime;
	}
	set volume(volume) {
		volume = math.clamp(volume, 0, 1);
		this._volume = volume;
		if (this.gain) {
			this.gain.gain.value = volume * this._manager.volume;
		}
	}
	get volume() {
		return this._volume;
	}
	_onPlay() {
		this.fire("play");
		if (this._onPlayCallback) {
			this._onPlayCallback(this);
		}
	}
	_onPause() {
		this.fire("pause");
		if (this._onPauseCallback) {
			this._onPauseCallback(this);
		}
	}
	_onResume() {
		this.fire("resume");
		if (this._onResumeCallback) {
			this._onResumeCallback(this);
		}
	}
	_onStop() {
		this.fire("stop");
		if (this._onStopCallback) {
			this._onStopCallback(this);
		}
	}
	_onEnded() {
		if (this._suspendEndEvent > 0) {
			this._suspendEndEvent--;
			return;
		}
		this.fire("end");
		if (this._onEndCallback) {
			this._onEndCallback(this);
		}
		this.stop();
	}
	_onManagerVolumeChange() {
		this.volume = this._volume;
	}
	_onManagerSuspend() {
		if (this._state === STATE_PLAYING && !this._suspended) {
			this._suspended = true;
			this.pause();
		}
	}
	_onManagerResume() {
		if (this._suspended) {
			this._suspended = false;
			this.resume();
		}
	}
	_initializeNodes() {
		this.gain = this._manager.context.createGain();
		this._inputNode = this.gain;
		this._connectorNode = this.gain;
		this._connectorNode.connect(this._manager.context.destination);
	}
	play() {
		if (!this._manager.context) {
			return false;
		}
		if (this._state !== STATE_STOPPED) {
			this.stop();
		}
		this._state = STATE_PLAYING;
		this._playWhenLoaded = false;
		if (this._waitingContextSuspension) {
			return false;
		}
		if (this._manager.suspended) {
			this._manager.once("resume", this._playAudioImmediate, this);
			this._waitingContextSuspension = true;
			return false;
		}
		this._playAudioImmediate();
		return true;
	}
	_playAudioImmediate() {
		this._waitingContextSuspension = false;
		if (this._state !== STATE_PLAYING) {
			return;
		}
		if (!this.source) {
			this._createSource();
		}
		const currentOffset = capTime(this._startOffset, this.duration);
		const offset = capTime(this._startTime + currentOffset, this._sound.duration);
		this._startOffset = null;
		this._startSource(offset, currentOffset);
		this._startedAt = this._manager.context.currentTime;
		this._currentTime = 0;
		this._currentOffset = currentOffset;
		this.volume = this._volume;
		this.loop = this._loop;
		this.pitch = this._pitch;
		this._manager.on("volumechange", this._onManagerVolumeChange, this);
		this._manager.on("suspend", this._onManagerSuspend, this);
		this._manager.on("resume", this._onManagerResume, this);
		this._manager.on("destroy", this._onManagerDestroy, this);
		if (!this._suspendInstanceEvents) {
			this._onPlay();
		}
	}
	_startSource(offset, currentOffset) {
		if (this._duration && !this._loop) {
			this.source.start(0, offset, this.duration - currentOffset);
		} else {
			this.source.start(0, offset);
		}
		this._sourceOffset = offset;
		this._sourceOffsetAt = this._manager.context.currentTime;
		this._sourceLooping = this._loop;
		this._regionStopPending = false;
	}
	_syncSourcePosition() {
		const source = this.source;
		const context = this._manager.context;
		let position = this._sourceOffset + (context.currentTime - this._sourceOffsetAt) * this._pitch;
		const region = source.loopEnd - source.loopStart;
		if (this._sourceLooping && region > 0 && position > source.loopEnd) {
			position = source.loopStart + (position - source.loopStart) % region;
		}
		this._sourceOffset = position;
		this._sourceOffsetAt = context.currentTime;
		this._sourceLooping = source.loop;
		return position;
	}
	_updateRegionStop() {
		const source = this.source;
		const context = this._manager.context;
		const position = this._syncSourcePosition();
		if (this._loop) {
			if (this._regionStopPending) {
				source.stop(context.currentTime + STOP_NEVER_DELAY);
				this._regionStopPending = false;
			}
			return;
		}
		const region = source.loopEnd - source.loopStart;
		if (region <= 0) {
			return;
		}
		source.stop(context.currentTime + Math.max(0, source.loopEnd - position) / this._pitch);
		this._regionStopPending = true;
	}
	pause() {
		this._playWhenLoaded = false;
		if (this._state !== STATE_PLAYING) {
			return false;
		}
		this._state = STATE_PAUSED;
		if (this._waitingContextSuspension) {
			return true;
		}
		this._updateCurrentTime();
		this._suspendEndEvent++;
		this.source.stop(0);
		this.source = null;
		this._startOffset = null;
		if (!this._suspendInstanceEvents) {
			this._onPause();
		}
		return true;
	}
	resume() {
		if (this._state !== STATE_PAUSED) {
			return false;
		}
		let currentOffset = this.currentTime;
		this._state = STATE_PLAYING;
		if (this._waitingContextSuspension) {
			return true;
		}
		if (!this.source) {
			this._createSource();
		}
		if (this._startOffset !== null) {
			currentOffset = capTime(this._startOffset, this.duration);
			this._startOffset = null;
		}
		const offset = capTime(this._startTime + currentOffset, this._sound.duration);
		this._startSource(offset, currentOffset);
		this._startedAt = this._manager.context.currentTime;
		this._currentOffset = currentOffset;
		this.volume = this._volume;
		this.loop = this._loop;
		this.pitch = this._pitch;
		this._playWhenLoaded = false;
		if (!this._suspendInstanceEvents) {
			this._onResume();
		}
		return true;
	}
	stop() {
		this._playWhenLoaded = false;
		if (this._state === STATE_STOPPED) {
			return false;
		}
		const wasPlaying = this._state === STATE_PLAYING;
		this._state = STATE_STOPPED;
		if (this._waitingContextSuspension) {
			return true;
		}
		this._manager.off("volumechange", this._onManagerVolumeChange, this);
		this._manager.off("suspend", this._onManagerSuspend, this);
		this._manager.off("resume", this._onManagerResume, this);
		this._manager.off("destroy", this._onManagerDestroy, this);
		this._startedAt = 0;
		this._currentTime = 0;
		this._currentOffset = 0;
		this._startOffset = null;
		this._suspendEndEvent++;
		if (wasPlaying && this.source) {
			this.source.stop(0);
		}
		this.source = null;
		if (!this._suspendInstanceEvents) {
			this._onStop();
		}
		return true;
	}
	setExternalNodes(firstNode, lastNode) {
		if (!firstNode) {
			console.error("The firstNode must be a valid Audio Node");
			return;
		}
		if (!this._connectorNode) {
			return;
		}
		if (!lastNode) {
			lastNode = firstNode;
		}
		const speakers = this._manager.context.destination;
		if (this._firstNode !== firstNode) {
			if (this._firstNode) {
				this._connectorNode.disconnect(this._firstNode);
			} else {
				this._connectorNode.disconnect(speakers);
			}
			this._firstNode = firstNode;
			this._connectorNode.connect(firstNode);
		}
		if (this._lastNode !== lastNode) {
			if (this._lastNode) {
				this._lastNode.disconnect(speakers);
			}
			this._lastNode = lastNode;
			this._lastNode.connect(speakers);
		}
	}
	clearExternalNodes() {
		if (!this._connectorNode) {
			return;
		}
		const speakers = this._manager.context.destination;
		if (this._firstNode) {
			this._connectorNode.disconnect(this._firstNode);
			this._firstNode = null;
		}
		if (this._lastNode) {
			this._lastNode.disconnect(speakers);
			this._lastNode = null;
		}
		this._connectorNode.connect(speakers);
	}
	getExternalNodes() {
		return [this._firstNode, this._lastNode];
	}
	_createSource() {
		if (!this._sound) {
			return null;
		}
		const context = this._manager.context;
		if (!context) {
			return null;
		}
		if (this._sound.buffer) {
			this.source = context.createBufferSource();
			this.source.buffer = this._sound.buffer;
			this.source.connect(this._inputNode);
			this.source.onended = this._endedHandler;
			this.source.loopStart = capTime(this._startTime, this.source.buffer.duration);
			if (this._duration) {
				this.source.loopEnd = Math.min(this.source.loopStart + this._duration, this.source.buffer.duration);
			}
		}
		return this.source;
	}
	_updateCurrentTime() {
		this._currentTime = capTime((this._manager.context.currentTime - this._startedAt) * this._pitch + this._currentOffset, this.duration);
	}
	_onManagerDestroy() {
		if (this.source && this._state === STATE_PLAYING) {
			this.source.stop(0);
			this.source = null;
		}
	}
}
export {
	SoundInstance
};
