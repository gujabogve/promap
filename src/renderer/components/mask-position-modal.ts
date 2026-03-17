import { state } from '../state/state-manager';
import { ShapeData } from '../types';
import { getStlCanvas } from '../utils/stl-renderer';

export class MaskPositionModal extends HTMLElement {
	private shapeIds: string[] = [];
	private isGroup = false;
	private mode: 'masked' | 'mapped' = 'masked';
	private dragging = false;
	private panning = false;
	private panMode = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private offsetAtDragStart = { x: 0, y: 0 };
	private offset = { x: 0, y: 0 };
	// Per-shape offsets for group mapped mode
	private shapeOffsets: Map<string, { x: number; y: number }> = new Map();
	private draggingShapeId: string | null = null;
	private resScale = 1;
	private viewZoom = 1;
	private viewPan = { x: 0, y: 0 };
	private panStartX = 0;
	private panStartY = 0;
	private viewPanAtStart = { x: 0, y: 0 };

	connectedCallback(): void {
		this.className = 'fixed inset-0 z-50 hidden items-center justify-center';
	}

	show(shapeId: string, forceMode?: 'masked' | 'mapped'): void {
		this.showMultiple([shapeId], forceMode);
	}

	showGroup(shapeIds: string[], forceMode?: 'masked' | 'mapped'): void {
		this.showMultiple(shapeIds, forceMode, true);
	}

	private showMultiple(shapeIds: string[], forceMode?: 'masked' | 'mapped', group = false): void {
		const shapes = shapeIds.map(id => state.getShapes().find(s => s.id === id)).filter(Boolean) as ShapeData[];
		if (shapes.length === 0) return;

		const firstShape = shapes[0];
		if (!firstShape.resource) return;

		const resource = state.getResources().find(r => r.id === firstShape.resource);
		if (!resource) return;

		this.shapeIds = shapeIds;
		this.isGroup = group;
		this.mode = forceMode ?? 'masked';
		this.offset = { ...(firstShape.resourceOffset ?? { x: 0, y: 0 }) };
		this.draggingShapeId = null;

		// Init per-shape offsets for group mapped mode
		this.shapeOffsets.clear();
		if (group && this.mode === 'mapped') {
			for (const s of shapes) {
				this.shapeOffsets.set(s.id, { ...(s.resourceOffset ?? { x: 0, y: 0 }) });
			}
		}
		this.resScale = firstShape.resourceScale ?? 1;
		this.viewZoom = 1;
		this.viewPan = { x: 0, y: 0 };
		this.panMode = false;

		const resSrc = resource.src || resource.thumbnail || '';
		const title = this.mode === 'masked'
			? (group ? 'Position Resource on Group' : 'Position Resource on Shape')
			: (group ? 'Position Shapes on Resource' : 'Pick Area from Resource');

		this.innerHTML = `
			<div id="mask-backdrop" class="absolute inset-0 bg-black/80"></div>
			<div class="relative bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl p-5 flex flex-col items-center" style="width: calc(100vw - 80px); height: calc(100vh - 60px);">
				<div class="flex items-center justify-between w-full mb-3">
					<h2 class="text-sm font-semibold text-neutral-200">${title}</h2>
					<button id="mask-close" class="text-neutral-500 hover:text-neutral-300 text-lg">&times;</button>
				</div>

				<div class="relative flex-1 w-full min-h-0">
					<div class="absolute top-2 right-2 flex gap-1 z-10">
						<button id="mp-zoom-in" class="w-7 h-7 flex items-center justify-center text-xs bg-neutral-800/80 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">+</button>
						<button id="mp-zoom-out" class="w-7 h-7 flex items-center justify-center text-xs bg-neutral-800/80 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">−</button>
						<button id="mp-zoom-reset" class="w-7 h-7 flex items-center justify-center text-xs bg-neutral-800/80 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300 font-semibold">R</button>
						<button id="mp-pan-mode" class="w-7 h-7 flex items-center justify-center text-xs bg-neutral-800/80 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">✋</button>
					</div>

					<div id="mask-canvas" class="w-full h-full relative overflow-hidden border border-neutral-600 rounded cursor-grab bg-neutral-950">
						<div id="mask-res-wrap" class="absolute border border-neutral-500/40" style="transform-origin: 0 0;">
							${resource.type === 'video'
								? `<video id="mask-resource" src="${resSrc}" loop muted playsinline preload="auto" class="block max-w-none"></video>`
								: resource.type === 'stl'
								? `<canvas id="mask-resource" width="512" height="512" class="block max-w-none"></canvas>`
								: `<img id="mask-resource" src="${resSrc}" class="block max-w-none" draggable="false">`
							}
						</div>

						${this.isGroup && this.mode === 'mapped'
							? this.buildIndividualShapeDivs(shapes)
							: `<div id="mask-shapes-wrap" class="absolute pointer-events-none" style="transform-origin: 0 0;">
								<svg id="mask-shapes-svg" class="block" style="overflow: visible; width: 4000px; height: 4000px;">
									${this.buildAllShapesSVG(shapes)}
								</svg>
							</div>`
						}
					</div>
				</div>

				<div class="flex items-center gap-4 mt-3 w-full flex-wrap">
					<div class="flex items-center gap-2">
						<span class="text-xs text-neutral-400">Offset:</span>
						<span id="mask-offset-display" class="text-xs text-neutral-300 font-mono">${this.offset.x}, ${this.offset.y}</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs text-neutral-400">Scale:</span>
						<input id="mask-scale" type="range" min="10" max="500" value="${Math.round(this.resScale * 100)}" class="w-28 accent-blue-500">
						<span id="mask-scale-display" class="text-xs text-neutral-300 font-mono w-10">${Math.round(this.resScale * 100)}%</span>
					</div>
					<button id="mask-reset" class="px-2 py-0.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Reset</button>
					<div class="flex-1"></div>
					<button id="mask-cancel" class="px-4 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Cancel</button>
					<button id="mask-save" class="px-4 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 text-blue-100">Apply</button>
				</div>
			</div>
		`;

		this.classList.remove('hidden');
		this.classList.add('flex');

		const resEl = this.querySelector('#mask-resource') as HTMLElement;
		if (resEl?.tagName === 'VIDEO') {
			(resEl as HTMLVideoElement).addEventListener('loadeddata', () => this.layout(shapes), { once: true });
			(resEl as HTMLVideoElement).play().catch(() => {});
		} else if (resEl?.tagName === 'CANVAS' && resource.type === 'stl') {
			// Copy STL render to modal canvas
			const stlCanvas = getStlCanvas(resource.id);
			if (stlCanvas) {
				const ctx = (resEl as HTMLCanvasElement).getContext('2d');
				ctx?.drawImage(stlCanvas, 0, 0);
			}
		} else if (resEl?.tagName === 'IMG') {
			const img = resEl as HTMLImageElement;
			if (img.complete) {
				this.layout(shapes);
			} else {
				img.addEventListener('load', () => this.layout(shapes), { once: true });
			}
		}

		this.layout(shapes);
		this.setupListeners(shapes);
	}

	private buildIndividualShapeDivs(shapes: ShapeData[]): string {
		return shapes.map(shape => {
			const offset = this.shapeOffsets.get(shape.id) ?? { x: 0, y: 0 };
			const shapeName = shape.name;
			let svgContent: string;

			if (shape.type === 'circle') {
				const cx = shape.position.x + shape.size.x / 2;
				const cy = shape.position.y + shape.size.y / 2;
				const rx = shape.size.x / 2;
				const ry = shape.size.y / 2;
				svgContent = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6"/>`;
			} else {
				const points = shape.points.map(p =>
					`${p.x + shape.position.x},${p.y + shape.position.y}`
				).join(' ');
				svgContent = `<polygon points="${points}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6"/>`;
			}

			return `<div class="absolute cursor-grab" data-drag-shape="${shape.id}" style="transform-origin: 0 0;">
				<svg class="block" style="overflow: visible; width: 4000px; height: 4000px; pointer-events: none;">
					${svgContent}
				</svg>
				<div class="absolute text-xs text-blue-400 bg-neutral-900/70 px-1 rounded" style="top: ${shape.position.y - 14}px; left: ${shape.position.x}px; pointer-events: none;">${shapeName}</div>
			</div>`;
		}).join('');
	}

	private buildAllShapesSVG(shapes: ShapeData[]): string {
		// Render all shapes at their actual canvas positions
		return shapes.map(shape => {
			if (shape.type === 'circle') {
				const cx = shape.position.x + shape.size.x / 2;
				const cy = shape.position.y + shape.size.y / 2;
				const rx = shape.size.x / 2;
				const ry = shape.size.y / 2;
				return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6"/>`;
			}

			const points = shape.points.map(p =>
				`${p.x + shape.position.x},${p.y + shape.position.y}`
			).join(' ');
			return `<polygon points="${points}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6"/>`;
		}).join('\n');
	}

	private buildSingleShapeSVG(shape: ShapeData): string {
		if (shape.type === 'circle') {
			const rx = shape.size.x / 2;
			const ry = shape.size.y / 2;
			return `<ellipse cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6"/>`;
		}

		const minX = Math.min(...shape.points.map(p => p.x));
		const minY = Math.min(...shape.points.map(p => p.y));
		const points = shape.points.map(p =>
			`${p.x - minX},${p.y - minY}`
		).join(' ');
		return `<polygon points="${points}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6"/>`;
	}

	private getShapesBounds(shapes: ShapeData[]): { x: number; y: number; w: number; h: number } {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const shape of shapes) {
			if (shape.type === 'circle') {
				minX = Math.min(minX, shape.position.x);
				minY = Math.min(minY, shape.position.y);
				maxX = Math.max(maxX, shape.position.x + shape.size.x);
				maxY = Math.max(maxY, shape.position.y + shape.size.y);
			} else {
				for (const p of shape.points) {
					minX = Math.min(minX, p.x + shape.position.x);
					minY = Math.min(minY, p.y + shape.position.y);
					maxX = Math.max(maxX, p.x + shape.position.x);
					maxY = Math.max(maxY, p.y + shape.position.y);
				}
			}
		}
		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
	}

	private layout(shapes: ShapeData[]): void {
		const resWrap = this.querySelector('#mask-res-wrap') as HTMLElement;
		const canvas = this.querySelector('#mask-canvas') as HTMLElement;
		if (!resWrap || !canvas) return;

		const canvasW = canvas.clientWidth;
		const canvasH = canvas.clientHeight;
		const bounds = this.getShapesBounds(shapes);

		const viewCenterX = canvasW / 2 / this.viewZoom - this.viewPan.x;
		const viewCenterY = canvasH / 2 / this.viewZoom - this.viewPan.y;

		const resEl = this.querySelector('#mask-resource') as HTMLElement;
		if (resEl) {
			resEl.style.transform = `scale(${this.resScale})`;
			resEl.style.transformOrigin = '0 0';
		}

		if (this.isGroup && this.mode === 'mapped') {
			// Group mapped: resource centered, each shape positioned individually
			const resTransX = viewCenterX - bounds.w / 2;
			const resTransY = viewCenterY - bounds.h / 2;
			resWrap.style.transform = `scale(${this.viewZoom}) translate(${resTransX + this.viewPan.x}px, ${resTransY + this.viewPan.y}px)`;

			// Position each shape div with its own offset
			this.querySelectorAll<HTMLElement>('[data-drag-shape]').forEach(el => {
				const shapeId = el.dataset.dragShape!;
				const shapeOffset = this.shapeOffsets.get(shapeId) ?? { x: 0, y: 0 };
				// Shape moves by negative offset (visually drag shape on resource)
				const tx = viewCenterX - (bounds.x + bounds.w / 2) - shapeOffset.x;
				const ty = viewCenterY - (bounds.y + bounds.h / 2) - shapeOffset.y;
				el.style.transform = `scale(${this.viewZoom}) translate(${tx + this.viewPan.x}px, ${ty + this.viewPan.y}px)`;
			});
		} else {
			const shapesWrap = this.querySelector('#mask-shapes-wrap') as HTMLElement;
			if (!shapesWrap) return;

			let shapesTransX: number, shapesTransY: number;
			let resTransX: number, resTransY: number;

			if (this.mode === 'mapped') {
				// Single mapped: resource centered, shape moves
				resTransX = viewCenterX - bounds.w / 2;
				resTransY = viewCenterY - bounds.h / 2;
				shapesTransX = viewCenterX - (bounds.x + bounds.w / 2) - this.offset.x;
				shapesTransY = viewCenterY - (bounds.y + bounds.h / 2) - this.offset.y;
			} else {
				// Masked: shapes centered, resource moves
				shapesTransX = viewCenterX - (bounds.x + bounds.w / 2);
				shapesTransY = viewCenterY - (bounds.y + bounds.h / 2);
				resTransX = shapesTransX + this.offset.x;
				resTransY = shapesTransY + this.offset.y;
			}

			resWrap.style.transform = `scale(${this.viewZoom}) translate(${resTransX + this.viewPan.x}px, ${resTransY + this.viewPan.y}px)`;
			shapesWrap.style.transform = `scale(${this.viewZoom}) translate(${shapesTransX + this.viewPan.x}px, ${shapesTransY + this.viewPan.y}px)`;
		}

		const display = this.querySelector('#mask-offset-display');
		if (display) display.textContent = `${this.offset.x}, ${this.offset.y}`;
	}

	private setupListeners(shapes: ShapeData[]): void {
		this.querySelector('#mask-backdrop')?.addEventListener('click', () => this.hide());
		this.querySelector('#mask-close')?.addEventListener('click', () => this.hide());
		this.querySelector('#mask-cancel')?.addEventListener('click', () => this.hide());
		this.querySelector('#mask-save')?.addEventListener('click', () => this.save());
		this.querySelector('#mask-reset')?.addEventListener('click', () => {
			this.offset = { x: 0, y: 0 };
			this.resScale = 1;
			for (const id of this.shapeOffsets.keys()) {
				this.shapeOffsets.set(id, { x: 0, y: 0 });
			}
			const slider = this.querySelector('#mask-scale') as HTMLInputElement;
			const label = this.querySelector('#mask-scale-display');
			if (slider) slider.value = '100';
			if (label) label.textContent = '100%';
			this.layout(shapes);
		});

		const scaleSlider = this.querySelector('#mask-scale') as HTMLInputElement;
		scaleSlider?.addEventListener('input', () => {
			this.resScale = parseInt(scaleSlider.value) / 100;
			const label = this.querySelector('#mask-scale-display');
			if (label) label.textContent = `${scaleSlider.value}%`;
			this.layout(shapes);
		});

		this.querySelector('#mp-zoom-in')?.addEventListener('click', () => {
			this.viewZoom = Math.min(5, this.viewZoom * 1.2);
			this.layout(shapes);
		});
		this.querySelector('#mp-zoom-out')?.addEventListener('click', () => {
			this.viewZoom = Math.max(0.1, this.viewZoom * 0.8);
			this.layout(shapes);
		});
		this.querySelector('#mp-zoom-reset')?.addEventListener('click', () => {
			this.viewZoom = 1;
			this.viewPan = { x: 0, y: 0 };
			this.layout(shapes);
		});

		const panBtn = this.querySelector('#mp-pan-mode') as HTMLElement;
		panBtn?.addEventListener('click', () => {
			this.panMode = !this.panMode;
			panBtn.classList.toggle('bg-blue-700/80', this.panMode);
			panBtn.classList.toggle('border-blue-600', this.panMode);
			panBtn.classList.toggle('text-blue-100', this.panMode);
			panBtn.classList.toggle('bg-neutral-800/80', !this.panMode);
			panBtn.classList.toggle('border-neutral-600', !this.panMode);
			panBtn.classList.toggle('text-neutral-300', !this.panMode);
		});

		const canvas = this.querySelector('#mask-canvas') as HTMLElement;

		canvas?.addEventListener('wheel', (e) => {
			e.preventDefault();
			this.viewZoom = Math.max(0.1, Math.min(5, this.viewZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
			this.layout(shapes);
		}, { passive: false });

		// Individual shape drag handlers for group mapped
		if (this.isGroup && this.mode === 'mapped') {
			this.querySelectorAll<HTMLElement>('[data-drag-shape]').forEach(el => {
				el.addEventListener('mousedown', (e) => {
					if (this.panMode) return;
					e.stopPropagation();
					this.dragging = true;
					this.draggingShapeId = el.dataset.dragShape!;
					this.dragStartX = e.clientX;
					this.dragStartY = e.clientY;
					const shapeOffset = this.shapeOffsets.get(this.draggingShapeId) ?? { x: 0, y: 0 };
					this.offsetAtDragStart = { ...shapeOffset };
					canvas.style.cursor = 'grabbing';
				});
			});
		}

		canvas?.addEventListener('mousedown', (e) => {
			if (this.panMode || e.button === 1) {
				this.panning = true;
				this.panStartX = e.clientX;
				this.panStartY = e.clientY;
				this.viewPanAtStart = { ...this.viewPan };
				canvas.style.cursor = 'grabbing';
				return;
			}

			// Don't start canvas drag in group mapped mode (shapes drag individually)
			if (this.isGroup && this.mode === 'mapped') return;

			this.dragging = true;
			this.draggingShapeId = null;
			this.dragStartX = e.clientX;
			this.dragStartY = e.clientY;
			this.offsetAtDragStart = { ...this.offset };
			canvas.style.cursor = 'grabbing';
		});

		const onMove = (e: MouseEvent): void => {
			if (this.panning) {
				const dx = (e.clientX - this.panStartX) / this.viewZoom;
				const dy = (e.clientY - this.panStartY) / this.viewZoom;
				this.viewPan = { x: this.viewPanAtStart.x + dx, y: this.viewPanAtStart.y + dy };
				this.layout(shapes);
				return;
			}

			if (!this.dragging) return;

			const dx = (e.clientX - this.dragStartX) / this.viewZoom;
			const dy = (e.clientY - this.dragStartY) / this.viewZoom;

			if (this.draggingShapeId) {
				// Individual shape drag (group mapped)
				this.shapeOffsets.set(this.draggingShapeId, {
					x: Math.round(this.offsetAtDragStart.x - dx),
					y: Math.round(this.offsetAtDragStart.y - dy),
				});
			} else if (this.mode === 'masked') {
				this.offset = {
					x: Math.round(this.offsetAtDragStart.x + dx),
					y: Math.round(this.offsetAtDragStart.y + dy),
				};
			} else {
				this.offset = {
					x: Math.round(this.offsetAtDragStart.x - dx),
					y: Math.round(this.offsetAtDragStart.y - dy),
				};
			}

			this.layout(shapes);
		};

		const onUp = (): void => {
			this.dragging = false;
			this.panning = false;
			this.draggingShapeId = null;
			canvas.style.cursor = 'grab';
		};

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		this._cleanupMove = () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
	}

	private _cleanupMove: (() => void) | null = null;

	private save(): void {
		if (this.isGroup && this.mode === 'mapped') {
			// Each shape gets its own offset
			for (const id of this.shapeIds) {
				const shapeOffset = this.shapeOffsets.get(id) ?? { x: 0, y: 0 };
				state.updateShape(id, {
					resourceOffset: { ...shapeOffset },
					resourceScale: this.resScale,
				});
			}
		} else {
			// Shared offset for all shapes
			for (const id of this.shapeIds) {
				state.updateShape(id, {
					resourceOffset: { ...this.offset },
					resourceScale: this.resScale,
				});
			}
		}
		this.hide();
	}

	hide(): void {
		this._cleanupMove?.();
		this._cleanupMove = null;
		this.classList.remove('flex');
		this.classList.add('hidden');

		const video = this.querySelector('#mask-resource') as HTMLVideoElement;
		if (video?.tagName === 'VIDEO') {
			video.pause();
			video.src = '';
		}

		this.innerHTML = '';
		this.shapeIds = [];
		this.isGroup = false;
		this.dragging = false;
		this.panning = false;
	}
}

customElements.define('mask-position-modal', MaskPositionModal);
