type Listener = (level: number) => void;

export class AudioAnalyzer {
	private context: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private stream: MediaStream | null = null;
	private dataArray: Uint8Array | null = null;
	private rafId: number | null = null;
	private listeners: Set<Listener> = new Set();
	private _level = 0;
	private _running = false;
	private _threshold = 0.05;
	private _deviceId: string | null = null;

	get level(): number {
		return this._level;
	}

	get isAboveThreshold(): boolean {
		return this._level > this._threshold;
	}

	get running(): boolean {
		return this._running;
	}

	set threshold(value: number) {
		this._threshold = Math.max(0, Math.min(1, value));
	}

	get threshold(): number {
		return this._threshold;
	}

	onLevel(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
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
		this.analyser.fftSize = 256;
		this.analyser.smoothingTimeConstant = 0.8;

		this.source = this.context.createMediaStreamSource(this.stream);
		this.source.connect(this.analyser);

		this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
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

		// Notify listeners
		this.listeners.forEach(l => l(this._level));

		this.rafId = requestAnimationFrame(() => this.tick());
	}
}

export const audioAnalyzer = new AudioAnalyzer();
