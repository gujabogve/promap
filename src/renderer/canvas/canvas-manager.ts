import { Application, Graphics, FederatedPointerEvent, Container, Sprite, Texture, VideoSource, ImageSource, CanvasSource, BlurFilter, ColorMatrixFilter, Filter } from 'pixi.js';
import { state } from '../state/state-manager';
import { ShapeData, Point, ResourceData, TextOptions, ColorOptions } from '../types';
import { audioAnalyzer } from '../audio/audio-analyzer';
import { midiSync } from '../audio/midi-sync';

const POINT_RADIUS = 6;
const POINT_COLOR = 0x3b82f6;
const HANDLE_COLOR = 0xf59e0b;
const SHAPE_STROKE = 0x6b7280;
const SELECTED_STROKE = 0x3b82f6;
const SHAPE_FILL = 0x1f2937;

interface VideoEntry {
	element: HTMLVideoElement;
	source: VideoSource;
	texture: Texture;
}

interface ColorEntry {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	source: CanvasSource;
	texture: Texture;
	options: ColorOptions;
	startTime: number;
}

interface TextEntry {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	source: CanvasSource;
	texture: Texture;
	options: TextOptions;
	offset: number;
	width: number;
	height: number;
	textWidth: number;
}

const GRID_SIZE = 20;
const SNAP_THRESHOLD = 8;

export class CanvasManager {
	private app: Application;
	private gridContainer: Container;
	private shapesContainer: Container;
	private pointsContainer: Container;
	showGrid = false;
	snapToGrid = false;
	panMode = false;
	private dragTarget: { type: 'shape' | 'point' | 'handle-x' | 'handle-y'; shapeId: string; pointIndex?: number } | null = null;
	private dragOffset: Point = { x: 0, y: 0 };
	private multiDragStart: Map<string, Point> | null = null;
	private worldContainer: Container;
	private panning = false;
	private panStart: Point = { x: 0, y: 0 };
	private panOffset: Point = { x: 0, y: 0 };
	private zoom = 1;
	private textureCache: Map<string, Texture> = new Map();
	private videoEntries: Map<string, VideoEntry> = new Map();
	private textEntries: Map<string, TextEntry> = new Map();
	private colorEntries: Map<string, ColorEntry> = new Map();
	private loadingTextures: Set<string> = new Set();
	private removeMidiBeatListener: (() => void) | null = null;

	constructor(app: Application) {
		this.app = app;

		this.worldContainer = new Container();
		this.gridContainer = new Container();
		this.shapesContainer = new Container();
		this.pointsContainer = new Container();
		this.worldContainer.addChild(this.gridContainer);
		this.worldContainer.addChild(this.shapesContainer);
		this.worldContainer.addChild(this.pointsContainer);
		this.app.stage.addChild(this.worldContainer);

		this.app.stage.eventMode = 'static';
		this.app.stage.hitArea = this.app.screen;
		this.app.stage.on('pointerdown', (e: FederatedPointerEvent) => this.onStagePointerDown(e));
		this.app.stage.on('pointermove', this.onPointerMove.bind(this));
		this.app.stage.on('pointerup', this.onPointerUp.bind(this));
		this.app.stage.on('pointerupoutside', this.onPointerUp.bind(this));

		this.setupZoomPan();

		state.subscribe(() => this.render());
		state.onLoad(() => this.clearCaches());

		document.addEventListener('keyup', (e) => {
			if (e.key === 'Shift') {
				const multiIds = state.getMultiSelectedIds();
				if (multiIds.size >= 2) {
					this.promptGroupCreation(multiIds);
				}
			}
		});
		this.setupDrop();

		this.removeMidiBeatListener = midiSync.onBeat(() => {
			// Group animations — advance if useBpm or useMidi
			for (const [groupId, group] of state.getGroups()) {
				if (group.animationPlaying && (group.animation?.useBpm || group.animation?.useMidi)) {
					state.advanceGroupAnimation(groupId);
				}
			}
			// Per-shape MIDI sync — pulse playback rate on beat
			for (const shape of state.getShapes()) {
				if (shape.midiSync && shape.resource) {
					shape.playing = true;
				}
			}
		});

		// Audio beat detection — advance BPM animations on detected beats
		audioAnalyzer.onBeat(() => {
			if (midiSync.active) return; // MIDI takes priority
			for (const [groupId, group] of state.getGroups()) {
				if (group.animationPlaying && group.animation?.useBpm) {
					state.advanceGroupAnimation(groupId);
				}
			}
		});

		this.app.ticker.add(() => this.tick());
	}

	private tick(): void {
		for (const entry of this.videoEntries.values()) {
			if (!entry.element.paused) {
				entry.source.update();
			}
		}

		const shapes = state.getShapes();
		for (const [resourceId, entry] of this.textEntries) {
			if (!entry.options.marquee) continue;
			const shape = shapes.find(s => s.resource === resourceId);
			if (!shape) continue;

			// BPM sync: only animate when above threshold, scale speed by level
			if (shape.bpmSync && audioAnalyzer.running) {
				if (audioAnalyzer.isAboveThreshold) {
					entry.options.marqueeSpeed = shape.fps * audioAnalyzer.level * 2;
					this.renderTextCanvas(entry);
					entry.source.update();
				}
			} else if (shape.playing) {
				this.renderTextCanvas(entry);
				entry.source.update();
			}
		}

		for (const entry of this.colorEntries.values()) {
			if (entry.options.mode === 'animated') {
				this.renderColorCanvas(entry);
				entry.source.update();
			}
		}

		// Re-render if any group animation is playing
		let hasGroupAnim = false;
		for (const [groupId] of state.getGroups()) {
			const group = state.getGroups().get(groupId);
			if (group?.animationPlaying) {
				hasGroupAnim = true;

				// Tick BPM-driven animations with audio level (skip if MIDI sync is driving beats)
				if (group.animation?.useBpm && audioAnalyzer.running && !midiSync.active) {
					state.tickBpmAnimation(groupId, audioAnalyzer.level);
				}

				// Handle auto-play resource (mutate directly, no notify)
				const animState = state.getGroupAnimationState(groupId);
				if (animState && group.animation?.autoPlayResource) {
					for (const shapeId of group.shapeIds) {
						const shape = state.getShapes().find(s => s.id === shapeId);
						if (shape) {
							const shapeOpacity = animState.get(shapeId) ?? 0;
							shape.playing = shapeOpacity > 0;
						}
					}
				}
			}
		}
		if (hasGroupAnim) {
			this.render();
		}
	}

	private setupZoomPan(): void {
		const canvas = this.app.canvas as HTMLCanvasElement;

		// Zoom with scroll wheel
		canvas.addEventListener('wheel', (e) => {
			e.preventDefault();
			const delta = e.deltaY > 0 ? 0.9 : 1.1;
			const newZoom = Math.max(0.1, Math.min(5, this.zoom * delta));

			// Zoom towards mouse position
			const rect = canvas.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;

			const worldBefore = {
				x: (mx - this.worldContainer.x) / this.zoom,
				y: (my - this.worldContainer.y) / this.zoom,
			};

			this.zoom = newZoom;
			this.worldContainer.scale.set(this.zoom);

			const worldAfter = {
				x: (mx - this.worldContainer.x) / this.zoom,
				y: (my - this.worldContainer.y) / this.zoom,
			};

			this.worldContainer.x += (worldAfter.x - worldBefore.x) * this.zoom;
			this.worldContainer.y += (worldAfter.y - worldBefore.y) * this.zoom;
		}, { passive: false });

		// Pan with middle mouse or Ctrl+left mouse on empty area
		canvas.addEventListener('mousedown', (e) => {
			if (e.button === 1 || (e.button === 0 && e.altKey)) {
				e.preventDefault();
				this.panning = true;
				this.panStart = { x: e.clientX, y: e.clientY };
				this.panOffset = { x: this.worldContainer.x, y: this.worldContainer.y };
			}
		});

		document.addEventListener('mousemove', (e) => {
			if (!this.panning) return;
			this.worldContainer.x = this.panOffset.x + (e.clientX - this.panStart.x);
			this.worldContainer.y = this.panOffset.y + (e.clientY - this.panStart.y);
		});

		document.addEventListener('mouseup', (e) => {
			if (e.button === 1 || e.button === 0) {
				this.panning = false;
			}
		});
	}

	zoomBy(factor: number): void {
		const canvas = this.app.canvas as HTMLCanvasElement;
		const cx = canvas.width / 2;
		const cy = canvas.height / 2;

		const worldBefore = {
			x: (cx - this.worldContainer.x) / this.zoom,
			y: (cy - this.worldContainer.y) / this.zoom,
		};

		this.zoom = Math.max(0.1, Math.min(5, this.zoom * factor));
		this.worldContainer.scale.set(this.zoom);

		const worldAfter = {
			x: (cx - this.worldContainer.x) / this.zoom,
			y: (cy - this.worldContainer.y) / this.zoom,
		};

		this.worldContainer.x += (worldAfter.x - worldBefore.x) * this.zoom;
		this.worldContainer.y += (worldAfter.y - worldBefore.y) * this.zoom;
	}

	resetView(): void {
		this.zoom = 1;
		this.worldContainer.scale.set(1);
		this.worldContainer.x = 0;
		this.worldContainer.y = 0;
	}

	private setupDrop(): void {
		const canvas = this.app.canvas as HTMLCanvasElement;
		canvas.addEventListener('dragover', (e) => e.preventDefault());
		canvas.addEventListener('drop', (e) => {
			e.preventDefault();
			const resourceId = e.dataTransfer?.getData('text/plain');
			if (!resourceId) return;

			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			const hit = this.hitTestShapes(x, y);
			if (hit) {
				state.updateShape(hit.id, { resource: resourceId, playing: true });
				state.selectShape(hit.id);
			}
		});
	}

	private hitTestShapes(x: number, y: number): ShapeData | null {
		const shapes = state.getShapes().sort((a, b) => b.zIndex - a.zIndex);
		for (const shape of shapes) {
			if (this.isPointInShape(x, y, shape)) return shape;
		}
		return null;
	}

	private isPointInShape(px: number, py: number, shape: ShapeData): boolean {
		if (shape.type === 'circle') {
			const rx = shape.size.x / 2;
			const ry = shape.size.y / 2;
			const cx = shape.position.x + rx;
			const cy = shape.position.y + ry;
			const dx = (px - cx) / rx;
			const dy = (py - cy) / ry;
			return dx * dx + dy * dy <= 1;
		}

		const absPoints = shape.points.map(p => ({
			x: p.x + shape.position.x,
			y: p.y + shape.position.y,
		}));
		let inside = false;
		for (let i = 0, j = absPoints.length - 1; i < absPoints.length; j = i++) {
			const xi = absPoints[i].x, yi = absPoints[i].y;
			const xj = absPoints[j].x, yj = absPoints[j].y;
			if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
		return inside;
	}

	private snap(value: number): number {
		if (!this.snapToGrid) return value;
		const snapped = Math.round(value / GRID_SIZE) * GRID_SIZE;
		return Math.abs(value - snapped) < SNAP_THRESHOLD ? snapped : value;
	}

	private drawGrid(): void {
		this.gridContainer.removeChildren();

		// Output area — fill inside lighter, border visible
		const res = state.resolution;
		const fill = new Graphics();
		fill.rect(0, 0, res.x, res.y);
		fill.fill({ color: 0x1a1a1a });
		this.gridContainer.addChild(fill);

		const border = new Graphics();
		border.rect(0, 0, res.x, res.y);
		border.stroke({ color: 0x3b82f6, width: 1.5, alpha: 0.5 });
		this.gridContainer.addChild(border);

		if (!this.showGrid) return;

		const g = new Graphics();
		for (let x = 0; x <= res.x; x += GRID_SIZE) {
			g.moveTo(x, 0);
			g.lineTo(x, res.y);
		}
		for (let y = 0; y <= res.y; y += GRID_SIZE) {
			g.moveTo(0, y);
			g.lineTo(res.x, y);
		}
		g.stroke({ color: 0xffffff, width: 1, alpha: 0.06 });
		this.gridContainer.addChild(g);
	}

	private render(): void {
		this.drawGrid();
		this.shapesContainer.removeChildren();
		this.pointsContainer.removeChildren();

		// Build group animation map: shapeId -> opacity
		const animOpacity = new Map<string, number>();
		for (const [groupId] of state.getGroups()) {
			const animState = state.getGroupAnimationState(groupId);
			if (!animState) continue;
			for (const [shapeId, opacity] of animState) {
				animOpacity.set(shapeId, opacity);
			}
		}

		const shapes = state.getShapes().sort((a, b) => a.zIndex - b.zIndex);
		const selected = state.getSelectedShape();

		for (const shape of shapes) {
			// Hidden shapes always show as ghosts
			if (shape.visible === false) {
				this.drawHiddenShape(shape);
				continue;
			}

			const groupOpacity = animOpacity.get(shape.id);

			// If controlled by group animation and opacity is 0, show ghost
			if (groupOpacity !== undefined && groupOpacity <= 0) {
				this.drawHiddenShape(shape);
				continue;
			}

			const isSelected = selected?.id === shape.id;
			const isMultiSelected = state.isMultiSelected(shape.id);
			this.drawShape(shape, isSelected, isMultiSelected, groupOpacity);
		}

		if (selected) {
			this.drawPoints(selected);
		}

		this.syncVideoPlayback(shapes);
	}

	private syncVideoPlayback(shapes: ShapeData[]): void {
		for (const shape of shapes) {
			if (!shape.resource) continue;
			const resource = state.getResources().find(r => r.id === shape.resource);
			if (!resource || resource.type !== 'video') continue;

			const entry = this.videoEntries.get(resource.id);
			if (!entry) continue;

			if (shape.midiSync && midiSync.active) {
				// MIDI sync: play at BPM-derived rate
				if (entry.element.paused) entry.element.play().catch(() => {});
				const midiBpm = midiSync.bpm;
				if (midiBpm > 0) {
					entry.element.playbackRate = (shape.fps / 30) * (midiBpm / 120);
				} else {
					entry.element.playbackRate = shape.fps / 30;
				}
			} else if (shape.bpmSync && audioAnalyzer.running) {
				// Mic BPM sync: audio level controls playback
				if (audioAnalyzer.isAboveThreshold) {
					if (entry.element.paused) entry.element.play().catch(() => {});
					entry.element.playbackRate = (shape.fps / 30) * Math.max(0.2, audioAnalyzer.level * 2);
				} else {
					if (!entry.element.paused) entry.element.pause();
				}
			} else {
				if (shape.playing && entry.element.paused) {
					entry.element.play().catch(() => {});
				} else if (!shape.playing && !entry.element.paused) {
					entry.element.pause();
				}
				entry.element.playbackRate = shape.fps / 30;
			}

			entry.element.loop = shape.loop;
		}
	}

	private getShapeCenter(shape: ShapeData): Point {
		if (shape.type === 'circle') {
			return {
				x: shape.position.x + shape.size.x / 2,
				y: shape.position.y + shape.size.y / 2,
			};
		}
		const xs = shape.points.map(p => p.x + shape.position.x);
		const ys = shape.points.map(p => p.y + shape.position.y);
		return {
			x: (Math.min(...xs) + Math.max(...xs)) / 2,
			y: (Math.min(...ys) + Math.max(...ys)) / 2,
		};
	}

	private drawHiddenShape(shape: ShapeData): void {
		const g = new Graphics();

		if (shape.type === 'circle') {
			const rx = shape.size.x / 2;
			const ry = shape.size.y / 2;
			g.ellipse(shape.position.x + rx, shape.position.y + ry, rx, ry);
		} else if (shape.points.length >= 3) {
			const flat = shape.points.flatMap(p => [p.x + shape.position.x, p.y + shape.position.y]);
			g.poly(flat, true);
		}

		g.fill({ color: SHAPE_FILL, alpha: 0.08 });
		g.stroke({ color: 0x525252, width: 1, alpha: 0.3 });

		// Click hidden shape to select it
		g.eventMode = 'static';
		g.cursor = 'pointer';
		g.on('pointerdown', (e: FederatedPointerEvent) => {
			e.stopPropagation();
			state.selectShape(shape.id);
		});

		this.shapesContainer.addChild(g);
	}

	private captureMultiPositions(): Map<string, Point> {
		const positions = new Map<string, Point>();
		for (const id of state.getMultiSelectedIds()) {
			const s = state.getShapes().find(sh => sh.id === id);
			if (s) positions.set(id, { ...s.position });
		}
		return positions;
	}

	private promptGroupCreation(ids: Set<string>): void {
		const modal = document.querySelector('group-modal') as HTMLElement & { show(ids: Set<string>): void } | null;
		if (modal) modal.show(ids);
	}

	private drawShape(shape: ShapeData, isSelected: boolean, isMultiSelected = false, groupOpacity?: number): void {
		const shapeContainer = new Container();
		shapeContainer.eventMode = 'static';
		shapeContainer.cursor = this.panMode ? 'grab' : 'move';

		// Apply rotation around center
		if (shape.rotation !== 0) {
			const center = this.getShapeCenter(shape);
			shapeContainer.pivot.set(center.x, center.y);
			shapeContainer.position.set(center.x, center.y);
			shapeContainer.rotation = (shape.rotation * Math.PI) / 180;
		}

		this.drawResource(shape, shapeContainer);

		const g = new Graphics();
		const strokeColor = isSelected ? SELECTED_STROKE : isMultiSelected ? 0x22d3ee : SHAPE_STROKE;
		const strokeWidth = isSelected || isMultiSelected ? 2 : 1;
		const hasResource = !!shape.resource && this.textureCache.has(shape.resource);

		if (shape.type === 'circle') {
			const rx = shape.size.x / 2;
			const ry = shape.size.y / 2;
			const cx = shape.position.x + rx;
			const cy = shape.position.y + ry;
			g.ellipse(cx, cy, rx, ry);
		} else if (shape.points.length >= 3) {
			const absPoints = shape.points.map(p => ({
				x: p.x + shape.position.x,
				y: p.y + shape.position.y,
			}));
			const flat = absPoints.flatMap(p => [p.x, p.y]);
			g.poly(flat, true);
		}

		if (!hasResource) {
			g.fill({ color: SHAPE_FILL, alpha: 0.3 });
		}
		g.stroke({ color: strokeColor, width: strokeWidth });

		shapeContainer.addChild(g);

		shapeContainer.on('pointerdown', (e: FederatedPointerEvent) => {
			e.stopPropagation();
			const nativeEvent = e.nativeEvent as PointerEvent;

			if (this.panMode) {
				this.panning = true;
				this.panStart = { x: nativeEvent.clientX, y: nativeEvent.clientY };
				this.panOffset = { x: this.worldContainer.x, y: this.worldContainer.y };
				return;
			}

			if (nativeEvent.ctrlKey) {
				state.toggleMultiSelect(shape.id);
				// Start drag for multi-selected group
				if (state.isMultiSelected(shape.id)) {
					this.dragTarget = { type: 'shape', shapeId: shape.id };
					const pos = e.getLocalPosition(this.worldContainer);
					this.dragOffset = { x: pos.x, y: pos.y };
					this.multiDragStart = this.captureMultiPositions();
				}
				return;
			}

			if (nativeEvent.shiftKey) {
				state.toggleMultiSelect(shape.id);
				return;
			}

			// If clicking a multi-selected shape without modifier, drag all
			if (state.isMultiSelected(shape.id)) {
				this.dragTarget = { type: 'shape', shapeId: shape.id };
				const pos = e.getLocalPosition(this.worldContainer);
				this.dragOffset = { x: pos.x, y: pos.y };
				this.multiDragStart = this.captureMultiPositions();
				return;
			}

			state.selectShape(shape.id);
			this.dragTarget = { type: 'shape', shapeId: shape.id };
			const pos = e.getLocalPosition(this.worldContainer);
			this.dragOffset = {
				x: pos.x - shape.position.x,
				y: pos.y - shape.position.y,
			};
		});

		// Apply effects as filters
		const filters = this.buildFilters(shape);
		if (filters.length > 0) {
			shapeContainer.filters = filters;
		}

		if (groupOpacity !== undefined && groupOpacity < 1) {
			shapeContainer.alpha = groupOpacity;
		}

		this.shapesContainer.addChild(shapeContainer);
	}

	private buildFilters(shape: ShapeData): Filter[] {
		const filters: Filter[] = [];
		const fx = shape.effects;

		if (fx.blur > 0) {
			const blur = new BlurFilter();
			blur.strength = fx.blur * 0.2;
			filters.push(blur);
		}

		if (fx.glow > 0) {
			// Simulate glow with a second blur pass and brightness boost
			const glow = new BlurFilter();
			glow.strength = fx.glow * 0.3;
			filters.push(glow);

			const bright = new ColorMatrixFilter();
			bright.brightness(1 + fx.glow * 0.01, false);
			filters.push(bright);
		}

		if (fx.colorCorrection > 0) {
			const cm = new ColorMatrixFilter();
			cm.saturate(1 + fx.colorCorrection * 0.02, false);
			cm.contrast(1 + fx.colorCorrection * 0.005, false);
			filters.push(cm);
		}

		if (fx.distortion > 0) {
			// Simulate distortion with color shift
			const cm = new ColorMatrixFilter();
			const shift = fx.distortion * 0.01;
			// Offset color channels slightly
			cm.matrix[1] = shift;
			cm.matrix[6] = -shift;
			filters.push(cm);
		}

		if (fx.glitch > 0) {
			// Simulate glitch with random hue rotation
			const cm = new ColorMatrixFilter();
			const hue = (Math.random() - 0.5) * fx.glitch * 3.6;
			cm.hue(hue, false);
			filters.push(cm);
		}

		return filters;
	}

	private drawResource(shape: ShapeData, container: Container): void {
		if (!shape.resource) return;

		const resource = state.getResources().find(r => r.id === shape.resource);
		if (!resource) return;
		if (!resource.src && !resource.colorOptions && !resource.textOptions) return;

		// Get cached texture or start async load
		const texture = this.textureCache.get(resource.id);
		if (!texture) {
			this.loadTextureAsync(resource);
			return;
		}

		const sprite = new Sprite(texture);

		// Position sprite based on projection type
		// Calculate shape bounding box
		let bounds: { x: number; y: number; w: number; h: number };
		if (shape.type === 'circle') {
			bounds = { x: shape.position.x, y: shape.position.y, w: shape.size.x, h: shape.size.y };
		} else {
			const xs = shape.points.map(p => p.x + shape.position.x);
			const ys = shape.points.map(p => p.y + shape.position.y);
			const minX = Math.min(...xs);
			const minY = Math.min(...ys);
			bounds = { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
		}

		if (shape.projectionType === 'masked') {
			const offset = shape.resourceOffset ?? { x: 0, y: 0 };
			const scale = shape.resourceScale ?? 1;
			// Masked: resource at absolute position, shapes act as windows
			sprite.x = offset.x;
			sprite.y = offset.y;
			sprite.scale.set(scale);
		} else if (shape.projectionType === 'mapped') {
			const offset = shape.resourceOffset ?? { x: 0, y: 0 };
			const scale = shape.resourceScale ?? 1;
			// Mapped: resource positioned relative to this shape's position
			sprite.x = bounds.x - offset.x;
			sprite.y = bounds.y - offset.y;
			sprite.scale.set(scale);
		} else if (shape.projectionType === 'fit') {
			// Fit: maintain aspect ratio, center in bounds
			const texW = texture.width || bounds.w;
			const texH = texture.height || bounds.h;
			const scale = Math.min(bounds.w / texW, bounds.h / texH);
			const fitW = texW * scale;
			const fitH = texH * scale;
			sprite.x = bounds.x + (bounds.w - fitW) / 2;
			sprite.y = bounds.y + (bounds.h - fitH) / 2;
			sprite.width = fitW;
			sprite.height = fitH;
		} else {
			// Default: stretch to fill
			sprite.x = bounds.x;
			sprite.y = bounds.y;
			sprite.width = bounds.w;
			sprite.height = bounds.h;
		}

		// Create mask from shape geometry
		const mask = new Graphics();
		if (shape.type === 'circle') {
			const rx = shape.size.x / 2;
			const ry = shape.size.y / 2;
			mask.ellipse(shape.position.x + rx, shape.position.y + ry, rx, ry);
		} else {
			const absPoints = shape.points.map(p => ({
				x: p.x + shape.position.x,
				y: p.y + shape.position.y,
			}));
			const flat = absPoints.flatMap(p => [p.x, p.y]);
			mask.poly(flat, true);
		}
		mask.fill({ color: 0xffffff });

		container.addChild(sprite);
		container.addChild(mask);
		sprite.mask = mask;
	}

	private loadTextureAsync(resource: ResourceData): void {
		if (this.loadingTextures.has(resource.id)) return;
		this.loadingTextures.add(resource.id);

		if (resource.type === 'image') {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				const source = new ImageSource({ resource: img });
				const texture = new Texture({ source });
				this.textureCache.set(resource.id, texture);
				this.loadingTextures.delete(resource.id);
				this.render();
			};
			img.onerror = () => {
				this.loadingTextures.delete(resource.id);
			};
			img.src = resource.src;
		} else if (resource.type === 'video') {
			const video = document.createElement('video');
			video.src = resource.src;
			video.loop = true;
			video.muted = true;
			video.playsInline = true;
			video.preload = 'auto';

			video.addEventListener('loadeddata', () => {
				const source = new VideoSource({ resource: video, autoPlay: false });
				const texture = new Texture({ source });
				const entry: VideoEntry = { element: video, source, texture };
				this.videoEntries.set(resource.id, entry);
				this.textureCache.set(resource.id, texture);
				this.loadingTextures.delete(resource.id);
				this.render();
			});

			video.addEventListener('error', () => {
				this.loadingTextures.delete(resource.id);
			});
		} else if (resource.type === 'text' && resource.textOptions) {
			const entry = this.createTextEntry(resource.textOptions);
			this.textEntries.set(resource.id, entry);
			this.textureCache.set(resource.id, entry.texture);
			this.loadingTextures.delete(resource.id);
			this.render();
		} else if (resource.type === 'text') {
			// Legacy text without textOptions — load as image from src
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				const source = new ImageSource({ resource: img });
				const texture = new Texture({ source });
				this.textureCache.set(resource.id, texture);
				this.loadingTextures.delete(resource.id);
				this.render();
			};
			img.onerror = () => this.loadingTextures.delete(resource.id);
			img.src = resource.src;
		} else if (resource.type === 'color' && resource.colorOptions) {
			const entry = this.createColorEntry(resource.colorOptions);
			this.colorEntries.set(resource.id, entry);
			this.textureCache.set(resource.id, entry.texture);
			this.loadingTextures.delete(resource.id);
			this.render();
		}
	}

	private createColorEntry(options: ColorOptions): ColorEntry {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;
		const ctx = canvas.getContext('2d')!;
		const source = new CanvasSource({ resource: canvas });
		const texture = new Texture({ source });

		const entry: ColorEntry = { canvas, ctx, source, texture, options, startTime: Date.now() };
		this.renderColorCanvas(entry);
		return entry;
	}

	private renderColorCanvas(entry: ColorEntry): void {
		const { ctx, canvas, options } = entry;
		const w = canvas.width;
		const h = canvas.height;

		ctx.clearRect(0, 0, w, h);

		if (options.mode === 'solid') {
			ctx.fillStyle = options.color;
			ctx.fillRect(0, 0, w, h);
		} else if (options.mode === 'gradient') {
			const stops = [...options.gradientStops].sort((a, b) => a.position - b.position);
			let grad: CanvasGradient;
			if (options.gradientType === 'radial') {
				grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
			} else {
				const angle = (options.gradientAngle * Math.PI) / 180;
				const cx = w / 2, cy = h / 2;
				const len = Math.max(w, h);
				grad = ctx.createLinearGradient(
					cx - Math.cos(angle) * len / 2, cy - Math.sin(angle) * len / 2,
					cx + Math.cos(angle) * len / 2, cy + Math.sin(angle) * len / 2,
				);
			}
			stops.forEach(s => grad.addColorStop(s.position / 100, s.color));
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, w, h);
		} else if (options.mode === 'animated') {
			const elapsed = Date.now() - entry.startTime;
			const color = this.getAnimatedColorValue(options, elapsed);
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, w, h);
		}
	}

	private getAnimatedColorValue(options: ColorOptions, elapsed: number): string {
		const kfs = [...options.animatedKeyframes].sort((a, b) => a.time - b.time);
		if (kfs.length === 0) return '#000000';
		if (kfs.length === 1) return kfs[0].color;

		let progress = (elapsed % options.animatedDuration) / options.animatedDuration * 100;
		if (!options.animatedLoop && elapsed >= options.animatedDuration) {
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

		const ar = parseInt(prev.color.slice(1, 3), 16);
		const ag = parseInt(prev.color.slice(3, 5), 16);
		const ab = parseInt(prev.color.slice(5, 7), 16);
		const br = parseInt(next.color.slice(1, 3), 16);
		const bg = parseInt(next.color.slice(3, 5), 16);
		const bb = parseInt(next.color.slice(5, 7), 16);
		const r = Math.round(ar + (br - ar) * t);
		const g = Math.round(ag + (bg - ag) * t);
		const b = Math.round(ab + (bb - ab) * t);
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}

	private drawPoints(shape: ShapeData): void {
		if (shape.type === 'circle') {
			this.drawEllipseHandles(shape);
			return;
		}

		for (let i = 0; i < shape.points.length; i++) {
			const p = shape.points[i];
			const absX = p.x + shape.position.x;
			const absY = p.y + shape.position.y;

			const g = new Graphics();
			g.circle(absX, absY, POINT_RADIUS);
			g.fill({ color: POINT_COLOR });
			g.eventMode = 'static';
			g.cursor = 'grab';

			g.on('pointerdown', (e: FederatedPointerEvent) => {
				e.stopPropagation();
				this.dragTarget = { type: 'point', shapeId: shape.id, pointIndex: i };
				this.dragOffset = { x: 0, y: 0 };
			});

			this.pointsContainer.addChild(g);
		}
	}

	private drawEllipseHandles(shape: ShapeData): void {
		const rx = shape.size.x / 2;
		const ry = shape.size.y / 2;
		const cx = shape.position.x + rx;
		const cy = shape.position.y + ry;

		const center = new Graphics();
		center.circle(cx, cy, POINT_RADIUS);
		center.fill({ color: POINT_COLOR });
		center.eventMode = 'static';
		center.cursor = 'move';
		center.on('pointerdown', (e: FederatedPointerEvent) => {
			e.stopPropagation();
			this.dragTarget = { type: 'shape', shapeId: shape.id };
			const pos = e.getLocalPosition(this.worldContainer);
			this.dragOffset = { x: pos.x - shape.position.x, y: pos.y - shape.position.y };
		});
		this.pointsContainer.addChild(center);

		const handleRight = new Graphics();
		handleRight.circle(cx + rx, cy, POINT_RADIUS);
		handleRight.fill({ color: HANDLE_COLOR });
		handleRight.eventMode = 'static';
		handleRight.cursor = 'ew-resize';
		handleRight.on('pointerdown', (e: FederatedPointerEvent) => {
			e.stopPropagation();
			this.dragTarget = { type: 'handle-x', shapeId: shape.id };
			this.dragOffset = { x: 0, y: 0 };
		});
		this.pointsContainer.addChild(handleRight);

		const handleBottom = new Graphics();
		handleBottom.circle(cx, cy + ry, POINT_RADIUS);
		handleBottom.fill({ color: HANDLE_COLOR });
		handleBottom.eventMode = 'static';
		handleBottom.cursor = 'ns-resize';
		handleBottom.on('pointerdown', (e: FederatedPointerEvent) => {
			e.stopPropagation();
			this.dragTarget = { type: 'handle-y', shapeId: shape.id };
			this.dragOffset = { x: 0, y: 0 };
		});
		this.pointsContainer.addChild(handleBottom);
	}

	private createTextEntry(options: TextOptions): TextEntry {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;

		const fontStyle = `${options.italic ? 'italic ' : ''}${options.bold ? 'bold ' : ''}${options.fontSize}px ${options.fontFamily}`;
		ctx.font = fontStyle;

		const metrics = ctx.measureText(options.text);
		const textWidth = metrics.width;
		const pad = options.padding + options.strokeWidth;

		// For marquee, make canvas wider to allow scrolling
		const isHorizontal = options.marqueeDirection === 'left' || options.marqueeDirection === 'right';
		const isVertical = options.marqueeDirection === 'up' || options.marqueeDirection === 'down';

		let w = Math.ceil(textWidth + pad * 2);
		let h = Math.ceil(options.fontSize * 1.4 + pad * 2);

		if (options.marquee && isHorizontal) {
			w = Math.max(w, 600);
		} else if (options.marquee && isVertical) {
			h = Math.max(h, 400);
		}

		canvas.width = w;
		canvas.height = h;

		const source = new CanvasSource({ resource: canvas });
		const texture = new Texture({ source });

		const entry: TextEntry = {
			canvas, ctx, source, texture, options,
			offset: 0,
			width: w,
			height: h,
			textWidth,
		};

		this.renderTextCanvas(entry);
		return entry;
	}

	private renderTextCanvas(entry: TextEntry): void {
		const { ctx, canvas, options } = entry;
		const w = canvas.width;
		const h = canvas.height;

		ctx.clearRect(0, 0, w, h);

		// Background
		if (options.backgroundColor && options.backgroundColor !== '#00000000') {
			ctx.fillStyle = options.backgroundColor;
			ctx.fillRect(0, 0, w, h);
		}

		const fontStyle = `${options.italic ? 'italic ' : ''}${options.bold ? 'bold ' : ''}${options.fontSize}px ${options.fontFamily}`;
		ctx.font = fontStyle;
		ctx.textBaseline = 'middle';
		ctx.globalAlpha = options.opacity / 100;

		const pad = options.padding + options.strokeWidth;
		let x: number;
		let y = h / 2;

		if (options.alignment === 'center') {
			ctx.textAlign = 'center';
			x = w / 2;
		} else if (options.alignment === 'right') {
			ctx.textAlign = 'right';
			x = w - pad;
		} else {
			ctx.textAlign = 'left';
			x = pad;
		}

		// Marquee offset
		if (options.marquee) {
			const speed = options.marqueeSpeed / 60;
			entry.offset += speed;

			const dir = options.marqueeDirection;
			if (dir === 'left') {
				const totalW = entry.textWidth + w;
				x = w - (entry.offset % totalW);
				ctx.textAlign = 'left';
			} else if (dir === 'right') {
				const totalW = entry.textWidth + w;
				x = -entry.textWidth + (entry.offset % totalW);
				ctx.textAlign = 'left';
			} else if (dir === 'up') {
				const totalH = options.fontSize + h;
				y = h - (entry.offset % totalH) + options.fontSize / 2;
			} else if (dir === 'down') {
				const totalH = options.fontSize + h;
				y = -options.fontSize / 2 + (entry.offset % totalH);
			}

			if (!options.marqueeLoop) {
				const maxTravel = dir === 'left' || dir === 'right'
					? entry.textWidth + w
					: options.fontSize + h;
				if (entry.offset >= maxTravel) {
					entry.offset = maxTravel;
				}
			}
		}

		if (options.strokeWidth > 0) {
			ctx.strokeStyle = options.strokeColor;
			ctx.lineWidth = options.strokeWidth;
			ctx.strokeText(options.text, x, y);
		}

		ctx.fillStyle = options.color;
		ctx.fillText(options.text, x, y);
		ctx.globalAlpha = 1;
	}

	clearResourceCache(resourceId: string): void {
		this.textureCache.delete(resourceId);
		this.loadingTextures.delete(resourceId);
		this.videoEntries.delete(resourceId);
		this.textEntries.delete(resourceId);
		this.colorEntries.delete(resourceId);
	}

	private clearCaches(): void {
		this.textureCache.clear();
		this.loadingTextures.clear();
		for (const entry of this.videoEntries.values()) {
			entry.element.pause();
			entry.element.src = '';
		}
		this.videoEntries.clear();
		this.textEntries.clear();
		this.colorEntries.clear();
	}

	private onStagePointerDown(e: FederatedPointerEvent): void {
		if (this.panMode) {
			const nativeEvent = e.nativeEvent as PointerEvent;
			this.panning = true;
			this.panStart = { x: nativeEvent.clientX, y: nativeEvent.clientY };
			this.panOffset = { x: this.worldContainer.x, y: this.worldContainer.y };
			return;
		}
		state.selectShape(null);
	}

	private onPointerMove(e: FederatedPointerEvent): void {
		if (!this.dragTarget) return;

		const pos = e.getLocalPosition(this.worldContainer);
		const nativeEvent = e.nativeEvent as PointerEvent;
		const altKey = nativeEvent.altKey;
		const shape = state.getShapes().find(s => s.id === this.dragTarget!.shapeId);
		if (!shape) return;

		if (this.dragTarget.type === 'shape' && this.multiDragStart && this.multiDragStart.size > 0) {
			// Multi-drag: move all selected shapes by the same delta
			const dx = Math.round(pos.x - this.dragOffset.x);
			const dy = Math.round(pos.y - this.dragOffset.y);
			for (const [id, startPos] of this.multiDragStart) {
				state.updateShape(id, {
					position: {
						x: this.snap(startPos.x + dx),
						y: this.snap(startPos.y + dy),
					},
				});
			}
		} else if (this.dragTarget.type === 'shape') {
			state.updateShape(shape.id, {
				position: {
					x: this.snap(Math.round(pos.x - this.dragOffset.x)),
					y: this.snap(Math.round(pos.y - this.dragOffset.y)),
				},
			});
		} else if (this.dragTarget.type === 'handle-x') {
			const cx = shape.position.x + shape.size.x / 2;
			const cy = shape.position.y + shape.size.y / 2;
			const newRx = Math.max(10, Math.round(Math.abs(pos.x - cx)));
			if (altKey) {
				// Proportional resize
				const ratio = shape.size.y / shape.size.x;
				const newRy = Math.max(10, Math.round(newRx * ratio));
				state.updateShape(shape.id, {
					size: { x: newRx * 2, y: newRy * 2 },
					position: { x: cx - newRx, y: cy - newRy },
				});
			} else {
				state.updateShape(shape.id, {
					size: { x: newRx * 2, y: shape.size.y },
					position: { x: cx - newRx, y: shape.position.y },
				});
			}
		} else if (this.dragTarget.type === 'handle-y') {
			const cx = shape.position.x + shape.size.x / 2;
			const cy = shape.position.y + shape.size.y / 2;
			const newRy = Math.max(10, Math.round(Math.abs(pos.y - cy)));
			if (altKey) {
				const ratio = shape.size.x / shape.size.y;
				const newRx = Math.max(10, Math.round(newRy * ratio));
				state.updateShape(shape.id, {
					size: { x: newRx * 2, y: newRy * 2 },
					position: { x: cx - newRx, y: cy - newRy },
				});
			} else {
				state.updateShape(shape.id, {
					size: { x: shape.size.x, y: newRy * 2 },
					position: { x: shape.position.x, y: cy - newRy },
				});
			}
		} else if (this.dragTarget.type === 'point' && this.dragTarget.pointIndex !== undefined) {
			const newPoints = [...shape.points];
			newPoints[this.dragTarget.pointIndex] = {
				x: Math.round(pos.x - shape.position.x),
				y: Math.round(pos.y - shape.position.y),
			};
			state.updateShape(shape.id, { points: newPoints });
		}
	}

	private onPointerUp(): void {
		this.dragTarget = null;
		this.multiDragStart = null;
	}
}
