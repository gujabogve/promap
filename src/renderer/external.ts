import './types/promap-api';
import { Application, Graphics, Sprite, Texture, VideoSource, ImageSource, CanvasSource, Container } from 'pixi.js';
import { ShapeData, ResourceData, ColorOptions, TextOptions, GroupAnimationOptions, EasingType } from './types';

interface GroupState {
	name: string;
	shapeIds: string[];
	animation?: GroupAnimationOptions;
	animationPlaying?: boolean;
	animationStartTime?: number;
}

interface ExternalState {
	shapes: ShapeData[];
	resources: ResourceData[];
	showOutline: boolean;
	showPoints: boolean;
	showGrid: boolean;
	projectorDisplay?: Record<number, { showOutline: boolean; showPoints: boolean; showGrid: boolean; showFace: boolean }>;
	groups: Record<string, GroupState>;
}

const OUTLINE_COLOR = 0xffffff;
const POINT_COLOR = 0xffffff;
const POINT_RADIUS = 6;

class ExternalRenderer {
	private app: Application;
	private projectorId: number;
	private textureCache: Map<string, Texture> = new Map();
	private videoEntries: Map<string, { element: HTMLVideoElement; source: VideoSource; texture: Texture }> = new Map();
	private loadingTextures: Set<string> = new Set();
	private currentState: ExternalState | null = null;

	private shapeContainers: Map<string, Container> = new Map();
	private gridContainer: Container;
	private shapesLayer: Container;
	private needsRebuild = false;
	private randomOrders: Map<string, string[]> = new Map();

	constructor(app: Application, projectorId = 1) {
		this.app = app;
		this.projectorId = projectorId;

		this.gridContainer = new Container();
		this.shapesLayer = new Container();
		this.app.stage.addChild(this.gridContainer);
		this.app.stage.addChild(this.shapesLayer);

		this.app.ticker.add(() => this.tick());

		window.promap.onStateUpdate((data: string) => {
			this.currentState = JSON.parse(data);
			this.needsRebuild = true;
		});
	}

	private tick(): void {
		// Update video textures
		for (const entry of this.videoEntries.values()) {
			if (!entry.element.paused) {
				entry.source.update();
			}
		}

		// Rebuild scene if state changed
		if (this.needsRebuild) {
			this.rebuild();
			this.needsRebuild = false;
		}

		// Run animation locally every frame
		this.applyAnimations();
	}

	private rebuild(): void {
		if (!this.currentState) return;
		const { shapes, resources } = this.currentState;

		// Use per-projector display options if available, fallback to global
		const perProjector = this.currentState.projectorDisplay?.[this.projectorId];
		const showOutline = perProjector?.showOutline ?? this.currentState.showOutline;
		const showPoints = perProjector?.showPoints ?? this.currentState.showPoints;
		const showGrid = perProjector?.showGrid ?? this.currentState.showGrid;
		const showFace = perProjector?.showFace ?? false;

		// Grid
		this.gridContainer.removeChildren();
		if (showGrid) {
			const g = new Graphics();
			const w = this.app.screen.width;
			const h = this.app.screen.height;
			for (let x = 0; x <= w; x += 50) { g.moveTo(x, 0); g.lineTo(x, h); }
			for (let y = 0; y <= h; y += 50) { g.moveTo(0, y); g.lineTo(w, y); }
			g.stroke({ color: 0xffffff, width: 1, alpha: 0.15 });
			this.gridContainer.addChild(g);
		}

		// Shapes
		this.shapesLayer.removeChildren();
		this.shapeContainers.clear();

		for (const shape of shapes) {
			if (shape.visible === false) continue;
			// Filter by projector assignment
			if (shape.projector && shape.projector !== this.projectorId) continue;

			const container = new Container();

			const resource = resources.find(r => r.id === shape.resource);
			if (resource) this.drawResource(shape, resource, container);

			// Face fill (white transparent)
			if (showFace) {
				const fg = new Graphics();
				if (shape.type === 'circle') {
					fg.ellipse(shape.position.x + shape.size.x / 2, shape.position.y + shape.size.y / 2, shape.size.x / 2, shape.size.y / 2);
				} else if (shape.points.length >= 3) {
					fg.poly(shape.points.flatMap(p => [p.x + shape.position.x, p.y + shape.position.y]), true);
				}
				fg.fill({ color: 0xffffff, alpha: 0.2 });
				container.addChild(fg);
			}

			// Outline
			if (showOutline) {
				const g = new Graphics();
				if (shape.type === 'circle') {
					g.ellipse(shape.position.x + shape.size.x / 2, shape.position.y + shape.size.y / 2, shape.size.x / 2, shape.size.y / 2);
				} else if (shape.points.length >= 3) {
					g.poly(shape.points.flatMap(p => [p.x + shape.position.x, p.y + shape.position.y]), true);
				}
				g.stroke({ color: OUTLINE_COLOR, width: 2, alpha: 0.7 });
				container.addChild(g);
			}

			// Points (including center point for circles)
			if (showPoints) {
				if (shape.type === 'circle') {
					const pg = new Graphics();
					pg.circle(shape.position.x + shape.size.x / 2, shape.position.y + shape.size.y / 2, POINT_RADIUS);
					pg.fill({ color: POINT_COLOR, alpha: 0.7 });
					container.addChild(pg);
				} else {
					for (const p of shape.points) {
						const pg = new Graphics();
						pg.circle(p.x + shape.position.x, p.y + shape.position.y, POINT_RADIUS);
						pg.fill({ color: POINT_COLOR, alpha: 0.7 });
						container.addChild(pg);
					}
				}
			}

			if (shape.rotation !== 0) {
				const center = this.getShapeCenter(shape);
				container.pivot.set(center.x, center.y);
				container.position.set(center.x, center.y);
				container.rotation = (shape.rotation * Math.PI) / 180;
			}

			this.shapeContainers.set(shape.id, container);
			this.shapesLayer.addChild(container);
		}

		// Video sync
		for (const shape of shapes) {
			if (!shape.resource || shape.visible === false) continue;
			const resource = resources.find(r => r.id === shape.resource);
			if (!resource || resource.type !== 'video') continue;
			const entry = this.videoEntries.get(resource.id);
			if (!entry) continue;
			if (shape.playing && entry.element.paused) entry.element.play().catch(() => {});
			else if (!shape.playing && !entry.element.paused) entry.element.pause();
			entry.element.loop = shape.loop;
			entry.element.playbackRate = shape.fps / 30;
		}
	}

	/** Runs every frame — calculates animation opacity locally */
	private applyAnimations(): void {
		if (!this.currentState?.groups) return;

		const groups = this.currentState.groups;
		const hasAnim = Object.values(groups).some(g => g.animationPlaying);
		if (!hasAnim) return;

		// Build opacity map
		const animOpacity = new Map<string, number>();

		for (const group of Object.values(groups)) {
			if (!group.animationPlaying || !group.animation || !group.animationStartTime) continue;
			const anim = group.animation;
			if (anim.mode === 'none') continue;

			const elapsed = Date.now() - group.animationStartTime;
			const cycleDuration = anim.fadeDuration * 2 + anim.holdDuration;
			if (cycleDuration <= 0) continue;

			// Filter visible shapes
			const visibleIds = group.shapeIds.filter(id => {
				const s = this.currentState!.shapes.find(sh => sh.id === id);
				return s && s.visible !== false;
			});
			if (visibleIds.length === 0) continue;

			// Build steps
			let steps: string[][];
			if (anim.mode === 'from-middle') {
				steps = this.getFromMiddlePairs(visibleIds);
			} else if (anim.mode === 'random') {
				const key = group.shapeIds.join(',') + ':' + group.animationStartTime;
				if (!this.randomOrders.has(key)) {
					const shuffled = [...visibleIds];
					for (let i = shuffled.length - 1; i > 0; i--) {
						const j = Math.floor(Math.random() * (i + 1));
						[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
					}
					this.randomOrders.set(key, shuffled);
				}
				steps = this.randomOrders.get(key)!.map(id => [id]);
			} else {
				steps = visibleIds.map(id => [id]);
			}
			if (steps.length === 0) continue;

			const totalDuration = cycleDuration * steps.length;
			let time = anim.loop ? elapsed % totalDuration : Math.min(elapsed, totalDuration);
			if (!anim.loop && elapsed >= totalDuration) continue;

			const stepIndex = Math.min(Math.floor(time / cycleDuration), steps.length - 1);
			const phaseTime = time % cycleDuration;
			const activeIds = steps[stepIndex];

			let opacity: number;
			if (phaseTime < anim.fadeDuration) {
				opacity = anim.fadeDuration > 0 ? phaseTime / anim.fadeDuration : 1;
			} else if (phaseTime < anim.fadeDuration + anim.holdDuration) {
				opacity = 1;
			} else {
				const fadeOut = phaseTime - anim.fadeDuration - anim.holdDuration;
				opacity = anim.fadeDuration > 0 ? 1 - fadeOut / anim.fadeDuration : 0;
			}
			opacity = this.ease(Math.max(0, Math.min(1, opacity)), anim.easing ?? 'linear');

			// Set all group shapes to 0, active ones to opacity
			for (const id of group.shapeIds) {
				animOpacity.set(id, 0);
			}
			for (const id of activeIds) {
				animOpacity.set(id, opacity);
			}
		}

		// Apply to containers
		if (animOpacity.size === 0) return;

		for (const [shapeId, container] of this.shapeContainers) {
			const op = animOpacity.get(shapeId);
			if (op === undefined) {
				container.visible = true;
				container.alpha = 1;
			} else if (op <= 0) {
				container.visible = false;
			} else {
				container.visible = true;
				container.alpha = op;
			}
		}
	}

	private ease(t: number, type: EasingType): number {
		switch (type) {
			case 'linear': return t;
			case 'ease-in': return t * t;
			case 'ease-out': return t * (2 - t);
			case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
			default: return t;
		}
	}

	private getFromMiddlePairs(shapeIds: string[]): string[][] {
		const steps: string[][] = [];
		const len = shapeIds.length;
		if (len === 0) return steps;

		if (len % 2 === 1) {
			const mid = Math.floor(len / 2);
			steps.push([shapeIds[mid]]);
			for (let i = 1; mid - i >= 0 || mid + i < len; i++) {
				const pair: string[] = [];
				if (mid - i >= 0) pair.push(shapeIds[mid - i]);
				if (mid + i < len) pair.push(shapeIds[mid + i]);
				if (pair.length > 0) steps.push(pair);
			}
		} else {
			const midL = len / 2 - 1;
			const midR = len / 2;
			steps.push([shapeIds[midL], shapeIds[midR]]);
			for (let i = 1; midL - i >= 0 || midR + i < len; i++) {
				const pair: string[] = [];
				if (midL - i >= 0) pair.push(shapeIds[midL - i]);
				if (midR + i < len) pair.push(shapeIds[midR + i]);
				if (pair.length > 0) steps.push(pair);
			}
		}
		return steps;
	}

	private getShapeCenter(shape: ShapeData): { x: number; y: number } {
		if (shape.type === 'circle') {
			return { x: shape.position.x + shape.size.x / 2, y: shape.position.y + shape.size.y / 2 };
		}
		const xs = shape.points.map(p => p.x + shape.position.x);
		const ys = shape.points.map(p => p.y + shape.position.y);
		return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
	}

	private drawResource(shape: ShapeData, resource: ResourceData, container: Container): void {
		if (!resource.src && !resource.colorOptions && !resource.textOptions) return;

		const texture = this.textureCache.get(resource.id);
		if (!texture) {
			this.loadTextureAsync(resource);
			return;
		}

		const sprite = new Sprite(texture);

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
			sprite.x = offset.x;
			sprite.y = offset.y;
			sprite.scale.set(shape.resourceScale ?? 1);
		} else if (shape.projectionType === 'mapped') {
			const offset = shape.resourceOffset ?? { x: 0, y: 0 };
			sprite.x = bounds.x - offset.x;
			sprite.y = bounds.y - offset.y;
			sprite.scale.set(shape.resourceScale ?? 1);
		} else if (shape.projectionType === 'fit') {
			const texW = texture.width || bounds.w;
			const texH = texture.height || bounds.h;
			const scale = Math.min(bounds.w / texW, bounds.h / texH);
			sprite.x = bounds.x + (bounds.w - texW * scale) / 2;
			sprite.y = bounds.y + (bounds.h - texH * scale) / 2;
			sprite.width = texW * scale;
			sprite.height = texH * scale;
		} else {
			sprite.x = bounds.x;
			sprite.y = bounds.y;
			sprite.width = bounds.w;
			sprite.height = bounds.h;
		}

		const mask = new Graphics();
		if (shape.type === 'circle') {
			mask.ellipse(shape.position.x + shape.size.x / 2, shape.position.y + shape.size.y / 2, shape.size.x / 2, shape.size.y / 2);
		} else {
			mask.poly(shape.points.flatMap(p => [p.x + shape.position.x, p.y + shape.position.y]), true);
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
				this.textureCache.set(resource.id, new Texture({ source: new ImageSource({ resource: img }) }));
				this.loadingTextures.delete(resource.id);
				this.needsRebuild = true;
			};
			img.onerror = () => this.loadingTextures.delete(resource.id);
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
				this.videoEntries.set(resource.id, { element: video, source, texture: new Texture({ source }) });
				this.textureCache.set(resource.id, this.videoEntries.get(resource.id)!.texture);
				this.loadingTextures.delete(resource.id);
				this.needsRebuild = true;
			});
			video.addEventListener('error', () => this.loadingTextures.delete(resource.id));
		} else if (resource.type === 'text' && resource.textOptions) {
			this.textureCache.set(resource.id, this.createTextTexture(resource.textOptions));
			this.loadingTextures.delete(resource.id);
			this.needsRebuild = true;
		} else if (resource.type === 'color' && resource.colorOptions) {
			this.textureCache.set(resource.id, this.createColorTexture(resource.colorOptions));
			this.loadingTextures.delete(resource.id);
			this.needsRebuild = true;
		} else if (resource.type === 'text' && resource.src) {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				this.textureCache.set(resource.id, new Texture({ source: new ImageSource({ resource: img }) }));
				this.loadingTextures.delete(resource.id);
				this.needsRebuild = true;
			};
			img.onerror = () => this.loadingTextures.delete(resource.id);
			img.src = resource.src;
		}
	}

	private createTextTexture(opts: TextOptions): Texture {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;
		const font = `${opts.italic ? 'italic ' : ''}${opts.bold ? 'bold ' : ''}${opts.fontSize}px ${opts.fontFamily}`;
		ctx.font = font;
		const pad = opts.padding + opts.strokeWidth;
		canvas.width = Math.ceil(ctx.measureText(opts.text).width + pad * 2);
		canvas.height = Math.ceil(opts.fontSize * 1.4 + pad * 2);
		if (opts.backgroundColor && opts.backgroundColor !== 'transparent' && opts.backgroundColor !== '#00000000') {
			ctx.fillStyle = opts.backgroundColor;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		ctx.font = font;
		ctx.textBaseline = 'middle';
		ctx.globalAlpha = opts.opacity / 100;
		let x = pad;
		if (opts.alignment === 'center') { ctx.textAlign = 'center'; x = canvas.width / 2; }
		else if (opts.alignment === 'right') { ctx.textAlign = 'right'; x = canvas.width - pad; }
		if (opts.strokeWidth > 0) { ctx.strokeStyle = opts.strokeColor; ctx.lineWidth = opts.strokeWidth; ctx.strokeText(opts.text, x, canvas.height / 2); }
		ctx.fillStyle = opts.color;
		ctx.fillText(opts.text, x, canvas.height / 2);
		return new Texture({ source: new CanvasSource({ resource: canvas }) });
	}

	private createColorTexture(opts: ColorOptions): Texture {
		const canvas = document.createElement('canvas');
		canvas.width = 256; canvas.height = 256;
		const ctx = canvas.getContext('2d')!;
		if (opts.mode === 'solid') {
			ctx.fillStyle = opts.color;
			ctx.fillRect(0, 0, 256, 256);
		} else if (opts.mode === 'gradient') {
			const stops = [...opts.gradientStops].sort((a, b) => a.position - b.position);
			let grad: CanvasGradient;
			if (opts.gradientType === 'radial') { grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128); }
			else { const a = (opts.gradientAngle * Math.PI) / 180; grad = ctx.createLinearGradient(128 - Math.cos(a) * 128, 128 - Math.sin(a) * 128, 128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); }
			stops.forEach(s => grad.addColorStop(s.position / 100, s.color));
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, 256, 256);
		} else {
			ctx.fillStyle = opts.animatedKeyframes[0]?.color ?? '#000';
			ctx.fillRect(0, 0, 256, 256);
		}
		return new Texture({ source: new CanvasSource({ resource: canvas }) });
	}
}

async function init(): Promise<void> {
	const params = new URLSearchParams(window.location.search);
	const projectorId = parseInt(params.get('projector') ?? '1');

	const app = new Application();
	await app.init({ resizeTo: window, background: 0x000000, antialias: true });
	document.body.appendChild(app.canvas);
	new ExternalRenderer(app, projectorId);
}

init();
