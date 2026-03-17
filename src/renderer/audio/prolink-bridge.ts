import { CDJStatusData } from '../types/promap-api';

type BeatListener = () => void;

class ProLinkBridge {
	private _masterBpm = 0;
	private _masterBeat = 0;
	private _lastBeat = 0;
	private _active = false;
	beatListeners: Set<BeatListener> = new Set();
	private devices: Map<number, CDJStatusData> = new Map();

	get active(): boolean { return this._active; }
	get masterBpm(): number { return this._masterBpm; }
	get masterBeat(): number { return this._masterBeat; }

	onBeat(listener: BeatListener): () => void {
		this.beatListeners.add(listener);
		return () => this.beatListeners.delete(listener);
	}

	start(): void {
		this._active = true;

		window.promap.onProlinkStatus((status) => {
			const s = status as CDJStatusData;
			this.devices.set(s.deviceId, s);

			// Use master device for BPM
			if (s.master || this.devices.size === 1) {
				this._masterBpm = s.bpm;

				// Detect beat change
				if (s.beat !== this._lastBeat && s.playing) {
					this._lastBeat = s.beat;
					this._masterBeat = s.beat;
					this.beatListeners.forEach(l => l());
				}
			}
		});
	}

	stop(): void {
		this._active = false;
		this._masterBpm = 0;
		this.devices.clear();
	}
}

export const prolinkBridge = new ProLinkBridge();
