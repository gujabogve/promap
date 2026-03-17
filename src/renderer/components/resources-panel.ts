import { state } from '../state/state-manager';
import { ResourceData } from '../types';
import { TextModal } from './text-modal';
import { ColorModal } from './color-modal';
import { audioAnalyzer } from '../audio/audio-analyzer';
import { midiSync } from '../audio/midi-sync';
import { MidiTestPanel } from './midi-test-panel';

export class ResourcesPanel extends HTMLElement {
	private meterRafId: number | null = null;

	connectedCallback(): void {
		this.className = 'block bg-neutral-900 shrink-0 overflow-hidden';
		this.renderPanel();
		this.setupListeners();
		state.subscribe(() => this.renderList());
		this.startMeter();
	}

	disconnectedCallback(): void {
		if (this.meterRafId !== null) cancelAnimationFrame(this.meterRafId);
	}

	private renderPanel(): void {
		this.innerHTML = `
			<div class="flex flex-col h-full">
				<div class="p-3 border-b border-neutral-700">
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Resources</h2>
					<div class="flex gap-1.5">
						<button id="btn-add-media" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Media</button>
						<button id="btn-add-text" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Text</button>
						<button id="btn-add-color" class="flex-1 px-2 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Color</button>
					</div>
				</div>
				<div id="resources-list" class="flex-1 overflow-y-auto p-3">
					<div class="text-xs text-neutral-500 text-center py-8">No resources</div>
				</div>

				<!-- Audio Meter -->
				<div id="audio-meter-section" class="border-t border-neutral-700 p-3">
					<div class="flex items-center justify-between mb-2">
						<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Audio</h2>
						<div class="flex items-center gap-2">
							<span id="meter-db" class="text-xs text-neutral-500 font-mono w-12 text-right">-∞ dB</span>
							<button id="btn-mic-toggle" class="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Mic</button>
						</div>
					</div>
					<!-- Audio source -->
					<div class="mb-1.5">
						<select id="audio-source" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
							<option value="">Default</option>
						</select>
					</div>
					<!-- Level bar with threshold marker -->
					<div class="relative h-3 bg-neutral-800 rounded overflow-hidden mb-1.5">
						<div id="meter-bar" class="h-full bg-green-500 transition-none rounded" style="width: 0%;"></div>
						<div id="meter-threshold-marker" class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style="left: ${Math.round(audioAnalyzer.threshold * 100)}%;"></div>
					</div>
					<!-- Threshold -->
					<div class="flex items-center gap-1.5 mb-1">
						<span class="text-xs text-neutral-500 w-14">Threshold</span>
						<input id="meter-threshold" type="range" min="1" max="50" value="${Math.round(audioAnalyzer.threshold * 100)}" class="flex-1 accent-red-500">
						<span id="meter-threshold-value" class="text-xs text-neutral-500 font-mono w-8 text-right">${Math.round(audioAnalyzer.threshold * 100)}%</span>
					</div>
					<!-- Beat sensitivity -->
					<div class="flex items-center gap-1.5 mb-1.5">
						<span class="text-xs text-neutral-500 w-14">Beat sens.</span>
						<input id="meter-beat-sens" type="range" min="10" max="50" value="${Math.round(audioAnalyzer.beatSensitivity * 10)}" class="flex-1 accent-yellow-500">
						<span id="meter-beat-sens-value" class="text-xs text-neutral-500 font-mono w-8 text-right">${audioAnalyzer.beatSensitivity.toFixed(1)}x</span>
					</div>
					<!-- Frequency bars -->
					<div class="flex gap-px h-10" id="meter-freq-bars">
						${Array.from({ length: 32 }, (_, i) => `<div class="flex-1 bg-neutral-800 rounded-t flex flex-col justify-end"><div id="freq-bar-${i}" class="bg-green-500 rounded-t" style="height: 0%;"></div></div>`).join('')}
					</div>
					<!-- Beat + Level status -->
					<div class="flex items-center justify-between mt-1.5">
						<div class="flex items-center gap-1.5">
							<span class="text-xs text-neutral-500">Level</span>
							<span id="meter-active-dot" class="w-2 h-2 rounded-full bg-neutral-700"></span>
							<span id="meter-beat-dot" class="w-2 h-2 rounded-full bg-neutral-700" title="Beat"></span>
							<span id="meter-bpm" class="text-xs text-neutral-600 font-mono"></span>
						</div>
						<span id="meter-peak" class="text-xs text-neutral-500 font-mono">0%</span>
					</div>

					<!-- MIDI Activity -->
					<div class="mt-3 pt-3 border-t border-neutral-700">
						<div class="flex items-center justify-between mb-1.5">
							<span class="text-xs text-neutral-400 uppercase tracking-wide font-semibold">MIDI</span>
							<div class="flex items-center gap-1.5">
								<span id="midi-bpm-display" class="text-xs text-neutral-500 font-mono">-- BPM</span>
								<button id="btn-midi-test" class="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300" title="MIDI Test Player">Test</button>
							</div>
						</div>
						<!-- Device selector -->
						<div class="mb-1.5">
							<div class="flex gap-1">
								<select id="midi-device" class="flex-1 px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
									<option value="">No MIDI device</option>
								</select>
								<button id="btn-midi-connect" class="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Connect</button>
							</div>
						</div>
						<!-- Beat pulse -->
						<div class="flex items-center gap-2 mb-1.5">
							<div class="flex gap-1">
								<div id="midi-beat-0" class="w-3 h-3 rounded-full bg-neutral-700"></div>
								<div id="midi-beat-1" class="w-3 h-3 rounded-full bg-neutral-700"></div>
								<div id="midi-beat-2" class="w-3 h-3 rounded-full bg-neutral-700"></div>
								<div id="midi-beat-3" class="w-3 h-3 rounded-full bg-neutral-700"></div>
							</div>
							<div id="midi-beat-flash" class="flex-1 h-3 bg-neutral-800 rounded overflow-hidden">
								<div id="midi-beat-bar" class="h-full bg-blue-500 rounded" style="width: 0%; transition: width 50ms;"></div>
							</div>
						</div>
						<!-- Note activity bars -->
						<div class="flex gap-px h-6" id="midi-note-bars">
							${Array.from({ length: 16 }, (_, i) => `<div class="flex-1 bg-neutral-800 rounded-t flex flex-col justify-end"><div id="midi-note-bar-${i}" class="bg-purple-500 rounded-t" style="height: 0%; transition: height 100ms;"></div></div>`).join('')}
						</div>
						<div class="flex items-center justify-between mt-1">
							<span class="text-xs text-neutral-600">Notes</span>
							<span id="midi-last-msg" class="text-xs text-neutral-600 font-mono truncate ml-2"></span>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	private setupListeners(): void {
		this.querySelector('#btn-add-media')?.addEventListener('click', () => this.addMedia());
		this.querySelector('#btn-add-text')?.addEventListener('click', () => this.addText());
		this.querySelector('#btn-add-color')?.addEventListener('click', () => this.addColor());

		// MIDI test player
		this.querySelector('#btn-midi-test')?.addEventListener('click', () => {
			const panel = document.querySelector('midi-test-panel') as MidiTestPanel | null;
			if (panel) panel.show();
		});

		// MIDI device connect
		const midiConnectBtn = this.querySelector('#btn-midi-connect') as HTMLElement;
		const midiDeviceSelect = this.querySelector('#midi-device') as HTMLSelectElement;

		midiConnectBtn?.addEventListener('click', async () => {
			if (midiSync.connected) {
				midiSync.disconnect();
				midiConnectBtn.textContent = 'Connect';
				midiConnectBtn.classList.remove('bg-green-700', 'border-green-600', 'text-green-100');
				midiConnectBtn.classList.add('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
				if (midiDeviceSelect) midiDeviceSelect.innerHTML = '<option value="">No MIDI device</option>';
			} else {
				const ok = await midiSync.init();
				if (ok) {
					midiConnectBtn.textContent = 'Disconnect';
					midiConnectBtn.classList.remove('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
					midiConnectBtn.classList.add('bg-green-700', 'border-green-600', 'text-green-100');
					this.populateMidiDevices();
				}
			}
		});

		midiDeviceSelect?.addEventListener('change', () => {
			midiSync.selectDevice(midiDeviceSelect.value || null);
		});

		// Audio source selector
		const audioSourceSelect = this.querySelector('#audio-source') as HTMLSelectElement;
		audioSourceSelect?.addEventListener('change', () => {
			state.audioSourceId = audioSourceSelect.value || null;
		});
		this.enumerateAudioDevices();

		// Threshold slider
		const thresholdSlider = this.querySelector('#meter-threshold') as HTMLInputElement;
		thresholdSlider?.addEventListener('input', () => {
			const val = parseInt(thresholdSlider.value);
			audioAnalyzer.threshold = val / 100;
			const label = this.querySelector('#meter-threshold-value');
			if (label) label.textContent = `${val}%`;
			const marker = this.querySelector('#meter-threshold-marker') as HTMLElement;
			if (marker) marker.style.left = `${val}%`;
		});

		// Beat sensitivity slider
		const beatSensSlider = this.querySelector('#meter-beat-sens') as HTMLInputElement;
		beatSensSlider?.addEventListener('input', () => {
			const val = parseInt(beatSensSlider.value) / 10;
			audioAnalyzer.beatSensitivity = val;
			const label = this.querySelector('#meter-beat-sens-value');
			if (label) label.textContent = `${val.toFixed(1)}x`;
		});

		const micBtn = this.querySelector('#btn-mic-toggle') as HTMLElement;
		micBtn?.addEventListener('click', async () => {
			if (audioAnalyzer.running) {
				await audioAnalyzer.stop();
				micBtn.textContent = 'Mic';
				micBtn.classList.remove('bg-green-700', 'border-green-600', 'text-green-100');
				micBtn.classList.add('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
			} else {
				await audioAnalyzer.start(state.audioSourceId ?? undefined);
				micBtn.textContent = 'Mic On';
				micBtn.classList.remove('bg-neutral-800', 'border-neutral-600', 'text-neutral-300');
				micBtn.classList.add('bg-green-700', 'border-green-600', 'text-green-100');
				this.enumerateAudioDevices();
			}
		});
	}

	private midiBeatCount = 0;
	private noteDecay: number[] = new Array(16).fill(0);

	private setupMidiVisuals(): void {
		midiSync.onBeat(() => {
			this.midiBeatCount++;

			// Beat dots
			const dotIndex = (this.midiBeatCount - 1) % 4;
			for (let i = 0; i < 4; i++) {
				const dot = this.querySelector(`#midi-beat-${i}`) as HTMLElement;
				if (dot) dot.className = `w-3 h-3 rounded-full ${i === dotIndex ? 'bg-blue-400' : 'bg-neutral-700'}`;
			}

			// Beat flash bar
			const beatBar = this.querySelector('#midi-beat-bar') as HTMLElement;
			if (beatBar) {
				beatBar.style.width = '100%';
				setTimeout(() => { if (beatBar) beatBar.style.width = '0%'; }, 150);
			}

			// BPM display
			const bpmEl = this.querySelector('#midi-bpm-display');
			if (bpmEl) bpmEl.textContent = `${midiSync.bpm || '--'} BPM`;
		});

		midiSync.onMessage((msg) => {
			// Last message display
			const lastEl = this.querySelector('#midi-last-msg');
			if (lastEl) {
				if (msg.type === 'noteon') lastEl.textContent = `N${msg.note} v${msg.velocity}`;
				else if (msg.type === 'cc') lastEl.textContent = `CC${msg.cc}=${msg.value}`;
				else lastEl.textContent = msg.type;
			}

			// Note bars — map note to one of 16 bars
			if (msg.type === 'noteon' && msg.note !== undefined && msg.velocity) {
				const barIndex = Math.floor((msg.note % 128) / 8);
				if (barIndex < 16) this.noteDecay[barIndex] = msg.velocity / 127;
			}
		});
	}

	private async enumerateAudioDevices(): Promise<void> {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioDevices = devices.filter(d => d.kind === 'audioinput');
			const select = this.querySelector('#audio-source') as HTMLSelectElement;
			if (!select) return;
			const prev = select.value;
			select.innerHTML = '<option value="">Default</option>' +
				audioDevices.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId.slice(0, 12)}</option>`).join('');
			if (prev && audioDevices.some(d => d.deviceId === prev)) {
				select.value = prev;
			}
		} catch {
			// No permission yet — will populate after mic is started
		}
	}

	private populateMidiDevices(): void {
		const select = this.querySelector('#midi-device') as HTMLSelectElement;
		if (!select) return;
		const devices = midiSync.devices;
		select.innerHTML = '<option value="">All devices</option>' +
			devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
	}

	private startMeter(): void {
		this.setupMidiVisuals();

		const tick = (): void => {
			this.meterRafId = requestAnimationFrame(tick);

			// MIDI note bar decay
			for (let i = 0; i < 16; i++) {
				if (this.noteDecay[i] > 0) {
					const bar = this.querySelector(`#midi-note-bar-${i}`) as HTMLElement;
					if (bar) {
						const pct = Math.round(this.noteDecay[i] * 100);
						bar.style.height = `${pct}%`;
						if (pct > 80) bar.className = 'bg-red-500 rounded-t';
						else if (pct > 50) bar.className = 'bg-yellow-500 rounded-t';
						else bar.className = 'bg-purple-500 rounded-t';
					}
					this.noteDecay[i] *= 0.92; // decay
					if (this.noteDecay[i] < 0.01) this.noteDecay[i] = 0;
				}
			}

			if (!audioAnalyzer.running) return;

			const level = audioAnalyzer.level;
			const pct = Math.min(100, Math.round(level * 100));
			const db = level > 0 ? Math.max(-60, Math.round(20 * Math.log10(level))) : -Infinity;

			// Level bar
			const bar = this.querySelector('#meter-bar') as HTMLElement;
			if (bar) {
				bar.style.width = `${pct}%`;
				if (pct > 80) {
					bar.className = 'h-full bg-red-500 rounded';
				} else if (pct > 50) {
					bar.className = 'h-full bg-yellow-500 rounded';
				} else {
					bar.className = 'h-full bg-green-500 rounded';
				}
			}

			// dB display
			const dbEl = this.querySelector('#meter-db');
			if (dbEl) dbEl.textContent = isFinite(db) ? `${db} dB` : '-∞ dB';

			// Peak display
			const peakEl = this.querySelector('#meter-peak');
			if (peakEl) peakEl.textContent = `${pct}%`;

			// Active dot — green when above threshold, red when below
			const activeDot = this.querySelector('#meter-active-dot') as HTMLElement;
			if (activeDot) {
				activeDot.className = `w-2 h-2 rounded-full ${audioAnalyzer.isAboveThreshold ? 'bg-green-400' : 'bg-red-500'}`;
			}

			// Beat detection dot
			const beatDot = this.querySelector('#meter-beat-dot') as HTMLElement;
			if (beatDot) {
				beatDot.className = `w-2 h-2 rounded-full ${audioAnalyzer.beatDetected ? 'bg-yellow-400' : 'bg-neutral-700'}`;
			}

			// BPM from beat detection
			const bpmEl = this.querySelector('#meter-bpm');
			if (bpmEl) {
				bpmEl.textContent = audioAnalyzer.bpm > 0 ? `${audioAnalyzer.bpm} BPM` : '';
			}

			// Frequency bars
			const analyser = audioAnalyzer.analyser;
			if (analyser) {
				const freqData = new Uint8Array(analyser.frequencyBinCount);
				analyser.getByteFrequencyData(freqData);
				const barCount = 32;
				const binSize = Math.floor(freqData.length / barCount);
				for (let i = 0; i < barCount; i++) {
					let sum = 0;
					for (let j = 0; j < binSize; j++) {
						sum += freqData[i * binSize + j];
					}
					const avg = sum / binSize / 255 * 100;
					const freqBar = this.querySelector(`#freq-bar-${i}`) as HTMLElement;
					if (freqBar) {
						freqBar.style.height = `${avg}%`;
						if (avg > 80) {
							freqBar.className = 'bg-red-500 rounded-t';
						} else if (avg > 50) {
							freqBar.className = 'bg-yellow-500 rounded-t';
						} else {
							freqBar.className = 'bg-green-500 rounded-t';
						}
					}
				}
			}
		};
		tick();
	}

	private async addMedia(): Promise<void> {
		const files = await window.promap.uploadMedia();
		for (const file of files) {
			const src = `media://${file.filename}`;
			const thumbnail = file.type === 'video'
				? await this.generateVideoThumbnail(src)
				: src;
			state.addResource({
				name: file.name,
				type: file.type as 'video' | 'image',
				src,
				thumbnail,
			});
		}
	}

	private generateVideoThumbnail(src: string): Promise<string> {
		return new Promise((resolve) => {
			const video = document.createElement('video');
			video.src = src;
			video.muted = true;
			video.preload = 'auto';
			video.crossOrigin = 'anonymous';

			video.addEventListener('loadeddata', () => {
				video.currentTime = 0;
			});

			video.addEventListener('seeked', () => {
				const canvas = document.createElement('canvas');
				canvas.width = 64;
				canvas.height = 36;
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				resolve(canvas.toDataURL('image/jpeg', 0.7));
				video.remove();
			});

			// Fallback if video fails to load
			video.addEventListener('error', () => {
				resolve('');
				video.remove();
			});
		});
	}

	private addText(): void {
		const modal = document.querySelector('text-modal') as TextModal | null;
		if (modal) modal.show();
	}

	private addColor(): void {
		const modal = document.querySelector('color-modal') as ColorModal | null;
		if (modal) modal.show();
	}

	private renderList(): void {
		const list = this.querySelector('#resources-list');
		if (!list) return;

		const resources = state.getResources();
		if (resources.length === 0) {
			list.innerHTML = '<div class="text-xs text-neutral-500 text-center py-8">No resources</div>';
			return;
		}

		list.innerHTML = resources.map(r => this.renderItem(r)).join('');

		list.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				state.removeResource(btn.dataset.remove!);
			});
		});

		list.querySelectorAll<HTMLElement>('[data-resource-id]').forEach(el => {
			el.addEventListener('dragstart', (e) => {
				e.dataTransfer?.setData('text/plain', el.dataset.resourceId!);
			});
			el.addEventListener('dblclick', () => {
				const res = state.getResources().find(r => r.id === el.dataset.resourceId);
				if (res?.type === 'text') {
					(document.querySelector('text-modal') as TextModal | null)?.show(res.id);
				} else if (res?.type === 'color') {
					(document.querySelector('color-modal') as ColorModal | null)?.show(res.id);
				}
			});
		});
	}

	private renderItem(r: ResourceData): string {
		const thumbSrc = r.thumbnail || r.src;
		const hasThumb = thumbSrc && thumbSrc.length > 0;

		return `
			<div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 cursor-grab mb-1 group" draggable="true" data-resource-id="${r.id}">
				${hasThumb
					? `<img src="${thumbSrc}" draggable="false" class="w-10 h-7 object-cover rounded border border-neutral-700 shrink-0 pointer-events-none" alt="">`
					: `<div class="w-10 h-7 rounded border border-neutral-700 bg-neutral-800 flex items-center justify-center text-xs text-neutral-500 shrink-0">T</div>`
				}
				<span class="text-xs text-neutral-300 truncate flex-1">${r.name}</span>
				<button data-remove="${r.id}" class="text-xs text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100">✕</button>
			</div>
		`;
	}
}

customElements.define('resources-panel', ResourcesPanel);
