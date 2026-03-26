import './types/promap-api';
import { Application, Graphics, Sprite, Texture, VideoSource, ImageSource, CanvasSource, Container, BlurFilter, ColorMatrixFilter, Filter } from 'pixi.js';
import { PixelateFilter, RGBSplitFilter, DistortionFilter, GlitchFilter, VignetteFilter, NoiseColorFilter, WaveFilter } from './canvas/custom-filters';
import { ShapeData, ResourceData, ColorOptions, TextOptions, GroupAnimationOptions, EasingType } from './types';
import { createStlEntry, destroyStlEntry, tickStlEntries, updateStlRotationSpeed } from './utils/stl-renderer';

interface GroupState {
	name: string;
	shapeIds: string[];
	animation?: GroupAnimationOptions;
	animationPlaying?: boolean;
	animationStartTime?: number;
	_bpmAccumulator?: number;
	_randomOrder?: string[];
}

interface ExternalState {
	shapes: ShapeData[];
	resources: ResourceData[];
	showOutline: boolean;
	showPoints: boolean;
	showGrid: boolean;
	projectorDisplay?: Record<number, { showOutline: boolean; showPoints: boolean; showGrid: boolean; showFace: boolean; showCursor: boolean }>;
	groups: Record<string, GroupState>;
	audioLevel?: number;
	audioAboveThreshold?: boolean;
	midiBpm?: number;
	midiActive?: boolean;
	cursorPosition?: { x: number; y: number } | null;
}

const OUTLINE_COLOR = 0xffffff;
const POINT_COLOR = 0xffffff;
const POINT_RADIUS = 6;

class ExternalRenderer {
	private app: Application;
	private projectorId: number;
	private textureCache: Map<string, Texture> = new Map();
	private videoEntries: Map<string, { element: HTMLVideoElement; source: VideoSource; texture: Texture }> = new Map();
	private textEntries: Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; source: CanvasSource; texture: Texture; options: TextOptions; offset: number; width: number; textWidth: number }> = new Map();
	private colorEntries: Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; source: CanvasSource; texture: Texture; options: ColorOptions; startTime: number }> = new Map();
	private cameraStreams: Map<string, MediaStream> = new Map();
	private loadingTextures: Set<string> = new Set();
	private currentState: ExternalState | null = null;

	private shapeContainers: Map<string, Container> = new Map();
	private gridContainer: Container;
	private shapesLayer: Container;
	private needsRebuild = false;
	private randomOrders: Map<string, string[]> = new Map();
	private resourceFingerprints: Map<string, string> = new Map();
	private waveFilterCache: Map<string, WaveFilter> = new Map();
	private glitchFilterCache: Map<string, GlitchFilter> = new Map();
	private cursorGraphic: Graphics;

	constructor(app: Application, projectorId = 1) {
		this.app = app;
		this.projectorId = projectorId;

		this.gridContainer = new Container();
		this.shapesLayer = new Container();
		this.cursorGraphic = new Graphics();
		this.cursorGraphic.visible = false;
		this.app.stage.addChild(this.gridContainer);
		this.app.stage.addChild(this.shapesLayer);
		this.app.stage.addChild(this.cursorGraphic);

		this.app.ticker.add(() => this.tick());

		window.promap.onStateUpdate((data: string) => {
			const newState = JSON.parse(data) as ExternalState;

			// Detect resource changes — clear stale textures
			if (newState.resources) {
				for (const res of newState.resources) {
					const fp = JSON.stringify({
						src: res.src,
						colorOptions: res.colorOptions,
						textOptions: res.textOptions,
					});
					const oldFp = this.resourceFingerprints.get(res.id);
					if (oldFp && oldFp !== fp) {
						// Resource changed — dispose old resources before clearing
						this.disposeResource(res.id);
					}
					this.resourceFingerprints.set(res.id, fp);
				}

				// Remove fingerprints for deleted resources
				const currentIds = new Set(newState.resources.map(r => r.id));
				for (const id of this.resourceFingerprints.keys()) {
					if (!currentIds.has(id)) {
						this.disposeResource(id);
						this.resourceFingerprints.delete(id);
					}
				}
			}

			this.currentState = newState;
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

		// Update time-based filters
		for (const wf of this.waveFilterCache.values()) wf.update();
		for (const gf of this.glitchFilterCache.values()) gf.update();

		// Update animated color textures
		for (const entry of this.colorEntries.values()) {
			this.renderColorCanvas(entry);
			entry.source.update();
		}

		// Update STL rotation speeds from state and tick playing ones
		if (this.currentState) {
			const st = this.currentState;
			const playingStlIds = new Set<string>();
			const stlSpeedMultipliers = new Map<string, number>();
			for (const shape of st.shapes) {
				if (shape.playing && shape.resource) {
					const res = st.resources.find(r => r.id === shape.resource);
					if (res?.type === 'stl') {
						updateStlRotationSpeed(res.id, res.stlOptions?.rotationSpeed ?? 1);
						playingStlIds.add(res.id);
						if (shape.bpmSync || shape.midiSync) {
							let mult = 0;
							if (shape.bpmSync && st.audioAboveThreshold) {
								mult = Math.max(0.5, (st.audioLevel ?? 0) * 10);
							} else if (shape.midiSync && st.midiActive && (st.midiBpm ?? 0) > 0) {
								mult = (st.midiBpm ?? 0) / 120;
							}
							stlSpeedMultipliers.set(res.id, mult);
						}
					}
				}
			}
			tickStlEntries(playingStlIds, stlSpeedMultipliers);
		}

		// Animate marquee text
		if (this.currentState) {
			for (const [resourceId, entry] of this.textEntries) {
				if (!entry.options.marquee) continue;
				const shape = this.currentState.shapes.find(s => s.resource === resourceId && s.playing);
				if (shape) {
					this.renderMarqueeCanvas(entry);
					entry.source.update();
				}
			}
		}

		// Rebuild scene if state changed
		if (this.needsRebuild) {
			this.rebuild();
			this.needsRebuild = false;
		}

		// Run animation locally every frame
		this.applyAnimations();

		// Update phantom cursor (respects per-projector showCursor toggle)
		const projOpts = this.currentState?.projectorDisplay?.[this.projectorId];
		const showCursor = projOpts?.showCursor ?? true;
		const cursor = showCursor ? this.currentState?.cursorPosition : null;
		if (cursor) {
			this.cursorGraphic.clear();
			this.cursorGraphic.setStrokeStyle({ width: 1.5, color: 0xffffff, alpha: 0.7 });
			// Crosshair lines
			this.cursorGraphic.moveTo(cursor.x - 10, cursor.y);
			this.cursorGraphic.lineTo(cursor.x + 10, cursor.y);
			this.cursorGraphic.moveTo(cursor.x, cursor.y - 10);
			this.cursorGraphic.lineTo(cursor.x, cursor.y + 10);
			this.cursorGraphic.stroke();
			// Center dot
			this.cursorGraphic.circle(cursor.x, cursor.y, 2);
			this.cursorGraphic.fill({ color: 0xffffff, alpha: 0.9 });
			this.cursorGraphic.visible = true;
		} else {
			this.cursorGraphic.visible = false;
		}
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

			// Apply effects
			const filters = this.buildFilters(shape);
			if (filters.length > 0) {
				container.filters = filters;
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

			const useAccumulator = anim.useBpm || anim.useMidi;

			let elapsed: number;
			if (useAccumulator) {
				elapsed = group._bpmAccumulator ?? 0;
			} else {
				elapsed = Date.now() - group.animationStartTime;
			}

			const cycleDuration = useAccumulator
				? 1500
				: anim.fadeDuration * 2 + anim.holdDuration;
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
			} else if (anim.mode === 'random' && group._randomOrder) {
				steps = group._randomOrder.filter(id => visibleIds.includes(id)).map(id => [id]);
			} else if (anim.mode === 'random') {
				steps = visibleIds.map(id => [id]);
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
			if (useAccumulator) {
				// BPM/MIDI mode: snap transitions, full opacity for active step
				opacity = 1;
			} else if (phaseTime < anim.fadeDuration) {
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

	private buildFilters(shape: ShapeData): Filter[] {
		const filters: Filter[] = [];
		const fx = shape.effects;

		if (fx.blur > 0) {
			const blur = new BlurFilter();
			blur.strength = fx.blur * 0.2;
			filters.push(blur);
		}

		if (fx.glow > 0) {
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
			filters.push(new DistortionFilter(fx.distortion * 0.03));
		}

		if (fx.glitch > 0) {
			let gf = this.glitchFilterCache.get(shape.id);
			if (!gf) {
				gf = new GlitchFilter(fx.glitch);
				this.glitchFilterCache.set(shape.id, gf);
			}
			gf.amount = fx.glitch;
			filters.push(gf);
		} else {
			this.glitchFilterCache.delete(shape.id);
		}

		if ((fx.pixelate ?? 0) > 0) {
			filters.push(new PixelateFilter(fx.pixelate * 0.15 + 1));
		}

		if ((fx.rgbSplit ?? 0) > 0) {
			filters.push(new RGBSplitFilter(fx.rgbSplit * 0.1));
		}

		if ((fx.invert ?? 0) > 0) {
			const cm = new ColorMatrixFilter();
			const t = fx.invert / 100;
			cm.matrix[0] = 1 - 2 * t;
			cm.matrix[6] = 1 - 2 * t;
			cm.matrix[12] = 1 - 2 * t;
			cm.matrix[4] = t;
			cm.matrix[9] = t;
			cm.matrix[14] = t;
			filters.push(cm);
		}

		if ((fx.sepia ?? 0) > 0) {
			const cm = new ColorMatrixFilter();
			cm.sepia(fx.sepia / 100, false);
			filters.push(cm);
		}

		if ((fx.noise ?? 0) > 0) {
			filters.push(new NoiseColorFilter(fx.noise * 0.01));
		}

		if ((fx.wave ?? 0) > 0) {
			let wf = this.waveFilterCache.get(shape.id);
			if (!wf) {
				wf = new WaveFilter(fx.wave);
				this.waveFilterCache.set(shape.id, wf);
			}
			wf.amount = fx.wave;
			filters.push(wf);
		} else {
			this.waveFilterCache.delete(shape.id);
		}

		if ((fx.vignette ?? 0) > 0) {
			filters.push(new VignetteFilter(fx.vignette * 0.01));
		}

		return filters;
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
			sprite.x = bounds.x + offset.x;
			sprite.y = bounds.y + offset.y;
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

	private disposeResource(id: string): void {
		const videoEntry = this.videoEntries.get(id);
		if (videoEntry) {
			videoEntry.element.pause();
			videoEntry.element.removeAttribute('src');
			videoEntry.element.load();
			videoEntry.source.destroy();
		}
		const stream = this.cameraStreams.get(id);
		if (stream) {
			stream.getTracks().forEach(t => t.stop());
			this.cameraStreams.delete(id);
		}
		const texture = this.textureCache.get(id);
		if (texture) {
			texture.destroy();
		}
		destroyStlEntry(id);
		this.textureCache.delete(id);
		this.loadingTextures.delete(id);
		this.videoEntries.delete(id);
		this.colorEntries.delete(id);
		this.textEntries.delete(id);
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
			video.crossOrigin = 'anonymous';
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
		} else if (resource.type === 'camera') {
			navigator.mediaDevices.getUserMedia({
				video: { deviceId: { exact: resource.src } },
			}).then(stream => {
				const video = document.createElement('video');
				video.srcObject = stream;
				video.muted = true;
				video.playsInline = true;
				video.autoplay = true;
				video.addEventListener('loadeddata', () => {
					const source = new VideoSource({ resource: video, autoPlay: true });
					const texture = new Texture({ source });
					this.videoEntries.set(resource.id, { element: video, source, texture });
					this.cameraStreams.set(resource.id, stream);
					this.textureCache.set(resource.id, texture);
					this.loadingTextures.delete(resource.id);
					this.needsRebuild = true;
				});
				video.play().catch(() => {});
			}).catch(() => {
				this.loadingTextures.delete(resource.id);
			});
		} else if (resource.type === 'text' && resource.textOptions) {
			this.textureCache.set(resource.id, this.createTextTexture(resource.textOptions, resource.id));
			this.loadingTextures.delete(resource.id);
			this.needsRebuild = true;
		} else if (resource.type === 'color' && resource.colorOptions) {
			if (resource.colorOptions.mode === 'animated') {
				const canvas = document.createElement('canvas');
				canvas.width = 256; canvas.height = 256;
				const ctx = canvas.getContext('2d')!;
				const source = new CanvasSource({ resource: canvas });
				const texture = new Texture({ source });
				const entry = { canvas, ctx, source, texture, options: resource.colorOptions, startTime: Date.now() };
				this.colorEntries.set(resource.id, entry);
				this.renderColorCanvas(entry);
				this.textureCache.set(resource.id, texture);
			} else {
				this.textureCache.set(resource.id, this.createColorTexture(resource.colorOptions));
			}
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
		} else if (resource.type === 'stl') {
			const xhr = new XMLHttpRequest();
			xhr.open('GET', resource.src);
			xhr.responseType = 'arraybuffer';
			xhr.onload = () => {
				const speed = resource.stlOptions?.rotationSpeed ?? 1;
				const { texture } = createStlEntry(resource.id, xhr.response as ArrayBuffer, speed);
				this.textureCache.set(resource.id, texture);
				this.loadingTextures.delete(resource.id);
				this.needsRebuild = true;
			};
			xhr.onerror = () => this.loadingTextures.delete(resource.id);
			xhr.send();
		}
	}

	private createTextTexture(opts: TextOptions, resourceId?: string): Texture {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;
		const font = `${opts.italic ? 'italic ' : ''}${opts.bold ? 'bold ' : ''}${opts.fontSize}px ${opts.fontFamily}`;
		ctx.font = font;
		const pad = opts.padding + opts.strokeWidth;
		const textWidth = ctx.measureText(opts.text).width;

		let w = Math.ceil(textWidth + pad * 2);
		const h = Math.ceil(opts.fontSize * 1.4 + pad * 2);
		if (opts.marquee && (opts.marqueeDirection === 'left' || opts.marqueeDirection === 'right')) {
			w = Math.max(w, 600);
		}
		canvas.width = w;
		canvas.height = h;

		// For marquee, create a tracked entry
		if (opts.marquee && resourceId) {
			const source = new CanvasSource({ resource: canvas });
			const texture = new Texture({ source });
			this.textEntries.set(resourceId, {
				canvas, ctx, source, texture, options: opts,
				offset: 0, width: w, textWidth,
			});
			this.renderMarqueeCanvas(this.textEntries.get(resourceId)!);
			return texture;
		}

		// Static text
		if (opts.backgroundColor && opts.backgroundColor !== 'transparent' && opts.backgroundColor !== '#00000000') {
			ctx.fillStyle = opts.backgroundColor;
			ctx.fillRect(0, 0, w, h);
		}
		ctx.font = font;
		ctx.textBaseline = 'middle';
		ctx.globalAlpha = opts.opacity / 100;
		let x = pad;
		if (opts.alignment === 'center') { ctx.textAlign = 'center'; x = w / 2; }
		else if (opts.alignment === 'right') { ctx.textAlign = 'right'; x = w - pad; }
		if (opts.strokeWidth > 0) { ctx.strokeStyle = opts.strokeColor; ctx.lineWidth = opts.strokeWidth; ctx.strokeText(opts.text, x, h / 2); }
		ctx.fillStyle = opts.color;
		ctx.fillText(opts.text, x, h / 2);
		return new Texture({ source: new CanvasSource({ resource: canvas }) });
	}

	private renderMarqueeCanvas(entry: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; options: TextOptions; offset: number; width: number; textWidth: number }): void {
		const { ctx, canvas, options } = entry;
		const w = canvas.width;
		const h = canvas.height;
		ctx.clearRect(0, 0, w, h);

		if (options.backgroundColor && options.backgroundColor !== 'transparent' && options.backgroundColor !== '#00000000') {
			ctx.fillStyle = options.backgroundColor;
			ctx.fillRect(0, 0, w, h);
		}

		const font = `${options.italic ? 'italic ' : ''}${options.bold ? 'bold ' : ''}${options.fontSize}px ${options.fontFamily}`;
		ctx.font = font;
		ctx.textBaseline = 'middle';
		ctx.globalAlpha = options.opacity / 100;

		const pad = options.padding + options.strokeWidth;
		let x = pad;
		const y = h / 2;

		const speed = (options.marqueeSpeed ?? 50) / 60;
		entry.offset += speed;

		const dir = options.marqueeDirection ?? 'left';
		ctx.textAlign = 'left';

		if (dir === 'left') {
			const totalW = entry.textWidth + w;
			x = w - (entry.offset % totalW);
		} else if (dir === 'right') {
			const totalW = entry.textWidth + w;
			x = -entry.textWidth + (entry.offset % totalW);
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

	private renderColorCanvas(entry: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; options: ColorOptions; startTime: number }): void {
		const { ctx, canvas, options } = entry;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		if (options.mode === 'animated') {
			const elapsed = Date.now() - entry.startTime;
			ctx.fillStyle = this.getAnimatedColorValue(options, elapsed);
		} else if (options.mode === 'solid') {
			ctx.fillStyle = options.color;
		} else {
			ctx.fillStyle = '#000';
		}
		ctx.fillRect(0, 0, canvas.width, canvas.height);
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
