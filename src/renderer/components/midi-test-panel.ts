import { midiSync } from '../audio/midi-sync';

interface PatternStep {
	notes: number[];
	velocity: number;
}

const PATTERNS: Record<string, { bpm: number; steps: PatternStep[] }> = {
	techno: {
		bpm: 130,
		steps: [
			{ notes: [36, 42], velocity: 120 },
			{ notes: [], velocity: 0 },
			{ notes: [42], velocity: 80 },
			{ notes: [], velocity: 0 },
			{ notes: [38, 42], velocity: 110 },
			{ notes: [], velocity: 0 },
			{ notes: [42], velocity: 90 },
			{ notes: [], velocity: 0 },
			{ notes: [36, 42], velocity: 120 },
			{ notes: [], velocity: 0 },
			{ notes: [42, 46], velocity: 85 },
			{ notes: [], velocity: 0 },
			{ notes: [38, 42], velocity: 115 },
			{ notes: [], velocity: 0 },
			{ notes: [42], velocity: 70 },
			{ notes: [46], velocity: 60 },
		],
	},
	house: {
		bpm: 124,
		steps: [
			{ notes: [36], velocity: 127 },
			{ notes: [42], velocity: 60 },
			{ notes: [42], velocity: 90 },
			{ notes: [42], velocity: 60 },
			{ notes: [36, 38], velocity: 120 },
			{ notes: [42], velocity: 60 },
			{ notes: [42], velocity: 95 },
			{ notes: [42, 46], velocity: 70 },
			{ notes: [36], velocity: 127 },
			{ notes: [42], velocity: 55 },
			{ notes: [42], velocity: 85 },
			{ notes: [42], velocity: 65 },
			{ notes: [36, 38], velocity: 115 },
			{ notes: [42, 51], velocity: 75 },
			{ notes: [42], velocity: 90 },
			{ notes: [42], velocity: 50 },
		],
	},
	dnb: {
		bpm: 174,
		steps: [
			{ notes: [36], velocity: 127 },
			{ notes: [], velocity: 0 },
			{ notes: [42], velocity: 80 },
			{ notes: [], velocity: 0 },
			{ notes: [38], velocity: 120 },
			{ notes: [], velocity: 0 },
			{ notes: [36], velocity: 90 },
			{ notes: [42], velocity: 70 },
			{ notes: [], velocity: 0 },
			{ notes: [36], velocity: 100 },
			{ notes: [42], velocity: 85 },
			{ notes: [], velocity: 0 },
			{ notes: [38], velocity: 125 },
			{ notes: [], velocity: 0 },
			{ notes: [42], velocity: 75 },
			{ notes: [46], velocity: 60 },
		],
	},
	ambient: {
		bpm: 80,
		steps: [
			{ notes: [60], velocity: 50 },
			{ notes: [], velocity: 0 },
			{ notes: [], velocity: 0 },
			{ notes: [64], velocity: 40 },
			{ notes: [], velocity: 0 },
			{ notes: [], velocity: 0 },
			{ notes: [67], velocity: 45 },
			{ notes: [], velocity: 0 },
			{ notes: [], velocity: 0 },
			{ notes: [72], velocity: 35 },
			{ notes: [], velocity: 0 },
			{ notes: [64], velocity: 30 },
			{ notes: [], velocity: 0 },
			{ notes: [], velocity: 0 },
			{ notes: [60, 67], velocity: 40 },
			{ notes: [], velocity: 0 },
		],
	},
};

export class MidiTestPanel extends HTMLElement {
	private clockInterval: ReturnType<typeof setInterval> | null = null;
	private patternInterval: ReturnType<typeof setInterval> | null = null;
	private patternStep = 0;
	private activePattern: string | null = null;
	private bpm = 120;
	private playing = false;

	connectedCallback(): void {
		this.className = 'fixed inset-0 z-50 hidden items-center justify-center';
	}

	show(): void {
		this.innerHTML = `
			<div id="midi-test-backdrop" class="absolute inset-0 bg-black/60"></div>
			<div class="relative bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl p-5 w-96">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-sm font-semibold text-neutral-200">MIDI Test Player</h2>
					<button id="midi-test-close" class="text-neutral-500 hover:text-neutral-300 text-lg">&times;</button>
				</div>

				<p class="text-xs text-neutral-500 mb-4">Simulates MIDI signals for testing. No hardware needed.</p>

				<!-- BPM -->
				<div class="mb-3">
					<label class="text-xs text-neutral-400 block mb-1">BPM</label>
					<div class="flex items-center gap-2">
						<input id="midi-test-bpm" type="range" min="60" max="200" value="${this.bpm}" class="flex-1 accent-blue-500">
						<span id="midi-test-bpm-value" class="text-xs text-neutral-300 font-mono w-8 text-right">${this.bpm}</span>
					</div>
				</div>

				<!-- Transport -->
				<div class="flex gap-1.5 mb-4">
					<button id="midi-test-play" class="flex-1 px-3 py-2 text-xs bg-green-800 hover:bg-green-700 rounded border border-green-700 text-green-100">▶ Play Clock</button>
					<button id="midi-test-stop" class="flex-1 px-3 py-2 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">⏹ Stop</button>
				</div>

				<!-- Beat indicator -->
				<div class="flex items-center gap-2 mb-4">
					<span class="text-xs text-neutral-400">Beat:</span>
					<div class="flex gap-1">
						<div id="beat-dot-0" class="w-4 h-4 rounded-full bg-neutral-700"></div>
						<div id="beat-dot-1" class="w-4 h-4 rounded-full bg-neutral-700"></div>
						<div id="beat-dot-2" class="w-4 h-4 rounded-full bg-neutral-700"></div>
						<div id="beat-dot-3" class="w-4 h-4 rounded-full bg-neutral-700"></div>
					</div>
					<span id="midi-test-beat-count" class="text-xs text-neutral-500 font-mono">0</span>
				</div>

				<div class="h-px bg-neutral-700 mb-4"></div>

				<!-- Manual triggers -->
				<div class="mb-3">
					<label class="text-xs text-neutral-400 block mb-1">Manual Triggers</label>
					<div class="flex gap-1.5 mb-2">
						<button id="midi-test-beat" class="flex-1 px-2 py-1.5 text-xs bg-blue-800 hover:bg-blue-700 rounded border border-blue-700 text-blue-100">Beat</button>
						<button id="midi-test-note" class="flex-1 px-2 py-1.5 text-xs bg-purple-800 hover:bg-purple-700 rounded border border-purple-700 text-purple-100">Note C4</button>
						<button id="midi-test-cc" class="flex-1 px-2 py-1.5 text-xs bg-orange-800 hover:bg-orange-700 rounded border border-orange-700 text-orange-100">CC #1</button>
					</div>
				</div>

				<!-- Preset patterns -->
				<div class="mb-3">
					<label class="text-xs text-neutral-400 block mb-1">Patterns</label>
					<div class="flex gap-1 flex-wrap">
						<button data-pattern="techno" class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Techno</button>
						<button data-pattern="house" class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">House</button>
						<button data-pattern="dnb" class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">DnB</button>
						<button data-pattern="ambient" class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Ambient</button>
						<button data-pattern="stop-pattern" class="px-2 py-1 text-xs bg-red-900 hover:bg-red-800 rounded border border-red-700 text-red-300">Stop</button>
					</div>
				</div>

				<!-- Note keyboard -->
				<div class="mb-3">
					<label class="text-xs text-neutral-400 block mb-1">Notes</label>
					<div class="flex gap-px">
						${[60, 62, 64, 65, 67, 69, 71, 72].map((note, i) => {
							const names = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
							return `<button data-midi-note="${note}" class="flex-1 py-3 text-xs bg-neutral-200 hover:bg-white text-neutral-800 font-semibold rounded-b ${i === 0 ? 'rounded-tl' : ''} ${i === 7 ? 'rounded-tr' : ''}">${names[i]}</button>`;
						}).join('')}
					</div>
				</div>

				<!-- Log -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Log</label>
					<div id="midi-test-log" class="h-20 overflow-y-auto bg-neutral-800 rounded p-2 text-xs text-neutral-400 font-mono"></div>
				</div>
			</div>
		`;

		this.classList.remove('hidden');
		this.classList.add('flex');
		this.setupListeners();

		// Restore playing state UI if clock is running in background
		if (this.playing) {
			const playBtn = this.querySelector('#midi-test-play') as HTMLElement;
			if (playBtn) {
				playBtn.textContent = '▶ Playing...';
				playBtn.classList.add('animate-pulse');
			}
			const countEl = this.querySelector('#midi-test-beat-count');
			if (countEl) countEl.textContent = String(this.beatCount);
		}
	}

	private setupListeners(): void {
		this.querySelector('#midi-test-backdrop')?.addEventListener('click', () => this.hide());
		this.querySelector('#midi-test-close')?.addEventListener('click', () => this.hide());

		const bpmSlider = this.querySelector('#midi-test-bpm') as HTMLInputElement;
		bpmSlider?.addEventListener('input', () => {
			this.bpm = parseInt(bpmSlider.value);
			const label = this.querySelector('#midi-test-bpm-value');
			if (label) label.textContent = String(this.bpm);
			if (this.playing) {
				this.stopClock();
				this.startClock();
			}
		});

		this.querySelector('#midi-test-play')?.addEventListener('click', () => this.startClock());
		this.querySelector('#midi-test-stop')?.addEventListener('click', () => this.stopClock());

		this.querySelector('#midi-test-beat')?.addEventListener('click', () => {
			this.fireBeat();
			this.log('Manual beat');
		});

		this.querySelector('#midi-test-note')?.addEventListener('click', () => {
			this.fireNote(60, 100);
			this.log('Note On: C4 vel=100');
		});

		this.querySelector('#midi-test-cc')?.addEventListener('click', () => {
			this.fireCC(1, 127);
			this.log('CC #1 val=127');
		});

		// Pattern buttons
		this.querySelectorAll<HTMLElement>('[data-pattern]').forEach(el => {
			el.addEventListener('click', () => {
				const name = el.dataset.pattern!;
				if (name === 'stop-pattern') {
					this.stopPattern();
				} else {
					this.playPattern(name);
				}
			});
		});

		this.querySelectorAll<HTMLElement>('[data-midi-note]').forEach(el => {
			el.addEventListener('mousedown', () => {
				const note = parseInt(el.dataset.midiNote!);
				this.fireNote(note, 100);
				el.classList.add('bg-blue-300');
				this.log(`Note On: ${note} vel=100`);
			});
			el.addEventListener('mouseup', () => {
				const note = parseInt(el.dataset.midiNote!);
				this.fireNoteOff(note);
				el.classList.remove('bg-blue-300');
			});
			el.addEventListener('mouseleave', () => {
				el.classList.remove('bg-blue-300');
			});
		});
	}

	private beatCount = 0;

	private playPattern(name: string): void {
		this.stopPattern();
		const pattern = PATTERNS[name];
		if (!pattern) return;

		this.activePattern = name;
		this.patternStep = 0;

		// Set BPM and start clock if not running
		this.bpm = pattern.bpm;
		const bpmSlider = this.querySelector('#midi-test-bpm') as HTMLInputElement;
		const bpmLabel = this.querySelector('#midi-test-bpm-value');
		if (bpmSlider) bpmSlider.value = String(this.bpm);
		if (bpmLabel) bpmLabel.textContent = String(this.bpm);

		if (!this.playing) this.startClock();

		const msPerStep = 60000 / this.bpm / 4; // 16th notes
		this.patternInterval = setInterval(() => {
			const step = pattern.steps[this.patternStep % pattern.steps.length];
			for (const note of step.notes) {
				this.fireNote(note, step.velocity);
				setTimeout(() => this.fireNoteOff(note), msPerStep * 0.8);
			}
			this.patternStep++;
		}, msPerStep);

		// Highlight active pattern button
		this.querySelectorAll<HTMLElement>('[data-pattern]').forEach(el => {
			if (el.dataset.pattern === name) {
				el.classList.remove('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
				el.classList.add('bg-green-700', 'border-green-600', 'text-green-100');
			} else if (el.dataset.pattern !== 'stop-pattern') {
				el.classList.remove('bg-green-700', 'border-green-600', 'text-green-100');
				el.classList.add('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
			}
		});

		this.log(`Pattern: ${name} @ ${this.bpm} BPM`);
	}

	private stopPattern(): void {
		if (this.patternInterval) {
			clearInterval(this.patternInterval);
			this.patternInterval = null;
		}
		this.activePattern = null;

		this.querySelectorAll<HTMLElement>('[data-pattern]').forEach(el => {
			if (el.dataset.pattern !== 'stop-pattern') {
				el.classList.remove('bg-green-700', 'border-green-600', 'text-green-100');
				el.classList.add('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
			}
		});
	}

	private startClock(): void {
		if (this.playing) return;
		this.playing = true;
		this.beatCount = 0;
		this.updateMidiButton(true);

		const playBtn = this.querySelector('#midi-test-play') as HTMLElement;
		if (playBtn) {
			playBtn.textContent = '▶ Playing...';
			playBtn.classList.add('animate-pulse');
		}

		// MIDI clock: 24 pulses per quarter note
		const pulsesPerBeat = 24;
		let pulseCount = 0;
		const msPerPulse = 60000 / this.bpm / pulsesPerBeat;

		this.fireMessage({ type: 'start' });
		this.log(`Start clock @ ${this.bpm} BPM`);

		this.clockInterval = setInterval(() => {
			// Send clock pulse
			this.fireClock();
			pulseCount++;

			if (pulseCount >= pulsesPerBeat) {
				pulseCount = 0;
				this.beatCount++;
				this.fireBeat();

				// Update beat dots
				const dotIndex = (this.beatCount - 1) % 4;
				for (let i = 0; i < 4; i++) {
					const dot = this.querySelector(`#beat-dot-${i}`) as HTMLElement;
					if (dot) {
						dot.className = `w-4 h-4 rounded-full ${i === dotIndex ? 'bg-green-400' : 'bg-neutral-700'}`;
					}
				}

				const countEl = this.querySelector('#midi-test-beat-count');
				if (countEl) countEl.textContent = String(this.beatCount);
			}
		}, msPerPulse);
	}

	private stopClock(): void {
		if (!this.playing) return;
		this.playing = false;
		this.stopPattern();
		this.updateMidiButton(false);

		if (this.clockInterval) {
			clearInterval(this.clockInterval);
			this.clockInterval = null;
		}

		const playBtn = this.querySelector('#midi-test-play') as HTMLElement;
		if (playBtn) {
			playBtn.textContent = '▶ Play Clock';
			playBtn.classList.remove('animate-pulse');
		}

		for (let i = 0; i < 4; i++) {
			const dot = this.querySelector(`#beat-dot-${i}`) as HTMLElement;
			if (dot) dot.className = 'w-4 h-4 rounded-full bg-neutral-700';
		}

		this.fireMessage({ type: 'stop' });
		this.log('Stop clock');
	}

	// Simulate MIDI messages by directly calling midiSync's beat listeners
	private fireBeat(): void {
		midiSync.fireBeat();
	}

	private fireMessage(msg: { type: string; note?: number; velocity?: number; cc?: number; value?: number }): void {
		const listeners = (midiSync as unknown as { listeners: Set<(msg: unknown) => void> }).listeners;
		if (listeners) listeners.forEach(l => l(msg));
	}

	private fireClock(): void {
		// Clock pulses don't go through the message system, they accumulate for BPM
		// The beat is what matters — handled in fireBeat
	}

	private fireNote(note: number, velocity: number): void {
		this.fireMessage({ type: 'noteon', note, velocity });
	}

	private fireNoteOff(note: number): void {
		this.fireMessage({ type: 'noteoff', note, velocity: 0 });
	}

	private fireCC(cc: number, value: number): void {
		this.fireMessage({ type: 'cc', cc, value });
	}

	private log(msg: string): void {
		const logEl = this.querySelector('#midi-test-log');
		if (!logEl) return;
		const time = new Date().toLocaleTimeString('en-US', { hour12: false });
		logEl.innerHTML += `<div>${time} ${msg}</div>`;
		logEl.scrollTop = logEl.scrollHeight;
	}

	hide(): void {
		// Don't stop clock — keep playing in background
		this.classList.remove('flex');
		this.classList.add('hidden');
		this.innerHTML = '';
	}

	isPlaying(): boolean {
		return this.playing;
	}

	private updateMidiButton(playing: boolean): void {
		const btn = document.querySelector('#btn-midi-test') as HTMLElement;
		if (!btn) return;
		if (playing) {
			btn.classList.remove('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
			btn.classList.add('bg-green-700', 'border-green-600', 'text-green-100');
		} else {
			btn.classList.remove('bg-green-700', 'border-green-600', 'text-green-100');
			btn.classList.add('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
		}
	}
}

customElements.define('midi-test-panel', MidiTestPanel);
