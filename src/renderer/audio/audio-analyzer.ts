type LevelListener = (level: number) => void;
type BeatListener = () => void;

export class AudioAnalyzer {
	private context: AudioContext | null = null;
	analyser: AnalyserNode | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private stream: MediaStream | null = null;
	private dataArray: Uint8Array | null = null;
	private rafId: number | null = null;
	private levelListeners: Set<LevelListener> = new Set();
	private _level = 0;
	private _running = false;
	private _threshold = 0.05;
	private _deviceId: string | null = null;

	// Beat detection
	beatListeners: Set<BeatListener> = new Set();
	private energyHistory: number[] = [];
	private readonly HISTORY_SIZE = 43; // ~43 frames at 60fps ≈ 0.7 seconds
	private beatCooldown = 0;
	private readonly BEAT_COOLDOWN_MS = 200; // Minimum ms between beats
	private lastBeatTime = 0;
	private _beatSensitivity = 1.5; // Energy must be this many times the average
	private _beatDetected = false;
	private _bpm = 0;
	private beatTimes: number[] = [];

	get level(): number {
		return this._level;
	}

	get isAboveThreshold(): boolean {
		return this._level > this._threshold;
	}

	get running(): boolean {
		return this._running;
	}

	get beatDetected(): boolean {
		return this._beatDetected;
	}

	get bpm(): number {
		return this._bpm;
	}

	set threshold(value: number) {
		this._threshold = Math.max(0, Math.min(1, value));
	}

	get threshold(): number {
		return this._threshold;
	}

	set beatSensitivity(value: number) {
		this._beatSensitivity = Math.max(1, Math.min(5, value));
	}

	get beatSensitivity(): number {
		return this._beatSensitivity;
	}

	onLevel(listener: LevelListener): () => void {
		this.levelListeners.add(listener);
		return () => this.levelListeners.delete(listener);
	}

	onBeat(listener: BeatListener): () => void {
		this.beatListeners.add(listener);
		return () => this.beatListeners.delete(listener);
	}

	async start(deviceId?: string): Promise<void> {
		if (this._running) await this.stop();

		this._deviceId = deviceId ?? null;

		const constraints: MediaStreamConstraints = {
			audio: deviceId ? { deviceId: { exact: deviceId } } : true,
			video: false,
		};

		try {
			this.stream = await navigator.mediaDevices.getUserMedia(constraints);
		} catch (err) {
			console.warn('Failed to access microphone:', err);
			return;
		}

		this.context = new AudioContext();
		this.analyser = this.context.createAnalyser();
		this.analyser.fftSize = 1024;
		this.analyser.smoothingTimeConstant = 0.4;

		this.source = this.context.createMediaStreamSource(this.stream);
		this.source.connect(this.analyser);

		this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
		this.energyHistory = [];
		this.beatTimes = [];
		this._bpm = 0;
		this._running = true;
		this.tick();
	}

	async stop(): Promise<void> {
		this._running = false;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		if (this.source) {
			this.source.disconnect();
			this.source = null;
		}
		if (this.context) {
			await this.context.close();
			this.context = null;
		}
		if (this.stream) {
			this.stream.getTracks().forEach(t => t.stop());
			this.stream = null;
		}
		this.analyser = null;
		this.dataArray = null;
		this._level = 0;
		this._beatDetected = false;
		this._bpm = 0;
	}

	private tick(): void {
		if (!this._running || !this.analyser || !this.dataArray) return;

		this.analyser.getByteFrequencyData(this.dataArray);

		// Calculate RMS level (0-1)
		let sum = 0;
		for (let i = 0; i < this.dataArray.length; i++) {
			const normalized = this.dataArray[i] / 255;
			sum += normalized * normalized;
		}
		this._level = Math.sqrt(sum / this.dataArray.length);

		// Beat detection — focus on low frequencies (bass/kick)
		let bassEnergy = 0;
		const bassRange = Math.floor(this.dataArray.length * 0.15); // Bottom 15% of spectrum
		for (let i = 0; i < bassRange; i++) {
			const normalized = this.dataArray[i] / 255;
			bassEnergy += normalized * normalized;
		}
		bassEnergy = Math.sqrt(bassEnergy / bassRange);

		// Track energy history
		this.energyHistory.push(bassEnergy);
		if (this.energyHistory.length > this.HISTORY_SIZE) {
			this.energyHistory.shift();
		}

		// Calculate average energy
		const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

		// Detect beat: current energy significantly above average + cooldown
		const now = performance.now();
		this._beatDetected = false;

		if (
			this.energyHistory.length >= this.HISTORY_SIZE &&
			bassEnergy > avgEnergy * this._beatSensitivity &&
			bassEnergy > this._threshold &&
			now - this.lastBeatTime > this.BEAT_COOLDOWN_MS
		) {
			this._beatDetected = true;
			this.lastBeatTime = now;

			// Track beat times for BPM calculation
			this.beatTimes.push(now);
			if (this.beatTimes.length > 20) this.beatTimes.shift();

			// Calculate BPM from beat intervals
			if (this.beatTimes.length >= 4) {
				let totalInterval = 0;
				let count = 0;
				for (let i = 1; i < this.beatTimes.length; i++) {
					const interval = this.beatTimes[i] - this.beatTimes[i - 1];
					// Only count reasonable intervals (40-240 BPM range)
					if (interval > 250 && interval < 1500) {
						totalInterval += interval;
						count++;
					}
				}
				if (count > 0) {
					this._bpm = Math.round(60000 / (totalInterval / count));
				}
			}

			// Notify beat listeners
			this.beatListeners.forEach(l => l());
		}

		// Notify level listeners
		this.levelListeners.forEach(l => l(this._level));

		this.rafId = requestAnimationFrame(() => this.tick());
	}
}

export const audioAnalyzer = new AudioAnalyzer();
