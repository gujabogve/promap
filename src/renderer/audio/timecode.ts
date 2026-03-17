import { midiSync } from './midi-sync';

export type TimecodeFrameRate = 24 | 25 | 29.97 | 30;
export type TimecodeSource = 'internal' | 'external';

export interface TimecodePosition {
	hours: number;
	minutes: number;
	seconds: number;
	frames: number;
}

type TimecodeListener = (pos: TimecodePosition, totalMs: number) => void;

export class TimecodeManager {
	private _source: TimecodeSource = 'internal';
	private _frameRate: TimecodeFrameRate = 30;
	private _offset = 0; // ms
	private _position: TimecodePosition = { hours: 0, minutes: 0, seconds: 0, frames: 0 };
	private _locked = false;
	private _running = false;
	private listeners: Set<TimecodeListener> = new Set();

	// MTC state
	private mtcQuarterFrames: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
	private mtcQFIndex = 0;
	private lastMtcTime = 0;

	// Internal playback
	private startTime = 0;
	private pausedAt = 0;
	private rafId: number | null = null;

	get source(): TimecodeSource { return this._source; }
	set source(val: TimecodeSource) { this._source = val; }

	get frameRate(): TimecodeFrameRate { return this._frameRate; }
	set frameRate(val: TimecodeFrameRate) { this._frameRate = val; }

	get offset(): number { return this._offset; }
	set offset(val: number) { this._offset = val; }

	get position(): TimecodePosition { return this._position; }
	get locked(): boolean { return this._locked; }
	get running(): boolean { return this._running; }

	onTimecode(listener: TimecodeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	formatTimecode(pos?: TimecodePosition): string {
		const p = pos ?? this._position;
		const h = String(p.hours).padStart(2, '0');
		const m = String(p.minutes).padStart(2, '0');
		const s = String(p.seconds).padStart(2, '0');
		const f = String(p.frames).padStart(2, '0');
		return `${h}:${m}:${s}:${f}`;
	}

	positionToMs(pos?: TimecodePosition): number {
		const p = pos ?? this._position;
		return (p.hours * 3600 + p.minutes * 60 + p.seconds) * 1000 +
			(p.frames / this._frameRate) * 1000 + this._offset;
	}

	msToPosition(ms: number): TimecodePosition {
		const adjusted = Math.max(0, ms - this._offset);
		const totalSeconds = Math.floor(adjusted / 1000);
		const frames = Math.floor((adjusted % 1000) / (1000 / this._frameRate));
		return {
			hours: Math.floor(totalSeconds / 3600),
			minutes: Math.floor((totalSeconds % 3600) / 60),
			seconds: totalSeconds % 60,
			frames,
		};
	}

	// Start listening for external MTC
	startExternalSync(): void {
		this._source = 'external';
		this._running = true;
		this._locked = false;

		// Listen for MTC quarter-frame messages from MIDI
		midiSync.onMessage((msg) => {
			if (msg.type === 'mtc') {
				this.handleMTCQuarterFrame(msg.value ?? 0);
			}
		});
	}

	// Start internal timecode generation
	startInternal(fromMs = 0): void {
		this._source = 'internal';
		this._running = true;
		this._locked = true;
		this.startTime = performance.now() - fromMs;
		this.tickInternal();
	}

	pause(): void {
		this._running = false;
		this.pausedAt = this.positionToMs();
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	resume(): void {
		if (this._source === 'internal') {
			this.startInternal(this.pausedAt);
		} else {
			this._running = true;
		}
	}

	stop(): void {
		this._running = false;
		this._locked = false;
		this.pausedAt = 0;
		this._position = { hours: 0, minutes: 0, seconds: 0, frames: 0 };
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	setPosition(ms: number): void {
		this._position = this.msToPosition(ms);
		this.pausedAt = ms;
		if (this._source === 'internal' && this._running) {
			this.startTime = performance.now() - ms;
		}
		this.notifyListeners();
	}

	private tickInternal(): void {
		if (!this._running || this._source !== 'internal') return;

		const elapsed = performance.now() - this.startTime;
		this._position = this.msToPosition(elapsed);
		this.notifyListeners();

		this.rafId = requestAnimationFrame(() => this.tickInternal());
	}

	private handleMTCQuarterFrame(data: number): void {
		const type = (data >> 4) & 0x07;
		const value = data & 0x0f;

		this.mtcQuarterFrames[type] = value;
		this.mtcQFIndex = type;

		// Full frame assembled after 8 quarter-frame messages (indices 0-7)
		if (type === 7) {
			const frames = (this.mtcQuarterFrames[1] << 4) | this.mtcQuarterFrames[0];
			const seconds = (this.mtcQuarterFrames[3] << 4) | this.mtcQuarterFrames[2];
			const minutes = (this.mtcQuarterFrames[5] << 4) | this.mtcQuarterFrames[4];
			const hoursAndRate = (this.mtcQuarterFrames[7] << 4) | this.mtcQuarterFrames[6];
			const hours = hoursAndRate & 0x1f;
			const rateType = (hoursAndRate >> 5) & 0x03;

			// Decode frame rate from MTC
			switch (rateType) {
				case 0: this._frameRate = 24; break;
				case 1: this._frameRate = 25; break;
				case 2: this._frameRate = 29.97; break;
				case 3: this._frameRate = 30; break;
			}

			this._position = { hours, minutes, seconds, frames };
			this._locked = true;
			this.lastMtcTime = performance.now();
			this.notifyListeners();
		}

		// Check for lock loss (no MTC for 2 seconds)
		if (this._locked && performance.now() - this.lastMtcTime > 2000) {
			this._locked = false;
		}
	}

	// Send MTC quarter-frame messages (for internal timecode generation)
	sendMTC(): void {
		if (this._source !== 'internal' || !this._running) return;

		const p = this._position;
		const rateType = this._frameRate === 24 ? 0 : this._frameRate === 25 ? 1 : this._frameRate === 29.97 ? 2 : 3;

		// Send 8 quarter-frame messages
		const qf = [
			p.frames & 0x0f,
			(p.frames >> 4) & 0x01,
			p.seconds & 0x0f,
			(p.seconds >> 4) & 0x03,
			p.minutes & 0x0f,
			(p.minutes >> 4) & 0x03,
			p.hours & 0x0f,
			((p.hours >> 4) & 0x01) | (rateType << 1),
		];

		for (let i = 0; i < 8; i++) {
			const data = (i << 4) | qf[i];
			midiSync.listeners.forEach(l => l({ type: 'mtc', value: data }));
		}
	}

	private notifyListeners(): void {
		const ms = this.positionToMs();
		this.listeners.forEach(l => l(this._position, ms));
	}
}

export const timecodeManager = new TimecodeManager();
