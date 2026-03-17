export interface Point {
	x: number;
	y: number;
}

export interface ShapeEffects {
	blur: number;
	glow: number;
	colorCorrection: number;
	distortion: number;
	glitch: number;
	pixelate: number;
	rgbSplit: number;
	invert: number;
	sepia: number;
	noise: number;
	wave: number;
	vignette: number;
}

export type ShapeType = 'circle' | 'triangle' | 'square' | 'n-shape';

export type ResourceType = 'video' | 'image' | 'text' | 'color' | 'stl';

export type MarqueeDirection = 'left' | 'right' | 'up' | 'down';
export type TextAlign = 'left' | 'center' | 'right';

export interface TextOptions {
	text: string;
	fontFamily: string;
	fontSize: number;
	bold: boolean;
	italic: boolean;
	color: string;
	backgroundColor: string;
	opacity: number;
	strokeColor: string;
	strokeWidth: number;
	alignment: TextAlign;
	padding: number;
	letterSpacing: number;
	marquee: boolean;
	marqueeSpeed: number;
	marqueeDirection: MarqueeDirection;
	marqueeLoop: boolean;
}

export interface ResourceData {
	id: string;
	name: string;
	type: ResourceType;
	src: string;
	thumbnail?: string;
	textOptions?: TextOptions;
	colorOptions?: ColorOptions;
	stlOptions?: StlOptions;
}

export interface StlOptions {
	rotationSpeed: number;
}

export type ColorMode = 'solid' | 'gradient' | 'animated';
export type GradientType = 'linear' | 'radial';

export interface ColorStop {
	position: number;
	color: string;
}

export interface ColorKeyframe {
	time: number;
	color: string;
}

export interface ColorOptions {
	mode: ColorMode;
	color: string;
	gradientType: GradientType;
	gradientAngle: number;
	gradientStops: ColorStop[];
	animatedKeyframes: ColorKeyframe[];
	animatedDuration: number;
	animatedLoop: boolean;
	animatedEasing: EasingType;
}

export type GroupAnimationMode = 'none' | 'series' | 'random' | 'from-middle';

export interface GroupAnimationOptions {
	mode: GroupAnimationMode;
	fadeDuration: number;
	holdDuration: number;
	loop: boolean;
	autoPlayResource: boolean;
	easing: EasingType;
	useBpm: boolean;
	useMidi: boolean;
	bpmSpeed: number;
}

export type ProjectionType = 'default' | 'fit' | 'masked' | 'mapped';

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export type TransitionEffect = 'none' | 'fade' | 'flash' | 'dissolve';

export interface KeyframeData {
	id: string;
	time: number;
	shapeState: Omit<ShapeData, 'id' | 'name' | 'type' | 'zIndex' | 'projector' | 'projectionType'>;
	morphToNext: boolean;
	easingType: EasingType;
	holdTime: number;
	transitionEffect: TransitionEffect;
}

export type ShapeSnapshot = Omit<ShapeData, 'id' | 'name' | 'type' | 'zIndex' | 'projector' | 'projectionType'>;

export interface GroupKeyframeData {
	id: string;
	time: number;
	shapeStates: Record<string, ShapeSnapshot>; // shapeId -> state
	morphToNext: boolean;
	easingType: EasingType;
	holdTime: number;
	transitionEffect: TransitionEffect;
}

export interface ShapeData {
	id: string;
	name: string;
	type: ShapeType;
	points: Point[];
	position: Point;
	rotation: number;
	size: Point;
	zIndex: number;
	resource: string | null;
	resourceOffset: Point;
	resourceScale: number;
	projector: number;
	projectionType: ProjectionType;
	fps: number;
	loop: boolean;
	playing: boolean;
	ignoreGlobalPlayPause: boolean;
	bpmSync: boolean;
	midiSync: boolean;
	effects: ShapeEffects;
	visible: boolean;
}
