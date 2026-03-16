import { state } from '../state/state-manager';
import { ColorOptions, ColorKeyframe, ColorStop } from '../types';
import { canvasManager } from './canvas-panel';

const DEFAULT_COLOR_OPTIONS: ColorOptions = {
	mode: 'solid',
	color: '#ff0000',
	gradientType: 'linear',
	gradientAngle: 0,
	gradientStops: [
		{ position: 0, color: '#ff0000' },
		{ position: 100, color: '#0000ff' },
	],
	animatedKeyframes: [
		{ time: 0, color: '#ff0000' },
		{ time: 50, color: '#00ff00' },
		{ time: 100, color: '#0000ff' },
	],
	animatedDuration: 3000,
	animatedLoop: true,
	animatedEasing: 'linear',
};

export class ColorModal extends HTMLElement {
	private editingResourceId: string | null = null;
	private opts: ColorOptions = { ...DEFAULT_COLOR_OPTIONS };
	private previewInterval: ReturnType<typeof setInterval> | null = null;

	connectedCallback(): void {
		this.className = 'fixed inset-0 z-50 hidden items-center justify-center';
	}

	show(existingResourceId?: string): void {
		this.opts = structuredClone(DEFAULT_COLOR_OPTIONS);
		this.editingResourceId = existingResourceId ?? null;

		if (existingResourceId) {
			const res = state.getResources().find(r => r.id === existingResourceId);
			if (res?.colorOptions) this.opts = structuredClone(res.colorOptions);
		}

		this.renderModal();

		this.classList.remove('hidden');
		this.classList.add('flex');

		this.updatePreview();
		this.startPreviewAnimation();
	}

	private renderModal(): void {
		const opts = this.opts;
		this.innerHTML = `
			<div id="color-backdrop" class="absolute inset-0 bg-black/60"></div>
			<div class="relative bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[440px] max-h-[85vh] overflow-y-auto p-5">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-sm font-semibold text-neutral-200">${this.editingResourceId ? 'Edit' : 'Create'} Color Resource</h2>
					<button id="clr-close" class="text-neutral-500 hover:text-neutral-300 text-lg">&times;</button>
				</div>

				<!-- Preview -->
				<div id="clr-preview" class="mb-4 rounded border border-neutral-700 h-16"></div>

				<!-- Mode -->
				<div class="mb-3">
					<label class="text-xs text-neutral-400 block mb-1">Mode</label>
					<div class="flex gap-1.5">
						<button class="clr-mode-btn flex-1 px-2 py-1 text-xs rounded border ${opts.mode === 'solid' ? 'bg-blue-700 border-blue-600 text-blue-100' : 'bg-neutral-800 border-neutral-600 text-neutral-300'}" data-mode="solid">Solid</button>
						<button class="clr-mode-btn flex-1 px-2 py-1 text-xs rounded border ${opts.mode === 'gradient' ? 'bg-blue-700 border-blue-600 text-blue-100' : 'bg-neutral-800 border-neutral-600 text-neutral-300'}" data-mode="gradient">Gradient</button>
						<button class="clr-mode-btn flex-1 px-2 py-1 text-xs rounded border ${opts.mode === 'animated' ? 'bg-blue-700 border-blue-600 text-blue-100' : 'bg-neutral-800 border-neutral-600 text-neutral-300'}" data-mode="animated">Animated</button>
					</div>
				</div>

				<!-- Solid options -->
				<div id="clr-solid" class="${opts.mode === 'solid' ? '' : 'hidden'} mb-3">
					<label class="text-xs text-neutral-400 block mb-1">Color</label>
					<input id="clr-solid-color" type="color" value="${opts.color}" class="w-16 h-8 bg-neutral-800 border border-neutral-600 rounded cursor-pointer">
				</div>

				<!-- Gradient options -->
				<div id="clr-gradient" class="${opts.mode === 'gradient' ? '' : 'hidden'} mb-3 space-y-2">
					<div class="flex gap-2">
						<div>
							<label class="text-xs text-neutral-400 block mb-1">Type</label>
							<select id="clr-grad-type" class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
								<option value="linear" ${opts.gradientType === 'linear' ? 'selected' : ''}>Linear</option>
								<option value="radial" ${opts.gradientType === 'radial' ? 'selected' : ''}>Radial</option>
							</select>
						</div>
						<div class="w-20">
							<label class="text-xs text-neutral-400 block mb-1">Angle</label>
							<input id="clr-grad-angle" type="number" value="${opts.gradientAngle}" min="0" max="360" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
						</div>
					</div>
					<div>
						<label class="text-xs text-neutral-400 block mb-1">Stops</label>
						<div id="clr-grad-stops" class="space-y-1">
							${opts.gradientStops.map((s, i) => this.renderGradientStop(s, i)).join('')}
						</div>
						<button id="clr-add-stop" class="mt-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Stop</button>
					</div>
				</div>

				<!-- Animated options -->
				<div id="clr-animated" class="${opts.mode === 'animated' ? '' : 'hidden'} mb-3 space-y-2">
					<div class="flex gap-2">
						<div class="w-24">
							<label class="text-xs text-neutral-400 block mb-1">Duration (ms)</label>
							<input id="clr-anim-duration" type="number" value="${opts.animatedDuration}" min="100" step="100" class="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
						</div>
						<div>
							<label class="text-xs text-neutral-400 block mb-1">Easing</label>
							<select id="clr-anim-easing" class="px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300">
								<option value="linear" ${opts.animatedEasing === 'linear' ? 'selected' : ''}>Linear</option>
								<option value="ease-in" ${opts.animatedEasing === 'ease-in' ? 'selected' : ''}>Ease In</option>
								<option value="ease-out" ${opts.animatedEasing === 'ease-out' ? 'selected' : ''}>Ease Out</option>
								<option value="ease-in-out" ${opts.animatedEasing === 'ease-in-out' ? 'selected' : ''}>Ease In-Out</option>
							</select>
						</div>
						<label class="text-xs text-neutral-400 flex items-center gap-1 self-end pb-1">
							<input id="clr-anim-loop" type="checkbox" ${opts.animatedLoop ? 'checked' : ''} class="accent-blue-500"> Loop
						</label>
					</div>
					<div>
						<label class="text-xs text-neutral-400 block mb-1">Keyframes</label>
						<div id="clr-anim-keyframes" class="space-y-1">
							${opts.animatedKeyframes.map((k, i) => this.renderAnimKeyframe(k, i)).join('')}
						</div>
						<button id="clr-add-keyframe" class="mt-1 px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+ Keyframe</button>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex gap-2">
					<button id="clr-cancel" class="flex-1 px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Cancel</button>
					<button id="clr-save" class="flex-1 px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">${this.editingResourceId ? 'Update' : 'Create'}</button>
				</div>
			</div>
		`;

		this.setupListeners();
	}

	private renderGradientStop(stop: ColorStop, index: number): string {
		return `
			<div class="flex items-center gap-1.5">
				<input type="color" value="${stop.color}" data-grad-color="${index}" class="w-8 h-6 bg-neutral-800 border border-neutral-600 rounded cursor-pointer">
				<input type="number" value="${stop.position}" min="0" max="100" data-grad-pos="${index}" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
				<span class="text-xs text-neutral-500">%</span>
				${index >= 2 ? `<button data-grad-remove="${index}" class="text-xs text-neutral-500 hover:text-red-400">✕</button>` : ''}
			</div>
		`;
	}

	private renderAnimKeyframe(kf: ColorKeyframe, index: number): string {
		return `
			<div class="flex items-center gap-1.5">
				<input type="color" value="${kf.color}" data-anim-color="${index}" class="w-8 h-6 bg-neutral-800 border border-neutral-600 rounded cursor-pointer">
				<input type="number" value="${kf.time}" min="0" max="100" data-anim-time="${index}" class="w-14 px-1 py-0.5 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 text-center">
				<span class="text-xs text-neutral-500">%</span>
				${index >= 2 ? `<button data-anim-remove="${index}" class="text-xs text-neutral-500 hover:text-red-400">✕</button>` : ''}
			</div>
		`;
	}

	private setupListeners(): void {
		this.querySelector('#color-backdrop')?.addEventListener('click', () => this.hide());
		this.querySelector('#clr-close')?.addEventListener('click', () => this.hide());
		this.querySelector('#clr-cancel')?.addEventListener('click', () => this.hide());
		this.querySelector('#clr-save')?.addEventListener('click', () => this.save());

		// Mode buttons
		this.querySelectorAll('.clr-mode-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				this.opts.mode = (btn as HTMLElement).dataset.mode as ColorOptions['mode'];
				this.renderModal();
				this.startPreviewAnimation();
			});
		});

		// Solid
		this.querySelector('#clr-solid-color')?.addEventListener('input', (e) => {
			this.opts.color = (e.target as HTMLInputElement).value;
			this.updatePreview();
		});

		// Gradient
		this.querySelector('#clr-grad-type')?.addEventListener('change', (e) => {
			this.opts.gradientType = (e.target as HTMLSelectElement).value as ColorOptions['gradientType'];
			this.updatePreview();
		});
		this.querySelector('#clr-grad-angle')?.addEventListener('input', (e) => {
			this.opts.gradientAngle = parseInt((e.target as HTMLInputElement).value);
			this.updatePreview();
		});
		this.querySelectorAll<HTMLInputElement>('[data-grad-color]').forEach(el => {
			el.addEventListener('input', () => {
				this.opts.gradientStops[parseInt(el.dataset.gradColor!)].color = el.value;
				this.updatePreview();
			});
		});
		this.querySelectorAll<HTMLInputElement>('[data-grad-pos]').forEach(el => {
			el.addEventListener('input', () => {
				this.opts.gradientStops[parseInt(el.dataset.gradPos!)].position = parseInt(el.value);
				this.updatePreview();
			});
		});
		this.querySelectorAll<HTMLButtonElement>('[data-grad-remove]').forEach(btn => {
			btn.addEventListener('click', () => {
				this.opts.gradientStops.splice(parseInt(btn.dataset.gradRemove!), 1);
				this.renderModal();
				this.startPreviewAnimation();
			});
		});
		this.querySelector('#clr-add-stop')?.addEventListener('click', () => {
			this.opts.gradientStops.push({ position: 50, color: '#ffffff' });
			this.renderModal();
			this.startPreviewAnimation();
		});

		// Animated
		this.querySelector('#clr-anim-duration')?.addEventListener('input', (e) => {
			this.opts.animatedDuration = parseInt((e.target as HTMLInputElement).value) || 1000;
		});
		this.querySelector('#clr-anim-easing')?.addEventListener('change', (e) => {
			this.opts.animatedEasing = (e.target as HTMLSelectElement).value as ColorOptions['animatedEasing'];
		});
		this.querySelector('#clr-anim-loop')?.addEventListener('change', (e) => {
			this.opts.animatedLoop = (e.target as HTMLInputElement).checked;
		});
		this.querySelectorAll<HTMLInputElement>('[data-anim-color]').forEach(el => {
			el.addEventListener('input', () => {
				this.opts.animatedKeyframes[parseInt(el.dataset.animColor!)].color = el.value;
			});
		});
		this.querySelectorAll<HTMLInputElement>('[data-anim-time]').forEach(el => {
			el.addEventListener('input', () => {
				this.opts.animatedKeyframes[parseInt(el.dataset.animTime!)].time = parseInt(el.value);
			});
		});
		this.querySelectorAll<HTMLButtonElement>('[data-anim-remove]').forEach(btn => {
			btn.addEventListener('click', () => {
				this.opts.animatedKeyframes.splice(parseInt(btn.dataset.animRemove!), 1);
				this.renderModal();
				this.startPreviewAnimation();
			});
		});
		this.querySelector('#clr-add-keyframe')?.addEventListener('click', () => {
			this.opts.animatedKeyframes.push({ time: 50, color: '#ffffff' });
			this.opts.animatedKeyframes.sort((a, b) => a.time - b.time);
			this.renderModal();
			this.startPreviewAnimation();
		});
	}

	private updatePreview(): void {
		const preview = this.querySelector('#clr-preview') as HTMLElement;
		if (!preview) return;

		if (this.opts.mode === 'solid') {
			preview.style.background = this.opts.color;
		} else if (this.opts.mode === 'gradient') {
			preview.style.background = this.buildGradientCSS();
		}
	}

	private startPreviewAnimation(): void {
		if (this.previewInterval) clearInterval(this.previewInterval);
		if (this.opts.mode !== 'animated') {
			this.updatePreview();
			return;
		}

		const startTime = Date.now();
		this.previewInterval = setInterval(() => {
			const preview = this.querySelector('#clr-preview') as HTMLElement;
			if (!preview) return;
			const elapsed = Date.now() - startTime;
			const color = this.getAnimatedColor(elapsed);
			preview.style.background = color;
		}, 16);
	}

	private buildGradientCSS(): string {
		const stops = [...this.opts.gradientStops].sort((a, b) => a.position - b.position);
		const stopStr = stops.map(s => `${s.color} ${s.position}%`).join(', ');
		if (this.opts.gradientType === 'radial') {
			return `radial-gradient(circle, ${stopStr})`;
		}
		return `linear-gradient(${this.opts.gradientAngle}deg, ${stopStr})`;
	}

	getAnimatedColor(elapsed: number): string {
		const kfs = [...this.opts.animatedKeyframes].sort((a, b) => a.time - b.time);
		if (kfs.length === 0) return '#000000';
		if (kfs.length === 1) return kfs[0].color;

		let progress = (elapsed % this.opts.animatedDuration) / this.opts.animatedDuration * 100;
		if (!this.opts.animatedLoop && elapsed >= this.opts.animatedDuration) {
			progress = 100;
		}

		let prev = kfs[0];
		let next = kfs[kfs.length - 1];
		for (let i = 0; i < kfs.length - 1; i++) {
			if (progress >= kfs[i].time && progress <= kfs[i + 1].time) {
				prev = kfs[i];
				next = kfs[i + 1];
				break;
			}
		}

		const span = next.time - prev.time;
		const t = span > 0 ? (progress - prev.time) / span : 0;
		return this.lerpColor(prev.color, next.color, Math.min(1, Math.max(0, t)));
	}

	private lerpColor(a: string, b: string, t: number): string {
		const ar = parseInt(a.slice(1, 3), 16);
		const ag = parseInt(a.slice(3, 5), 16);
		const ab = parseInt(a.slice(5, 7), 16);
		const br = parseInt(b.slice(1, 3), 16);
		const bg = parseInt(b.slice(3, 5), 16);
		const bb = parseInt(b.slice(5, 7), 16);
		const r = Math.round(ar + (br - ar) * t);
		const g = Math.round(ag + (bg - ag) * t);
		const bl = Math.round(ab + (bb - ab) * t);
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
	}

	private generateThumbnail(): string {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 36;
		const ctx = canvas.getContext('2d')!;

		if (this.opts.mode === 'solid') {
			ctx.fillStyle = this.opts.color;
			ctx.fillRect(0, 0, 64, 36);
		} else if (this.opts.mode === 'gradient') {
			const stops = [...this.opts.gradientStops].sort((a, b) => a.position - b.position);
			let grad: CanvasGradient;
			if (this.opts.gradientType === 'radial') {
				grad = ctx.createRadialGradient(32, 18, 0, 32, 18, 32);
			} else {
				const angle = (this.opts.gradientAngle * Math.PI) / 180;
				const x1 = 32 - Math.cos(angle) * 32;
				const y1 = 18 - Math.sin(angle) * 18;
				const x2 = 32 + Math.cos(angle) * 32;
				const y2 = 18 + Math.sin(angle) * 18;
				grad = ctx.createLinearGradient(x1, y1, x2, y2);
			}
			stops.forEach(s => grad.addColorStop(s.position / 100, s.color));
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, 64, 36);
		} else {
			// Animated — show first color
			ctx.fillStyle = this.opts.animatedKeyframes[0]?.color ?? '#000';
			ctx.fillRect(0, 0, 64, 36);
		}

		return canvas.toDataURL('image/png');
	}

	private save(): void {
		const thumbnail = this.generateThumbnail();
		const name = this.opts.mode === 'solid' ? this.opts.color
			: this.opts.mode === 'gradient' ? 'gradient'
			: 'animated-color';

		if (this.editingResourceId) {
			if (canvasManager) canvasManager.clearResourceCache(this.editingResourceId);
			state.updateResource(this.editingResourceId, {
				name,
				src: '',
				thumbnail,
				colorOptions: structuredClone(this.opts),
			});
		} else {
			state.addResource({
				name,
				type: 'color',
				src: '',
				thumbnail,
				colorOptions: structuredClone(this.opts),
			});
		}

		this.hide();
	}

	hide(): void {
		if (this.previewInterval) {
			clearInterval(this.previewInterval);
			this.previewInterval = null;
		}
		this.classList.remove('flex');
		this.classList.add('hidden');
		this.innerHTML = '';
		this.editingResourceId = null;
	}
}

customElements.define('color-modal', ColorModal);
