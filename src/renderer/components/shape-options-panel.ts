import { state } from '../state/state-manager';
import { ShapeData } from '../types';

export class ShapeOptionsPanel extends HTMLElement {
	private currentShapeId: string | null = null;
	private currentResource: string | null = null;
	private currentResourceCount = 0;
	private updating = false;

	connectedCallback(): void {
		this.className = 'block w-64 bg-neutral-900 border-l border-neutral-700 overflow-y-auto shrink-0';
		this.renderEmpty();
		state.subscribe(() => this.onStateChange());
	}

	private onStateChange(): void {
		if (this.updating) return;

		const shape = state.getSelectedShape();
		if (!shape) {
			if (this.currentShapeId !== null) {
				this.currentShapeId = null;
				this.renderEmpty();
			}
			return;
		}

		const resourceCount = state.getResources().length;
		if (shape.id !== this.currentShapeId || shape.resource !== this.currentResource || resourceCount !== this.currentResourceCount) {
			this.currentShapeId = shape.id;
			this.currentResource = shape.resource;
			this.currentResourceCount = resourceCount;
			this.renderForm(shape);
		} else {
			this.updateValues(shape);
		}
	}

	private renderEmpty(): void {
		const shapes = state.getShapes();
		if (shapes.length === 0) {
			this.innerHTML = `
				<div class="p-3">
					<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Shapes</h2>
					<div class="text-xs text-neutral-500 text-center py-8">No shapes yet</div>
				</div>
			`;
			return;
		}

		const listHtml = shapes.map(s => `
			<div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800 mb-1 ${s.visible === false ? 'opacity-40' : ''}">
				<button class="text-xs ${s.visible === false ? 'text-neutral-600' : 'text-neutral-400'} hover:text-neutral-200 shrink-0" data-toggle-vis="${s.id}" title="Toggle visibility">${s.visible === false ? '◇' : '◆'}</button>
				<span class="text-xs text-neutral-400 shrink-0">${s.type === 'circle' ? '●' : s.type === 'triangle' ? '▲' : s.type === 'square' ? '■' : '⬡'}</span>
				<span class="text-xs text-neutral-300 truncate flex-1 cursor-pointer" data-select-shape="${s.id}">${s.name}</span>
			</div>
		`).join('');

		this.innerHTML = `
			<div class="p-3">
				<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Shapes</h2>
				${listHtml}
			</div>
		`;

		this.querySelectorAll<HTMLElement>('[data-select-shape]').forEach(el => {
			el.addEventListener('click', () => state.selectShape(el.dataset.selectShape!));
		});
		this.querySelectorAll<HTMLElement>('[data-toggle-vis]').forEach(el => {
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				const shape = state.getShapes().find(s => s.id === el.dataset.toggleVis);
				if (shape) state.updateShape(shape.id, { visible: shape.visible === false ? true : false });
			});
		});
	}

	private renderForm(shape: ShapeData): void {
		const pointsHtml = shape.type === 'circle' ? '' : shape.points.map((p, i) => `
			<div class="flex gap-1.5 text-xs text-neutral-500">
				<span class="w-4">${i + 1}</span>
				<label class="flex items-center gap-0.5">X <input data-point-x="${i}" type="number" value="${Math.round(p.x)}" class="w-12 px-1 py-0.5 bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center text-xs"></label>
				<label class="flex items-center gap-0.5">Y <input data-point-y="${i}" type="number" value="${Math.round(p.y)}" class="w-12 px-1 py-0.5 bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center text-xs"></label>
			</div>
		`).join('');

		// Find groups this shape belongs to
		const shapeGroups: { id: string; name: string }[] = [];
		for (const [gId, g] of state.getGroups()) {
			if (g.shapeIds.includes(shape.id)) {
				shapeGroups.push({ id: gId, name: g.name });
			}
		}

		this.innerHTML = `
			<div class="p-3 space-y-3">
				<h2 class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Shape Options</h2>

				<!-- Group membership -->
				${shapeGroups.length > 0 ? `
				<div class="px-2 py-1.5 bg-blue-900/30 border border-blue-800/50 rounded">
					<span class="text-xs text-blue-400">Group: ${shapeGroups.map(g => `<button class="hover:text-blue-300 underline" data-goto-group="${g.id}">${g.name}</button>`).join(', ')}</span>
					<div class="text-xs text-blue-500/70 mt-0.5">Some options may be managed by group. Changes here override group settings.</div>
				</div>
				` : ''}

				<!-- Name -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Name</label>
					<input id="shape-name" type="text" value="${shape.name}" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
				</div>

				<!-- Actions -->
				<div class="flex gap-1.5">
					<button id="btn-visibility" class="px-2 py-1 text-xs ${shape.visible === false ? 'bg-neutral-700 text-neutral-500' : 'bg-neutral-800 text-neutral-300'} hover:bg-neutral-700 rounded border border-neutral-600" title="Toggle visibility">${shape.visible === false ? '◇ Hidden' : '◆ Visible'}</button>
					<button id="btn-duplicate" class="flex-1 px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Duplicate</button>
					<button id="btn-delete" class="flex-1 px-2 py-1 text-xs bg-red-900 hover:bg-red-800 rounded border border-red-700 text-red-300">Delete</button>
				</div>

				<!-- Position -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Position</label>
					<div class="flex gap-1.5">
						<label class="text-xs text-neutral-500 flex items-center gap-1">X <input id="shape-x" type="number" value="${Math.round(shape.position.x)}" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center"></label>
						<label class="text-xs text-neutral-500 flex items-center gap-1">Y <input id="shape-y" type="number" value="${Math.round(shape.position.y)}" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center"></label>
					</div>
				</div>

				<!-- Size -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Size</label>
					<div class="flex gap-1.5 items-center">
						<label class="text-xs text-neutral-500 flex items-center gap-1">W <input id="shape-w" type="number" value="${Math.round(shape.size.x)}" min="10" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center"></label>
						<label class="text-xs text-neutral-500 flex items-center gap-1">H <input id="shape-h" type="number" value="${Math.round(shape.size.y)}" min="10" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center"></label>
						<button id="btn-w-to-h" class="px-1 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-400" title="Set H = W">W→H</button>
						<button id="btn-h-to-w" class="px-1 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-400" title="Set W = H">H→W</button>
					</div>
				</div>

				<!-- Rotation -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Rotation</label>
					<div class="flex items-center gap-1.5">
						<input id="shape-rotation" type="range" min="0" max="360" value="${shape.rotation}" class="flex-1 accent-blue-500">
						<span id="shape-rotation-value" class="text-xs text-neutral-400 w-8 text-right">${shape.rotation}°</span>
					</div>
				</div>

				<!-- Z-Order -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Layer</label>
					<div class="flex gap-1.5">
						<button id="btn-layer-up" class="flex-1 px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">↑ Up</button>
						<button id="btn-layer-down" class="flex-1 px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">↓ Down</button>
					</div>
				</div>

				${shape.type !== 'circle' ? `
				<!-- Points -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Points</label>
					<div id="points-list" class="space-y-1 max-h-32 overflow-y-auto">${pointsHtml}</div>
				</div>
				` : ''}

				<div class="h-px bg-neutral-700"></div>

				<!-- Resource -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Resource</label>
					${this.renderResourceBadge(shape)}
					<select id="shape-resource" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
						<option value="">None</option>
						${state.getResources().map(r => `<option value="${r.id}" ${shape.resource === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
					</select>
				</div>

				<!-- Projector -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Projector</label>
					<select id="shape-projector" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
						${[1, 2, 3, 4].map(n => `<option value="${n}" ${shape.projector === n ? 'selected' : ''}>Projector ${n}</option>`).join('')}
					</select>
				</div>

				<!-- Projection Type -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Projection Type</label>
					<select id="shape-projection-type" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
						<option value="default" ${shape.projectionType === 'default' ? 'selected' : ''}>Default (stretch)</option>
						<option value="fit" ${shape.projectionType === 'fit' ? 'selected' : ''}>Fit (aspect ratio)</option>
						<option value="masked" ${shape.projectionType === 'masked' || shape.projectionType === 'mapped' ? 'selected' : ''}>Masked (window)</option>
					</select>
				</div>

				${shape.projectionType !== 'default' && shape.resource ? `
				<button id="btn-position-mask" class="w-full px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Position Resource</button>
				` : ''}

				<div class="h-px bg-neutral-700"></div>

				<!-- Playback -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Playback</label>
					<div class="flex gap-1.5 items-center mb-1.5">
						<button id="btn-play" class="px-2.5 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">${shape.playing ? '⏸' : '▶'}</button>
						<label class="text-xs text-neutral-400 flex items-center gap-1">
							FPS
							<input id="shape-fps" type="range" min="1" max="120" value="${shape.fps}" class="w-20 accent-blue-500">
							<span id="shape-fps-value" class="text-xs text-neutral-300 w-6 text-right">${shape.fps}</span>
						</label>
					</div>
					<div class="flex flex-col gap-1.5">
						<label class="text-xs text-neutral-400 flex items-center gap-1.5"><input id="shape-loop" type="checkbox" ${shape.loop ? 'checked' : ''} class="accent-blue-500"> Loop</label>
						<label class="text-xs text-neutral-400 flex items-center gap-1.5"><input id="shape-ignore-global" type="checkbox" ${shape.ignoreGlobalPlayPause ? 'checked' : ''} class="accent-blue-500"> Ignore global play/pause</label>
					</div>
				</div>

				<!-- BPM -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">BPM Sync</label>
					<label class="text-xs text-neutral-400 flex items-center gap-1.5"><input id="shape-bpm" type="checkbox" ${shape.bpmSync ? 'checked' : ''} class="accent-blue-500"> Use mic for BPM</label>
					<label class="text-xs text-neutral-400 flex items-center gap-1.5"><input id="shape-midi" type="checkbox" ${shape.midiSync ? 'checked' : ''} class="accent-blue-500"> Use MIDI for BPM</label>
				</div>

				<div class="h-px bg-neutral-700"></div>

				<!-- Effects -->
				<div>
					<label class="text-xs text-neutral-400 block mb-1">Effects</label>
					<div class="space-y-2">
						${this.renderEffect('blur', 'Blur', shape.effects.blur)}
						${this.renderEffect('glow', 'Glow', shape.effects.glow)}
						${this.renderEffect('colorCorrection', 'Color Correction', shape.effects.colorCorrection)}
						${this.renderEffect('distortion', 'Distortion', shape.effects.distortion)}
						${this.renderEffect('glitch', 'Glitch', shape.effects.glitch)}
					</div>
				</div>
			</div>
		`;

		this.setupFormListeners(shape.id);
	}

	private renderResourceBadge(shape: ShapeData): string {
		if (!shape.resource) return '';
		const res = state.getResources().find(r => r.id === shape.resource);
		if (!res) return '';
		const icon = res.type === 'video' ? '🎬' : res.type === 'image' ? '🖼' : '📝';
		return `
			<div class="flex items-center gap-1.5 px-2 py-1 mb-1.5 bg-blue-900/40 border border-blue-700/50 rounded text-xs text-blue-300">
				<span>${icon}</span>
				<span class="truncate flex-1">${res.name}</span>
				<button id="btn-clear-resource" class="text-blue-400 hover:text-red-400">✕</button>
			</div>
		`;
	}

	private renderEffect(key: string, label: string, value: number): string {
		return `
			<div>
				<div class="flex justify-between text-xs text-neutral-500 mb-0.5">
					<span>${label}</span><span id="effect-${key}-value">${value}%</span>
				</div>
				<input id="effect-${key}" type="range" min="0" max="100" value="${value}" class="w-full accent-blue-500">
			</div>
		`;
	}

	private setupFormListeners(shapeId: string): void {
		const update = (updates: Partial<ShapeData>) => {
			this.updating = true;
			state.updateShape(shapeId, updates);
			this.updating = false;
		};

		// Group navigation
		this.querySelectorAll<HTMLElement>('[data-goto-group]').forEach(el => {
			el.addEventListener('click', () => {
				state.selectGroup(el.dataset.gotoGroup!);
			});
		});

		this.listen('shape-name', 'change', (el) => update({ name: (el as HTMLInputElement).value }));
		this.listen('shape-x', 'change', (el) => {
			const shape = state.getSelectedShape();
			if (shape) update({ position: { ...shape.position, x: parseInt((el as HTMLInputElement).value) } });
		});
		this.listen('shape-y', 'change', (el) => {
			const shape = state.getSelectedShape();
			if (shape) update({ position: { ...shape.position, y: parseInt((el as HTMLInputElement).value) } });
		});
		this.listen('shape-rotation', 'input', (el) => {
			const val = parseInt((el as HTMLInputElement).value);
			update({ rotation: val });
			const label = this.querySelector('#shape-rotation-value');
			if (label) label.textContent = `${val}°`;
		});

		this.listen('shape-w', 'change', (el) => {
			const shape = state.getSelectedShape();
			if (shape) update({ size: { ...shape.size, x: Math.max(10, parseInt((el as HTMLInputElement).value)) } });
		});
		this.listen('shape-h', 'change', (el) => {
			const shape = state.getSelectedShape();
			if (shape) update({ size: { ...shape.size, y: Math.max(10, parseInt((el as HTMLInputElement).value)) } });
		});

		this.querySelector('#btn-w-to-h')?.addEventListener('click', () => {
			const shape = state.getSelectedShape();
			if (shape) update({ size: { x: shape.size.x, y: shape.size.x } });
		});
		this.querySelector('#btn-h-to-w')?.addEventListener('click', () => {
			const shape = state.getSelectedShape();
			if (shape) update({ size: { x: shape.size.y, y: shape.size.y } });
		});

		// Point inputs
		this.querySelectorAll<HTMLInputElement>('[data-point-x]').forEach(el => {
			el.addEventListener('change', () => {
				const shape = state.getSelectedShape();
				if (!shape) return;
				const i = parseInt(el.dataset.pointX!);
				const newPoints = [...shape.points];
				newPoints[i] = { ...newPoints[i], x: parseInt(el.value) };
				update({ points: newPoints });
			});
		});
		this.querySelectorAll<HTMLInputElement>('[data-point-y]').forEach(el => {
			el.addEventListener('change', () => {
				const shape = state.getSelectedShape();
				if (!shape) return;
				const i = parseInt(el.dataset.pointY!);
				const newPoints = [...shape.points];
				newPoints[i] = { ...newPoints[i], y: parseInt(el.value) };
				update({ points: newPoints });
			});
		});

		this.listen('shape-fps', 'input', (el) => {
			const val = parseInt((el as HTMLInputElement).value);
			update({ fps: val });
			const label = this.querySelector('#shape-fps-value');
			if (label) label.textContent = String(val);
		});

		this.listen('shape-loop', 'change', (el) => update({ loop: (el as HTMLInputElement).checked }));
		this.listen('shape-ignore-global', 'change', (el) => update({ ignoreGlobalPlayPause: (el as HTMLInputElement).checked }));
		this.listen('shape-bpm', 'change', (el) => update({ bpmSync: (el as HTMLInputElement).checked }));
		this.listen('shape-midi', 'change', (el) => update({ midiSync: (el as HTMLInputElement).checked }));

		this.querySelector('#btn-play')?.addEventListener('click', () => {
			const shape = state.getSelectedShape();
			if (shape) {
				update({ playing: !shape.playing });
				const btn = this.querySelector('#btn-play');
				if (btn) btn.textContent = shape.playing ? '▶' : '⏸';
			}
		});

		this.querySelector('#btn-visibility')?.addEventListener('click', () => {
			const shape = state.getSelectedShape();
			if (shape) {
				const newVis = shape.visible === false ? true : false;
				update({ visible: newVis });
				const btn = this.querySelector('#btn-visibility');
				if (btn) {
					btn.textContent = newVis ? '◆ Visible' : '◇ Hidden';
					btn.classList.toggle('text-neutral-500', !newVis);
					btn.classList.toggle('bg-neutral-700', !newVis);
				}
			}
		});
		this.querySelector('#btn-duplicate')?.addEventListener('click', () => state.duplicateShape(shapeId));
		this.querySelector('#btn-delete')?.addEventListener('click', () => state.deleteShape(shapeId));
		this.querySelector('#btn-layer-up')?.addEventListener('click', () => state.moveShapeLayer(shapeId, 'up'));
		this.querySelector('#btn-layer-down')?.addEventListener('click', () => state.moveShapeLayer(shapeId, 'down'));

		// Effects
		for (const key of ['blur', 'glow', 'colorCorrection', 'distortion', 'glitch'] as const) {
			this.listen(`effect-${key}`, 'input', (el) => {
				const val = parseInt((el as HTMLInputElement).value);
				const shape = state.getSelectedShape();
				if (shape) update({ effects: { ...shape.effects, [key]: val } });
				const label = this.querySelector(`#effect-${key}-value`);
				if (label) label.textContent = `${val}%`;
			});
		}

		this.listen('shape-resource', 'change', (el) => {
			const val = (el as HTMLSelectElement).value;
			update({ resource: val || null });
			// Re-render to update badge
			const shape = state.getSelectedShape();
			if (shape) this.renderForm(shape);
		});

		this.querySelector('#btn-clear-resource')?.addEventListener('click', () => {
			update({ resource: null });
			const shape = state.getSelectedShape();
			if (shape) this.renderForm(shape);
		});

		this.listen('shape-projector', 'change', (el) => {
			update({ projector: parseInt((el as HTMLSelectElement).value) });
		});

		this.listen('shape-projection-type', 'change', (el) => {
			const val = (el as HTMLSelectElement).value as ShapeData['projectionType'];
			update({ projectionType: val });
			const shape = state.getSelectedShape();
			if (shape) this.renderForm(shape);
		});

		this.querySelector('#btn-position-mask')?.addEventListener('click', () => {
			const shape = state.getSelectedShape();
			if (!shape) return;
			const modal = document.querySelector('mask-position-modal') as HTMLElement & { show(shapeId: string): void } | null;
			if (modal) modal.show(shape.id);
		});
	}

	private listen(id: string, event: string, handler: (el: Element) => void): void {
		const el = this.querySelector(`#${id}`);
		if (el) el.addEventListener(event, () => handler(el));
	}

	private updateValues(shape: ShapeData): void {
		const setVal = (id: string, value: string) => {
			const el = this.querySelector(`#${id}`) as HTMLInputElement | null;
			if (el && el !== document.activeElement) el.value = value;
		};

		setVal('shape-x', String(Math.round(shape.position.x)));
		setVal('shape-y', String(Math.round(shape.position.y)));
		setVal('shape-w', String(Math.round(shape.size.x)));
		setVal('shape-h', String(Math.round(shape.size.y)));

		if (shape.type !== 'circle') {
			shape.points.forEach((p, i) => {
				const xEl = this.querySelector(`[data-point-x="${i}"]`) as HTMLInputElement | null;
				const yEl = this.querySelector(`[data-point-y="${i}"]`) as HTMLInputElement | null;
				if (xEl && xEl !== document.activeElement) xEl.value = String(Math.round(p.x));
				if (yEl && yEl !== document.activeElement) yEl.value = String(Math.round(p.y));
			});
		}
	}
}

customElements.define('shape-options-panel', ShapeOptionsPanel);
