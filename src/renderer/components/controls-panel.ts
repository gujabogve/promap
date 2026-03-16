import { state } from '../state/state-manager';
import { ShapeType } from '../types';
import { ShortcutsModal } from './shortcuts-modal';
import { canvasManager } from './canvas-panel';

export class ControlsPanel extends HTMLElement {
	private deviceRefreshTimer: ReturnType<typeof setInterval> | null = null;

	connectedCallback(): void {
		this.className = 'block h-12 bg-neutral-900 border-b border-neutral-700 px-4 shrink-0';
		this.render();
		this.setupListeners();
		this.initDeviceSources();
	}

	disconnectedCallback(): void {
		if (this.deviceRefreshTimer) {
			clearInterval(this.deviceRefreshTimer);
			this.deviceRefreshTimer = null;
		}
		window.removeEventListener('focus', this.boundRefreshDevices);
	}

	private setupListeners(): void {
		const shapeSelect = this.querySelector('#shape-type-select') as HTMLSelectElement;
		const nShapePoints = this.querySelector('#n-shape-points') as HTMLInputElement;
		const addBtn = this.querySelector('#add-shape-btn') as HTMLButtonElement;
		const fpsSlider = this.querySelector('#global-fps') as HTMLInputElement;
		const fpsValue = this.querySelector('#global-fps-value') as HTMLSpanElement;

		shapeSelect.addEventListener('change', () => {
			nShapePoints.classList.toggle('hidden', shapeSelect.value !== 'n-shape');
		});

		addBtn.addEventListener('click', () => {
			const type = shapeSelect.value as ShapeType;
			const nPoints = type === 'n-shape' ? parseInt(nShapePoints.value) : undefined;
			state.addShape(type, nPoints);
		});

		fpsSlider.addEventListener('input', () => {
			fpsValue.textContent = fpsSlider.value;
			state.globalFps = parseInt(fpsSlider.value);
		});

		const playAllBtn = this.querySelector('#play-all-btn') as HTMLButtonElement;
		playAllBtn.addEventListener('click', () => {
			const shapes = state.getShapes();
			const anyPlaying = shapes.some(s => !s.ignoreGlobalPlayPause && s.playing);
			shapes.forEach(s => {
				if (!s.ignoreGlobalPlayPause) {
					state.updateShape(s.id, { playing: !anyPlaying });
				}
			});
			playAllBtn.textContent = anyPlaying ? '▶ Play All' : '⏸ Pause All';
		});

		this.querySelector('#btn-undo')?.addEventListener('click', () => state.undo());
		this.querySelector('#btn-redo')?.addEventListener('click', () => state.redo());

		this.querySelector('#btn-save')?.addEventListener('click', () => state.save());
		this.querySelector('#btn-load')?.addEventListener('click', async () => {
			const loaded = await state.load();
			if (loaded) {
				fpsSlider.value = String(state.globalFps);
				fpsValue.textContent = String(state.globalFps);
				resWidth.value = String(state.resolution.x);
				resHeight.value = String(state.resolution.y);
			}
		});

		const extBtn = this.querySelector('#btn-external') as HTMLButtonElement;
		extBtn.addEventListener('click', async () => {
			await state.toggleExternalWindow();
			extBtn.textContent = state.externalOpen ? 'Close External' : 'External Window';
		});

		window.promap.onExternalWindowClosed(() => {
			state.externalOpen = false;
			extBtn.textContent = 'External Window';
		});

		this.querySelector('#chk-outline')?.addEventListener('change', (e) => {
			state.setExternalToggle('externalShowOutline', (e.target as HTMLInputElement).checked);
		});
		this.querySelector('#chk-points')?.addEventListener('change', (e) => {
			state.setExternalToggle('externalShowPoints', (e.target as HTMLInputElement).checked);
		});
		this.querySelector('#chk-grid')?.addEventListener('change', (e) => {
			state.setExternalToggle('externalShowGrid', (e.target as HTMLInputElement).checked);
		});

		const resWidth = this.querySelector('#res-width') as HTMLInputElement;
		const resHeight = this.querySelector('#res-height') as HTMLInputElement;

		resWidth.addEventListener('change', () => {
			const val = parseInt(resWidth.value);
			if (val > 0) {
				state.setResolution({ ...state.resolution, x: val });
			}
		});

		resHeight.addEventListener('change', () => {
			const val = parseInt(resHeight.value);
			if (val > 0) {
				state.setResolution({ ...state.resolution, y: val });
			}
		});

		this.querySelector('#chk-canvas-grid')?.addEventListener('change', (e) => {
			if (canvasManager) canvasManager.showGrid = (e.target as HTMLInputElement).checked;
		});
		this.querySelector('#chk-snap')?.addEventListener('change', (e) => {
			if (canvasManager) canvasManager.snapToGrid = (e.target as HTMLInputElement).checked;
		});

		this.querySelector('#btn-shortcuts')?.addEventListener('click', () => {
			(document.querySelector('shortcuts-modal') as ShortcutsModal)?.toggle();
		});
	}

	private boundRefreshDevices = (): void => { this.enumerateDevices(); };

	private async initDeviceSources(): Promise<void> {
		// Request permission so device labels are available
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
			stream.getTracks().forEach(t => t.stop());
		} catch {
			// Permission denied or no devices — enumerate anyway for deviceIds
		}

		await this.enumerateDevices();

		const audioSelect = this.querySelector('#audio-source') as HTMLSelectElement;
		const hdmiSelect = this.querySelector('#hdmi-source') as HTMLSelectElement;

		audioSelect.addEventListener('change', () => {
			state.audioSourceId = audioSelect.value || null;
		});
		hdmiSelect.addEventListener('change', () => {
			state.hdmiSourceId = hdmiSelect.value || null;
		});

		// Refresh on window focus and every 10 seconds
		window.addEventListener('focus', this.boundRefreshDevices);
		this.deviceRefreshTimer = setInterval(() => this.enumerateDevices(), 10000);
	}

	private async enumerateDevices(): Promise<void> {
		const devices = await navigator.mediaDevices.enumerateDevices();
		const audioSelect = this.querySelector('#audio-source') as HTMLSelectElement | null;
		const hdmiSelect = this.querySelector('#hdmi-source') as HTMLSelectElement | null;
		if (!audioSelect || !hdmiSelect) return;

		const audioDevices = devices.filter(d => d.kind === 'audioinput');
		const videoDevices = devices.filter(d => d.kind === 'videoinput');

		const prevAudio = audioSelect.value;
		const prevHdmi = hdmiSelect.value;

		audioSelect.innerHTML = '<option value="">No Audio Source</option>' +
			audioDevices.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId}</option>`).join('');
		hdmiSelect.innerHTML = '<option value="">No HDMI Source</option>' +
			videoDevices.map(d => `<option value="${d.deviceId}">${d.label || d.deviceId}</option>`).join('');

		// Restore previous selection if still available
		if (prevAudio && audioDevices.some(d => d.deviceId === prevAudio)) {
			audioSelect.value = prevAudio;
		} else {
			audioSelect.value = '';
			state.audioSourceId = null;
		}

		if (prevHdmi && videoDevices.some(d => d.deviceId === prevHdmi)) {
			hdmiSelect.value = prevHdmi;
		} else {
			hdmiSelect.value = '';
			state.hdmiSourceId = null;
		}
	}

	private render(): void {
		this.innerHTML = `
			<div class="flex items-center h-full gap-2">
				<span class="font-bold text-sm text-neutral-100 mr-2">ProMap</span>
				<div class="h-5 w-px bg-neutral-700"></div>

				<button id="btn-save" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Save</button>
				<button id="btn-load" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Load</button>
				<div class="h-5 w-px bg-neutral-700"></div>
				<button id="btn-undo" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300" title="Undo (Ctrl+Z)">↩</button>
				<button id="btn-redo" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300" title="Redo (Ctrl+Shift+Z)">↪</button>

				<div class="h-5 w-px bg-neutral-700"></div>

				<select id="shape-type-select" class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
					<option value="circle">Circle</option>
					<option value="triangle">Triangle</option>
					<option value="square">Square</option>
					<option value="n-shape">N-Shape</option>
				</select>
				<input id="n-shape-points" type="number" min="5" max="20" value="5" class="hidden w-12 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center" title="Points">
				<button id="add-shape-btn" class="px-2.5 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">+ Add</button>

				<div class="h-5 w-px bg-neutral-700"></div>

				<select id="audio-source" class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
					<option value="">No Audio Source</option>
				</select>
				<select id="hdmi-source" class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
					<option value="">No HDMI Source</option>
				</select>

				<div class="h-5 w-px bg-neutral-700"></div>

				<button id="play-all-btn" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">▶ Play All</button>
				<label class="text-xs text-neutral-400 flex items-center gap-1">
					FPS
					<input id="global-fps" type="range" min="1" max="120" value="30" class="w-20 accent-blue-500">
					<span id="global-fps-value" class="text-xs text-neutral-300 w-6 text-right">30</span>
				</label>

				<div class="h-5 w-px bg-neutral-700"></div>

				<label class="text-xs text-neutral-400 flex items-center gap-1">
					Resolution
					<input id="res-width" type="number" value="${state.resolution.x}" min="1" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
					x
					<input id="res-height" type="number" value="${state.resolution.y}" min="1" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
				</label>

				<div class="h-5 w-px bg-neutral-700"></div>
				<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="chk-canvas-grid" type="checkbox" class="accent-blue-500"> Grid</label>
				<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="chk-snap" type="checkbox" class="accent-blue-500"> Snap</label>

				<div class="flex-1"></div>

				<button id="btn-external" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">External Window</button>
				<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="chk-outline" type="checkbox" class="accent-blue-500"> Outline</label>
				<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="chk-points" type="checkbox" class="accent-blue-500"> Points</label>
				<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="chk-grid" type="checkbox" class="accent-blue-500"> Grid</label>
				<button id="btn-shortcuts" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300" title="Shortcuts (?)">⌨</button>
			</div>
		`;
	}
}

customElements.define('controls-panel', ControlsPanel);
