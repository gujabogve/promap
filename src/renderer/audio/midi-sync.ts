type MidiListener = (message: { type: string; note?: number; velocity?: number; cc?: number; value?: number }) => void;
type BeatListener = () => void;

export class MidiSync {
	private access: MIDIAccess | null = null;
	listeners: Set<MidiListener> = new Set();
	beatListeners: Set<BeatListener> = new Set();
	private _connected = false;
	private _active = false;
	private _devices: MIDIInput[] = [];
	private _selectedDeviceId: string | null = null;

	// Beat detection from MIDI clock
	private clockCount = 0;
	private lastClockTime = 0;
	private _bpm = 0;
	private _lastBeatTime = 0;

	get connected(): boolean {
		return this._connected;
	}

	get active(): boolean {
		// Active if connected via MIDI API or receiving beats (e.g. from test player)
		return this._connected || (performance.now() - this._lastBeatTime < 3000);
	}

	fireBeat(): void {
		const now = performance.now();
		if (this._lastBeatTime > 0) {
			const interval = now - this._lastBeatTime;
			if (interval > 0 && interval < 5000) {
				this._bpm = Math.round(60000 / interval);
			}
		}
		this._lastBeatTime = now;
		this.beatListeners.forEach(l => l());
	}

	get devices(): { id: string; name: string }[] {
		return this._devices.map(d => ({ id: d.id, name: d.name ?? 'Unknown Device' }));
	}

	get bpm(): number {
		return this._bpm;
	}

	onMessage(listener: MidiListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onBeat(listener: BeatListener): () => void {
		this.beatListeners.add(listener);
		return () => this.beatListeners.delete(listener);
	}

	async init(): Promise<boolean> {
		try {
			this.access = await navigator.requestMIDIAccess({ sysex: false });
			this._connected = true;
			this.updateDevices();

			this.access.addEventListener('statechange', () => {
				this.updateDevices();
			});

			return true;
		} catch (err) {
			console.warn('MIDI not available:', err);
			return false;
		}
	}

	private updateDevices(): void {
		if (!this.access) return;
		this._devices = [];
		this.access.inputs.forEach(input => {
			this._devices.push(input);
		});

		// Re-bind to selected device or all
		this.bindInputs();
	}

	selectDevice(deviceId: string | null): void {
		this._selectedDeviceId = deviceId;
		this.bindInputs();
	}

	private bindInputs(): void {
		if (!this.access) return;

		// Unbind all first
		this.access.inputs.forEach(input => {
			input.onmidimessage = null;
		});

		// Bind to selected or all
		this.access.inputs.forEach(input => {
			if (this._selectedDeviceId && input.id !== this._selectedDeviceId) return;
			input.onmidimessage = (e) => this.handleMessage(e);
		});
	}

	private handleMessage(event: MIDIMessageEvent): void {
		const data = event.data;
		if (!data || data.length === 0) return;

		const status = data[0];
		const channel = status & 0x0f;
		const type = status & 0xf0;

		let parsed: { type: string; note?: number; velocity?: number; cc?: number; value?: number };

		switch (type) {
			case 0x90: // Note On
				parsed = { type: 'noteon', note: data[1], velocity: data[2] };
				break;
			case 0x80: // Note Off
				parsed = { type: 'noteoff', note: data[1], velocity: data[2] };
				break;
			case 0xb0: // Control Change
				parsed = { type: 'cc', cc: data[1], value: data[2] };
				break;
			default:
				// MTC Quarter Frame
				if (status === 0xf1) {
					parsed = { type: 'mtc', value: data[1] };
					break;
				}
				// MIDI Clock
				if (status === 0xf8) {
					this.handleClock();
					return;
				}
				// MIDI Start
				if (status === 0xfa) {
					this.clockCount = 0;
					parsed = { type: 'start' };
					break;
				}
				// MIDI Stop
				if (status === 0xfc) {
					parsed = { type: 'stop' };
					break;
				}
				return;
		}

		this.listeners.forEach(l => l(parsed));
	}

	private handleClock(): void {
		this.clockCount++;

		// MIDI clock sends 24 pulses per quarter note
		if (this.clockCount >= 24) {
			this.clockCount = 0;

			const now = performance.now();
			if (this.lastClockTime > 0) {
				const interval = now - this.lastClockTime;
				this._bpm = Math.round(60000 / interval);
			}
			this.lastClockTime = now;

			// Notify beat listeners
			this._lastBeatTime = now;
			this.beatListeners.forEach(l => l());
		}
	}

	disconnect(): void {
		if (this.access) {
			this.access.inputs.forEach(input => {
				input.onmidimessage = null;
			});
		}
		this._connected = false;
		this._devices = [];
	}
}

export const midiSync = new MidiSync();
