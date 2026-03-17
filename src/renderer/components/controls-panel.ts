import { state } from '../state/state-manager';
import { ShapeType } from '../types';
import { ShortcutsModal } from './shortcuts-modal';
import { canvasManager } from './canvas-panel';

export class ControlsPanel extends HTMLElement {
	connectedCallback(): void {
		this.className = 'block h-12 bg-neutral-900 border-b border-neutral-700 px-4 shrink-0';
		this.render();
		this.setupListeners();
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
			const anyPlaying = shapes.some(s => !s.ignoreGlobalPlayPause && s.playing) || state.isAnyGroupAnimationPlaying();
			shapes.forEach(s => {
				if (!s.ignoreGlobalPlayPause) {
					state.updateShape(s.id, { playing: !anyPlaying });
				}
			});
			state.toggleAllGroupAnimations(!anyPlaying);
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

		window.promap.onExternalWindowClosed((projectorId: number) => {
			state.openProjectors.delete(projectorId);
			state.externalOpen = state.openProjectors.size > 0;
		});

		// Resolution preset
		const resPreset = this.querySelector('#res-preset') as HTMLSelectElement;
		const resCustom = this.querySelector('#res-custom') as HTMLElement;
		const resWidth = this.querySelector('#res-width') as HTMLInputElement;
		const resHeight = this.querySelector('#res-height') as HTMLInputElement;

		resPreset?.addEventListener('change', () => {
			const val = resPreset.value;
			if (val === 'custom') {
				resCustom?.classList.remove('hidden');
			} else {
				resCustom?.classList.add('hidden');
				const [w, h] = val.split('x').map(Number);
				state.setResolution({ x: w, y: h });
				if (resWidth) resWidth.value = String(w);
				if (resHeight) resHeight.value = String(h);
			}
		});

		resWidth?.addEventListener('change', () => {
			const val = parseInt(resWidth.value);
			if (val > 0) state.setResolution({ ...state.resolution, x: val });
		});
		resHeight?.addEventListener('change', () => {
			const val = parseInt(resHeight.value);
			if (val > 0) state.setResolution({ ...state.resolution, y: val });
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

		this.querySelector('#btn-install-update')?.addEventListener('click', () => {
			window.promap.installUpdate();
		});
	}


	private static readonly RESOLUTIONS = [
		{ value: '7680x4320', label: '8K — 7680×4320' },
		{ value: '3840x2160', label: '4K — 3840×2160' },
		{ value: '2560x1440', label: '2K — 2560×1440' },
		{ value: '1920x1080', label: 'Full HD — 1920×1080' },
		{ value: '1280x720', label: 'HD — 1280×720' },
		{ value: '1024x768', label: 'XGA — 1024×768' },
		{ value: '800x600', label: 'SVGA — 800×600' },
		{ value: '640x480', label: 'SD — 640×480' },
	];

	private isPresetResolution(): boolean {
		return ControlsPanel.RESOLUTIONS.some(r => r.value === `${state.resolution.x}x${state.resolution.y}`);
	}

	private renderResolutionOptions(): string {
		const current = `${state.resolution.x}x${state.resolution.y}`;
		return ControlsPanel.RESOLUTIONS.map(r =>
			`<option value="${r.value}" ${r.value === current ? 'selected' : ''}>${r.label}</option>`
		).join('') +
		`<option value="custom" ${!this.isPresetResolution() ? 'selected' : ''}>Custom</option>`;
	}

	private render(): void {
		this.innerHTML = `
			<div class="flex items-center h-full gap-2">
				<img src="./assets/titlebar.svg" class="h-8 mr-2" alt="ProMap" draggable="false">
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

				<button id="play-all-btn" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">▶ Play All</button>
				<label class="text-xs text-neutral-400 flex items-center gap-1">
					FPS
					<input id="global-fps" type="range" min="1" max="120" value="30" class="w-20 accent-blue-500">
					<span id="global-fps-value" class="text-xs text-neutral-300 w-6 text-right">30</span>
				</label>

				<div class="h-5 w-px bg-neutral-700"></div>

				<select id="res-preset" class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
					${this.renderResolutionOptions()}
				</select>
				<div id="res-custom" class="${this.isPresetResolution() ? 'hidden' : ''} flex items-center gap-1">
					<input id="res-width" type="number" value="${state.resolution.x}" min="1" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
					<span class="text-xs text-neutral-500">×</span>
					<input id="res-height" type="number" value="${state.resolution.y}" min="1" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
				</div>

				<div class="h-5 w-px bg-neutral-700"></div>
				<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="chk-canvas-grid" type="checkbox" class="accent-blue-500"> Grid</label>
				<label class="text-xs text-neutral-400 flex items-center gap-1"><input id="chk-snap" type="checkbox" class="accent-blue-500"> Snap</label>

				<div class="flex-1"></div>

				<span id="update-status" class="text-xs text-neutral-500 hidden"></span>
				<button id="btn-install-update" class="px-2.5 py-1 text-xs bg-green-700 hover:bg-green-600 rounded border border-green-600 text-green-100 hidden">Update</button>
				<button id="btn-shortcuts" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300" title="Shortcuts (?)">⌨</button>
				<span id="app-version" class="text-xs text-neutral-600"></span>
			</div>
		`;

		window.promap.getAppVersion().then(v => {
			const el = this.querySelector('#app-version');
			if (el) el.textContent = `v${v}`;
		});

		window.promap.onUpdateStatus((status) => {
			const statusEl = this.querySelector('#update-status') as HTMLElement;
			const installBtn = this.querySelector('#btn-install-update') as HTMLElement;
			if (!statusEl) return;

			if (status.status === 'available') {
				statusEl.textContent = `v${status.version} available`;
				statusEl.classList.remove('hidden');
			} else if (status.status === 'downloading') {
				statusEl.textContent = `Downloading ${status.percent}%`;
				statusEl.classList.remove('hidden');
			} else if (status.status === 'ready') {
				statusEl.textContent = `v${status.version} ready`;
				statusEl.classList.remove('hidden');
				installBtn?.classList.remove('hidden');
			}
		});
	}
}

customElements.define('controls-panel', ControlsPanel);
