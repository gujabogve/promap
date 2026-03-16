import { ShapeData, ShapeType, Point, ResourceData, KeyframeData, GroupAnimationOptions, TransitionEffect } from '../types';
import '../types/promap-api';

interface ProjectConfig {
	version: 1;
	shapes: ShapeData[];
	resources: ResourceData[];
	globalFps: number;
	resolution: Point;
	undoStack?: ShapeData[][];
	redoStack?: ShapeData[][];
	keyframes?: Record<string, KeyframeData[]>;
	timelineDuration?: number;
	groups?: Record<string, { name: string; shapeIds: string[]; animation?: GroupAnimationOptions }>;
}

type Listener = () => void;

const MAX_UNDO = 50;

class StateManager {
	private shapes: ShapeData[] = [];
	private resources: ResourceData[] = [];
	private selectedShapeId: string | null = null;
	private selectedGroupId: string | null = null;
	private multiSelectedIds: Set<string> = new Set();
	private groups: Map<string, { name: string; shapeIds: string[]; animation?: GroupAnimationOptions; animationPlaying?: boolean; animationStartTime?: number; _randomOrder?: string[]; _bpmAccumulator?: number; _bpmLastTick?: number }> = new Map();
	private listeners: Set<Listener> = new Set();
	private loadListeners: Set<Listener> = new Set();
	private nextZIndex = 0;
	private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	private undoStack: ShapeData[][] = [];
	private redoStack: ShapeData[][] = [];
	private lastUndoPush = 0;
	globalFps = 30;
	resolution: Point = { x: 1920, y: 1080 };
	private keyframes: Record<string, KeyframeData[]> = {};
	timelineTime = 0;
	timelinePlaying = false;
	timelineDuration = 300000; // 5 minutes default
	private timelineRafId: number | null = null;
	private lastTickTime = 0;
	externalOpen = false;
	externalShowOutline = false;
	externalShowPoints = false;
	externalShowGrid = false;
	audioSourceId: string | null = null;
	hdmiSourceId: string | null = null;

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onLoad(listener: Listener): () => void {
		this.loadListeners.add(listener);
		return () => this.loadListeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach(l => l());
		this.scheduleAutoSave();
		this.syncExternal();
	}

	syncExternal(): void {
		if (!this.externalOpen) return;

		// Send full state including group animation configs
		const groups: Record<string, { name: string; shapeIds: string[]; animation?: unknown; animationPlaying?: boolean; animationStartTime?: number }> = {};
		for (const [id, g] of this.groups) {
			groups[id] = {
				name: g.name,
				shapeIds: g.shapeIds,
				animation: g.animation,
				animationPlaying: g.animationPlaying,
				animationStartTime: g.animationStartTime,
			};
		}

		const data = JSON.stringify({
			shapes: this.shapes.sort((a, b) => a.zIndex - b.zIndex),
			resources: this.resources,
			showOutline: this.externalShowOutline,
			showPoints: this.externalShowPoints,
			showGrid: this.externalShowGrid,
			groups,
		});
		window.promap.syncExternal(data);
	}

	async toggleExternalWindow(): Promise<void> {
		if (this.externalOpen) {
			await window.promap.closeExternalWindow();
			this.externalOpen = false;
		} else {
			await window.promap.openExternalWindow();
			this.externalOpen = true;
			// Send initial state after a short delay for window to load
			setTimeout(() => this.syncExternal(), 500);
		}
		this.listeners.forEach(l => l());
	}

	setResolution(resolution: Point): void {
		this.resolution = resolution;
		this.notify();
	}

	setExternalToggle(key: 'externalShowOutline' | 'externalShowPoints' | 'externalShowGrid', value: boolean): void {
		this[key] = value;
		this.syncExternal();
	}

	private pushUndo(force = false): void {
		const now = Date.now();
		if (!force && now - this.lastUndoPush < 300) return;
		this.lastUndoPush = now;
		this.undoStack.push(structuredClone(this.shapes));
		if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
		this.redoStack = [];
	}

	undo(): void {
		if (this.undoStack.length === 0) return;
		this.redoStack.push(structuredClone(this.shapes));
		this.shapes = this.undoStack.pop()!;
		this.nextZIndex = this.shapes.reduce((max, s) => Math.max(max, s.zIndex + 1), 0);
		const selected = this.selectedShapeId;
		if (selected && !this.shapes.find(s => s.id === selected)) {
			this.selectedShapeId = null;
		}
		this.notify();
	}

	redo(): void {
		if (this.redoStack.length === 0) return;
		this.undoStack.push(structuredClone(this.shapes));
		this.shapes = this.redoStack.pop()!;
		this.nextZIndex = this.shapes.reduce((max, s) => Math.max(max, s.zIndex + 1), 0);
		const selected = this.selectedShapeId;
		if (selected && !this.shapes.find(s => s.id === selected)) {
			this.selectedShapeId = null;
		}
		this.notify();
	}

	getShapes(): ShapeData[] {
		return this.shapes;
	}

	getSelectedShape(): ShapeData | null {
		return this.shapes.find(s => s.id === this.selectedShapeId) ?? null;
	}

	selectShape(id: string | null): void {
		this.selectedShapeId = id;
		this.selectedGroupId = null;
		this.multiSelectedIds.clear();
		this.notify();
	}

	highlightShape(id: string | null): void {
		this.selectedShapeId = id;
		this.notify();
	}

	toggleMultiSelect(id: string): void {
		// If there's a single selected shape not yet in multi-select, include it
		if (this.selectedShapeId && !this.multiSelectedIds.has(this.selectedShapeId)) {
			this.multiSelectedIds.add(this.selectedShapeId);
		}

		if (this.multiSelectedIds.has(id)) {
			this.multiSelectedIds.delete(id);
		} else {
			this.multiSelectedIds.add(id);
		}
		if (this.multiSelectedIds.size > 0 && !this.selectedShapeId) {
			this.selectedShapeId = id;
		}
		this.notify();
	}

	getMultiSelectedIds(): Set<string> {
		return this.multiSelectedIds;
	}

	isMultiSelected(id: string): boolean {
		return this.multiSelectedIds.has(id);
	}

	// Groups

	createGroup(name: string, shapeIds: string[]): string {
		const id = crypto.randomUUID();
		this.groups.set(id, { name, shapeIds: [...shapeIds] });
		this.multiSelectedIds.clear();
		this.notify();
		return id;
	}

	getGroups(): Map<string, { name: string; shapeIds: string[] }> {
		return this.groups;
	}

	selectGroup(id: string | null): void {
		this.selectedGroupId = id;
		if (id) this.selectedShapeId = null;
		this.notify();
	}

	getSelectedGroup(): { id: string; name: string; shapeIds: string[] } | null {
		if (!this.selectedGroupId) return null;
		const group = this.groups.get(this.selectedGroupId);
		if (!group) return null;
		return { id: this.selectedGroupId, ...group };
	}

	removeGroup(id: string): void {
		this.groups.delete(id);
		if (this.selectedGroupId === id) this.selectedGroupId = null;
		this.notify();
	}

	renameGroup(id: string, name: string): void {
		const group = this.groups.get(id);
		if (group) {
			group.name = name;
			this.notify();
		}
	}

	addShapeToGroup(groupId: string, shapeId: string): void {
		const group = this.groups.get(groupId);
		if (group && !group.shapeIds.includes(shapeId)) {
			group.shapeIds.push(shapeId);
			this.notify();
		}
	}

	removeShapeFromGroup(groupId: string, shapeId: string): void {
		const group = this.groups.get(groupId);
		if (group) {
			group.shapeIds = group.shapeIds.filter(id => id !== shapeId);
			if (group.shapeIds.length === 0) {
				this.groups.delete(groupId);
				if (this.selectedGroupId === groupId) this.selectedGroupId = null;
			}
			this.notify();
		}
	}

	reorderShapeInGroup(groupId: string, fromIndex: number, toIndex: number): void {
		const group = this.groups.get(groupId);
		if (!group) return;
		const [moved] = group.shapeIds.splice(fromIndex, 1);
		group.shapeIds.splice(toIndex, 0, moved);
		this.notify();
	}

	updateGroupShapes(groupId: string, updates: Partial<ShapeData>): void {
		const group = this.groups.get(groupId);
		if (!group) return;
		this.pushUndo(true);
		for (const shapeId of group.shapeIds) {
			const idx = this.shapes.findIndex(s => s.id === shapeId);
			if (idx !== -1) {
				this.shapes[idx] = { ...this.shapes[idx], ...updates };
			}
		}
		this.notify();
	}

	updateGroupEffects(groupId: string, effects: Partial<ShapeData['effects']>): void {
		const group = this.groups.get(groupId);
		if (!group) return;
		for (const shapeId of group.shapeIds) {
			const shape = this.shapes.find(s => s.id === shapeId);
			if (shape) {
				shape.effects = { ...shape.effects, ...effects };
			}
		}
		this.notify();
	}

	setGroupAnimation(groupId: string, animation: GroupAnimationOptions): void {
		const group = this.groups.get(groupId);
		if (!group) return;
		group.animation = animation;
		this.notify();
	}

	playGroupAnimation(groupId: string): void {
		const group = this.groups.get(groupId);
		if (!group || !group.animation || group.animation.mode === 'none') return;
		group.animationPlaying = true;
		group.animationStartTime = Date.now();
		group._bpmAccumulator = 0;
		group._bpmLastTick = undefined;

		// Generate random order if needed
		if (group.animation.mode === 'random') {
			const shuffled = [...group.shapeIds];
			for (let i = shuffled.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
			}
			group._randomOrder = shuffled;
		}

		this.notify();
	}

	stopGroupAnimation(groupId: string): void {
		const group = this.groups.get(groupId);
		if (!group) return;
		group.animationPlaying = false;
		group.animationStartTime = undefined;
		// Show all shapes
		for (const shapeId of group.shapeIds) {
			const shape = this.shapes.find(s => s.id === shapeId);
			if (shape) {
				shape.visible = true;
				shape.effects = { ...shape.effects };
			}
		}
		this.notify();
	}

	tickBpmAnimation(groupId: string, audioLevel: number): void {
		const group = this.groups.get(groupId);
		if (!group || !group.animationPlaying || !group.animation || !group.animation.useBpm) return;

		const now = Date.now();
		const delta = group._bpmLastTick ? now - group._bpmLastTick : 0;
		group._bpmLastTick = now;

		if (audioLevel > 0.05) {
			const speed = audioLevel * 3;
			group._bpmAccumulator = (group._bpmAccumulator ?? 0) + delta * speed;
		}
	}

	getGroupAnimationState(groupId: string): Map<string, number> | null {
		const group = this.groups.get(groupId);
		if (!group || !group.animationPlaying || !group.animation || !group.animationStartTime) return null;

		const anim = group.animation;

		let elapsed: number;
		if (anim.useBpm) {
			elapsed = group._bpmAccumulator ?? 0;
		} else {
			elapsed = Date.now() - group.animationStartTime;
		}

		const cycleDuration = anim.useBpm
			? 1500
			: anim.fadeDuration * 2 + anim.holdDuration;

		// Filter out hidden shapes
		const visibleIds = group.shapeIds.filter(id => {
			const s = this.shapes.find(sh => sh.id === id);
			return s && s.visible !== false;
		});
		if (visibleIds.length === 0) return null;

		// Get ordered steps — each step is an array of shape IDs shown together
		let steps: string[][];
		if (anim.mode === 'from-middle') {
			steps = this.getFromMiddlePairs(visibleIds);
		} else if (anim.mode === 'random' && group._randomOrder) {
			steps = group._randomOrder.filter(id => visibleIds.includes(id)).map(id => [id]);
		} else {
			steps = visibleIds.map(id => [id]);
		}
		if (steps.length === 0) return null;

		const totalDuration = cycleDuration * steps.length;

		let time = elapsed;
		if (anim.loop) {
			time = elapsed % totalDuration;
		} else if (elapsed >= totalDuration) {
			group.animationPlaying = false;
			return null;
		}

		const stepIndex = Math.floor(time / cycleDuration);
		const phaseTime = time % cycleDuration;

		if (stepIndex >= steps.length) return null;

		const activeIds = steps[stepIndex];

		let opacity: number;
		if (phaseTime < anim.fadeDuration) {
			const t = anim.fadeDuration > 0 ? phaseTime / anim.fadeDuration : 1;
			opacity = this.ease(t, anim.easing ?? 'linear');
		} else if (phaseTime < anim.fadeDuration + anim.holdDuration) {
			opacity = 1;
		} else {
			const fadeOutTime = phaseTime - anim.fadeDuration - anim.holdDuration;
			const t = anim.fadeDuration > 0 ? 1 - fadeOutTime / anim.fadeDuration : 0;
			opacity = this.ease(Math.max(0, t), anim.easing ?? 'linear');
		}
		opacity = Math.max(0, Math.min(1, opacity));

		// Build map: all group shapes get 0, active ones get opacity
		const result = new Map<string, number>();
		for (const shapeId of group.shapeIds) {
			result.set(shapeId, 0);
		}
		for (const id of activeIds) {
			result.set(id, opacity);
		}

		return result;
	}

	private getFromMiddlePairs(shapeIds: string[]): string[][] {
		const steps: string[][] = [];
		const len = shapeIds.length;

		if (len === 0) return steps;

		if (len % 2 === 1) {
			// Odd: start with single middle, then pairs outward
			const mid = Math.floor(len / 2);
			steps.push([shapeIds[mid]]);
			for (let i = 1; mid - i >= 0 || mid + i < len; i++) {
				const pair: string[] = [];
				if (mid - i >= 0) pair.push(shapeIds[mid - i]);
				if (mid + i < len) pair.push(shapeIds[mid + i]);
				if (pair.length > 0) steps.push(pair);
			}
		} else {
			// Even: start with middle pair, then pairs outward
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

	addShape(type: ShapeType, nPoints?: number): ShapeData {
		this.pushUndo(true);
		const id = crypto.randomUUID();
		const position = { x: 100 + this.shapes.length * 20, y: 100 + this.shapes.length * 20 };
		const points = this.generatePoints(type, nPoints);

		const shape: ShapeData = {
			id,
			name: `${type}-${this.shapes.length + 1}`,
			type,
			points,
			position,
			rotation: 0,
			size: { x: 300, y: 300 },
			zIndex: this.nextZIndex++,
			resource: null,
			resourceOffset: { x: 0, y: 0 },
			resourceScale: 1,
			projector: 1,
			projectionType: 'default',
			fps: 30,
			loop: true,
			playing: false,
			ignoreGlobalPlayPause: false,
			bpmSync: false,
			effects: { blur: 0, glow: 0, colorCorrection: 0, distortion: 0, glitch: 0 },
			visible: true,
		};

		this.shapes.push(shape);
		this.selectedShapeId = id;
		this.notify();
		return shape;
	}

	updateShape(id: string, updates: Partial<ShapeData>): void {
		this.pushUndo();
		const idx = this.shapes.findIndex(s => s.id === id);
		if (idx !== -1) {
			this.shapes[idx] = { ...this.shapes[idx], ...updates };
			this.notify();
		}
	}

	deleteShape(id: string): void {
		this.pushUndo(true);
		this.shapes = this.shapes.filter(s => s.id !== id);
		if (this.selectedShapeId === id) this.selectedShapeId = null;
		this.notify();
	}

	duplicateShape(id: string): ShapeData | null {
		this.pushUndo(true);
		const shape = this.shapes.find(s => s.id === id);
		if (!shape) return null;

		const newShape: ShapeData = {
			...structuredClone(shape),
			id: crypto.randomUUID(),
			name: `${shape.name}-copy`,
			position: { x: shape.position.x + 20, y: shape.position.y + 20 },
			zIndex: this.nextZIndex++,
		};

		this.shapes.push(newShape);
		this.selectedShapeId = newShape.id;
		this.notify();
		return newShape;
	}

	moveShapeLayer(id: string, direction: 'up' | 'down'): void {
		this.pushUndo(true);
		const sorted = [...this.shapes].sort((a, b) => a.zIndex - b.zIndex);
		const idx = sorted.findIndex(s => s.id === id);
		if (idx === -1) return;

		const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
		if (swapIdx < 0 || swapIdx >= sorted.length) return;

		const tempZ = sorted[idx].zIndex;
		sorted[idx].zIndex = sorted[swapIdx].zIndex;
		sorted[swapIdx].zIndex = tempZ;
		this.notify();
	}

	// Timeline methods

	getKeyframes(shapeId: string): KeyframeData[] {
		return this.keyframes[shapeId] ?? [];
	}

	getAllKeyframes(): Record<string, KeyframeData[]> {
		return this.keyframes;
	}

	insertKeyframe(shapeId: string): KeyframeData | null {
		const shape = this.shapes.find(s => s.id === shapeId);
		if (!shape) return null;

		if (!this.keyframes[shapeId]) this.keyframes[shapeId] = [];

		// Remove existing keyframe at same time
		this.keyframes[shapeId] = this.keyframes[shapeId].filter(
			k => Math.abs(k.time - this.timelineTime) > 50
		);

		const kf: KeyframeData = {
			id: crypto.randomUUID(),
			time: this.timelineTime,
			shapeState: {
				points: structuredClone(shape.points),
				position: { ...shape.position },
				rotation: shape.rotation,
				size: { ...shape.size },
				fps: shape.fps,
				loop: shape.loop,
				playing: shape.playing,
				ignoreGlobalPlayPause: shape.ignoreGlobalPlayPause,
				bpmSync: shape.bpmSync,
				effects: { ...shape.effects },
			},
			morphToNext: true,
			easingType: 'linear',
			holdTime: 0,
			transitionEffect: 'none',
		};

		this.keyframes[shapeId].push(kf);
		this.keyframes[shapeId].sort((a, b) => a.time - b.time);
		this.notify();
		return kf;
	}

	moveKeyframe(shapeId: string, keyframeId: string, newTime: number): void {
		const kfs = this.keyframes[shapeId];
		if (!kfs) return;
		const kf = kfs.find(k => k.id === keyframeId);
		if (!kf) return;
		kf.time = Math.max(0, Math.min(newTime, this.timelineDuration));
		kfs.sort((a, b) => a.time - b.time);
		this.notify();
	}

	updateKeyframe(shapeId: string, keyframeId: string, updates: Partial<Pick<KeyframeData, 'morphToNext' | 'easingType' | 'holdTime' | 'transitionEffect'>>): void {
		const kfs = this.keyframes[shapeId];
		if (!kfs) return;
		const kf = kfs.find(k => k.id === keyframeId);
		if (!kf) return;
		Object.assign(kf, updates);
		this.notify();
	}

	removeKeyframe(shapeId: string, keyframeId: string): void {
		if (!this.keyframes[shapeId]) return;
		this.keyframes[shapeId] = this.keyframes[shapeId].filter(k => k.id !== keyframeId);
		if (this.keyframes[shapeId].length === 0) delete this.keyframes[shapeId];
		this.notify();
	}

	setTimelineTime(time: number): void {
		this.timelineTime = Math.max(0, Math.min(time, this.timelineDuration));
		this.applyKeyframes();
		this.listeners.forEach(l => l());
		this.syncExternal();
	}

	playTimeline(): void {
		if (this.timelinePlaying) return;
		this.timelinePlaying = true;
		this.lastTickTime = performance.now();
		this.tickTimeline();
		this.notify();
	}

	pauseTimeline(): void {
		this.timelinePlaying = false;
		if (this.timelineRafId !== null) {
			cancelAnimationFrame(this.timelineRafId);
			this.timelineRafId = null;
		}
		this.notify();
	}

	stopTimeline(): void {
		this.pauseTimeline();
		this.timelineTime = 0;
		this.notify();
	}

	private tickTimeline(): void {
		if (!this.timelinePlaying) return;

		const now = performance.now();
		const delta = now - this.lastTickTime;
		this.lastTickTime = now;

		this.timelineTime += delta;
		if (this.timelineTime >= this.timelineDuration) {
			this.timelineTime = 0; // loop
		}

		this.applyKeyframes();
		this.listeners.forEach(l => l());
		this.syncExternal();

		this.timelineRafId = requestAnimationFrame(() => this.tickTimeline());
	}

	private applyKeyframes(): void {
		for (const [shapeId, keyframes] of Object.entries(this.keyframes)) {
			if (keyframes.length === 0) continue;
			const shape = this.shapes.find(s => s.id === shapeId);
			if (!shape) continue;

			const t = this.timelineTime;

			// Find surrounding keyframes
			let prev: KeyframeData | null = null;
			let next: KeyframeData | null = null;

			for (let i = 0; i < keyframes.length; i++) {
				if (keyframes[i].time <= t) prev = keyframes[i];
				if (keyframes[i].time > t && !next) next = keyframes[i];
			}

			if (!prev && next) {
				// Before first keyframe — don't apply
				return;
			}

			if (prev && !next) {
				// After last keyframe — hold last state
				this.applyShapeState(shape, prev.shapeState);
				return;
			}

			if (prev && next) {
				if (!prev.morphToNext) {
					// No morph — hold prev state
					this.applyShapeState(shape, prev.shapeState);
				} else {
					// Interpolate
					const span = next.time - prev.time;
					const holdEnd = prev.time + prev.holdTime;
					if (t <= holdEnd) {
						this.applyShapeState(shape, prev.shapeState);
					} else {
						const transitionSpan = span - prev.holdTime;
						const progress = transitionSpan > 0 ? (t - holdEnd) / transitionSpan : 1;
						const eased = this.ease(Math.min(1, Math.max(0, progress)), prev.easingType);
						this.interpolateShape(shape, prev.shapeState, next.shapeState, eased);
						this.applyTransitionEffect(shape, prev.transitionEffect ?? 'none', eased);
					}
				}
			}
		}
	}

	private applyShapeState(shape: ShapeData, s: KeyframeData['shapeState']): void {
		shape.position = { ...s.position };
		shape.rotation = s.rotation;
		shape.size = { ...s.size };
		shape.points = structuredClone(s.points);
		shape.effects = { ...s.effects };
	}

	private interpolateShape(
		shape: ShapeData,
		a: KeyframeData['shapeState'],
		b: KeyframeData['shapeState'],
		t: number,
	): void {
		shape.position = {
			x: a.position.x + (b.position.x - a.position.x) * t,
			y: a.position.y + (b.position.y - a.position.y) * t,
		};
		shape.rotation = a.rotation + (b.rotation - a.rotation) * t;
		shape.size = {
			x: a.size.x + (b.size.x - a.size.x) * t,
			y: a.size.y + (b.size.y - a.size.y) * t,
		};

		// Interpolate points (only if same count)
		if (a.points.length === b.points.length) {
			shape.points = a.points.map((ap, i) => ({
				x: ap.x + (b.points[i].x - ap.x) * t,
				y: ap.y + (b.points[i].y - ap.y) * t,
			}));
		}

		// Interpolate effects
		shape.effects = {
			blur: a.effects.blur + (b.effects.blur - a.effects.blur) * t,
			glow: a.effects.glow + (b.effects.glow - a.effects.glow) * t,
			colorCorrection: a.effects.colorCorrection + (b.effects.colorCorrection - a.effects.colorCorrection) * t,
			distortion: a.effects.distortion + (b.effects.distortion - a.effects.distortion) * t,
			glitch: a.effects.glitch + (b.effects.glitch - a.effects.glitch) * t,
		};
	}

	private applyTransitionEffect(shape: ShapeData, effect: TransitionEffect, progress: number): void {
		if (effect === 'none') return;

		switch (effect) {
			case 'fade': {
				// Fade: shape fades out then back in at midpoint
				const fadeAmount = progress < 0.5
					? progress * 2 // 0 to 1 in first half
					: (1 - progress) * 2; // 1 to 0 in second half
				// We'll use this as a temporary opacity multiplier via effects
				shape.effects = {
					...shape.effects,
					blur: shape.effects.blur + fadeAmount * 20,
				};
				break;
			}
			case 'flash': {
				// Flash: brief white flash at the transition midpoint
				const flashIntensity = Math.max(0, 1 - Math.abs(progress - 0.5) * 4);
				shape.effects = {
					...shape.effects,
					glow: Math.max(shape.effects.glow, flashIntensity * 100),
				};
				break;
			}
			case 'dissolve': {
				// Dissolve: adds noise/glitch during transition
				const dissolveAmount = Math.sin(progress * Math.PI);
				shape.effects = {
					...shape.effects,
					glitch: Math.max(shape.effects.glitch, dissolveAmount * 60),
					distortion: Math.max(shape.effects.distortion, dissolveAmount * 30),
				};
				break;
			}
		}
	}

	private ease(t: number, type: KeyframeData['easingType']): number {
		switch (type) {
			case 'linear': return t;
			case 'ease-in': return t * t;
			case 'ease-out': return t * (2 - t);
			case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
		}
	}

	// Resource methods

	getResources(): ResourceData[] {
		return this.resources;
	}

	addResource(resource: Omit<ResourceData, 'id'>): ResourceData {
		const res: ResourceData = { ...resource, id: crypto.randomUUID() };
		this.resources.push(res);
		this.notify();
		return res;
	}

	updateResource(id: string, updates: Partial<ResourceData>): void {
		const idx = this.resources.findIndex(r => r.id === id);
		if (idx !== -1) {
			this.resources[idx] = { ...this.resources[idx], ...updates };
			this.notify();
		}
	}

	removeResource(id: string): void {
		this.resources = this.resources.filter(r => r.id !== id);
		// Clear resource from shapes that use it
		this.shapes.forEach(s => {
			if (s.resource === id) s.resource = null;
		});
		this.notify();
	}

	serialize(): string {
		const config: ProjectConfig = {
			version: 1,
			shapes: this.shapes,
			resources: this.resources,
			globalFps: this.globalFps,
			resolution: this.resolution,
			undoStack: this.undoStack,
			redoStack: this.redoStack,
			keyframes: this.keyframes,
			timelineDuration: this.timelineDuration,
			groups: Object.fromEntries(
				[...this.groups].map(([id, g]) => [id, { name: g.name, shapeIds: g.shapeIds, animation: g.animation }])
			),
		};
		return JSON.stringify(config, null, '\t');
	}

	loadFromJson(json: string): void {
		this.loadListeners.forEach(l => l());
		const config = JSON.parse(json) as ProjectConfig;
		this.shapes = config.shapes;
		this.resources = config.resources ?? [];
		this.globalFps = config.globalFps ?? 30;
		this.resolution = config.resolution ?? { x: 1920, y: 1080 };
		this.undoStack = config.undoStack ?? [];
		this.redoStack = config.redoStack ?? [];
		this.keyframes = config.keyframes ?? {};
		this.timelineDuration = config.timelineDuration ?? 300000;
		this.groups = new Map(Object.entries(config.groups ?? {}));
		this.selectedGroupId = null;
		this.timelineTime = 0;
		this.timelinePlaying = false;
		this.nextZIndex = this.shapes.reduce((max, s) => Math.max(max, s.zIndex + 1), 0);
		this.selectedShapeId = null;
		this.notify();
	}

	async save(): Promise<string | null> {
		return window.promap.saveConfig(this.serialize());
	}

	async load(): Promise<boolean> {
		const json = await window.promap.loadConfig();
		if (!json) return false;
		this.loadFromJson(json);
		return true;
	}

	scheduleAutoSave(): void {
		if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
		this.autoSaveTimer = setTimeout(() => {
			window.promap.autoSave(this.serialize());
		}, 5000);
	}

	private generatePoints(type: ShapeType, nPoints?: number): Point[] {
		const size = 300;
		const half = size / 2;

		switch (type) {
			case 'circle':
				return [];
			case 'triangle':
				return [
					{ x: half, y: 0 },
					{ x: size, y: size },
					{ x: 0, y: size },
				];
			case 'square':
				return [
					{ x: 0, y: 0 },
					{ x: size, y: 0 },
					{ x: size, y: size },
					{ x: 0, y: size },
				];
			case 'n-shape': {
				const n = nPoints ?? 5;
				const points: Point[] = [];
				for (let i = 0; i < n; i++) {
					const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
					points.push({
						x: half + half * Math.cos(angle),
						y: half + half * Math.sin(angle),
					});
				}
				return points;
			}
		}
	}
}

export const state = new StateManager();
