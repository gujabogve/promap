use serde::Deserialize;
use std::collections::HashMap;

// IPC message envelope
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum IpcMessage {
	StateUpdate { state: ExternalState },
	Shutdown,
}

// Top-level state sent from Electron
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalState {
	pub shapes: Vec<ShapeData>,
	pub resources: Vec<ResourceData>,
	pub show_outline: bool,
	pub show_points: bool,
	pub show_grid: bool,
	pub projector_display: Option<HashMap<String, ProjectorDisplaySettings>>,
	pub groups: HashMap<String, GroupState>,
	pub audio_level: Option<f64>,
	pub audio_above_threshold: Option<bool>,
	pub midi_bpm: Option<f64>,
	pub midi_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectorDisplaySettings {
	pub show_outline: bool,
	pub show_points: bool,
	pub show_grid: bool,
	pub show_face: bool,
}

// Shape definition
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeData {
	pub id: String,
	pub name: String,
	#[serde(rename = "type")]
	pub shape_type: ShapeType,
	pub points: Vec<Point>,
	pub position: Point,
	pub rotation: f64,
	pub size: Point,
	pub z_index: i32,
	pub resource: Option<String>,
	pub resource_offset: Point,
	pub resource_scale: f64,
	pub projector: i32,
	pub projection_type: ProjectionType,
	pub fps: f64,
	#[serde(rename = "loop")]
	pub loop_playback: bool,
	pub playing: bool,
	pub ignore_global_play_pause: bool,
	pub bpm_sync: bool,
	pub midi_sync: bool,
	pub effects: ShapeEffects,
	pub visible: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ShapeType {
	Circle,
	Triangle,
	Square,
	NShape,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectionType {
	Default,
	Fit,
	Masked,
	Mapped,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Point {
	pub x: f64,
	pub y: f64,
}

#[derive(Debug, Deserialize)]
pub struct ShapeEffects {
	pub blur: f64,
	pub glow: f64,
	#[serde(rename = "colorCorrection")]
	pub color_correction: f64,
	pub distortion: f64,
	pub glitch: f64,
	pub pixelate: f64,
	#[serde(rename = "rgbSplit")]
	pub rgb_split: f64,
	pub invert: f64,
	pub sepia: f64,
	pub noise: f64,
	pub wave: f64,
	pub vignette: f64,
}

// Resource definition
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceData {
	pub id: String,
	pub name: String,
	#[serde(rename = "type")]
	pub resource_type: ResourceType,
	pub src: String,
	/// Absolute file path, pre-resolved by Electron from media:// URLs
	pub resolved_src: Option<String>,
	pub thumbnail: Option<String>,
	pub text_options: Option<TextOptions>,
	pub color_options: Option<ColorOptions>,
	pub stl_options: Option<StlOptions>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResourceType {
	Video,
	Image,
	Text,
	Color,
	Stl,
}

// Text resource options
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextOptions {
	pub text: String,
	pub font_family: String,
	pub font_size: f64,
	pub bold: bool,
	pub italic: bool,
	pub color: String,
	pub background_color: String,
	pub opacity: f64,
	pub stroke_color: String,
	pub stroke_width: f64,
	pub alignment: TextAlign,
	pub padding: f64,
	pub letter_spacing: f64,
	pub marquee: bool,
	pub marquee_speed: f64,
	pub marquee_direction: MarqueeDirection,
	pub marquee_loop: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TextAlign {
	Left,
	Center,
	Right,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MarqueeDirection {
	Left,
	Right,
	Up,
	Down,
}

// Color resource options
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorOptions {
	pub mode: ColorMode,
	pub color: String,
	pub gradient_type: GradientType,
	pub gradient_angle: f64,
	pub gradient_stops: Vec<ColorStop>,
	pub animated_keyframes: Vec<ColorKeyframe>,
	pub animated_duration: f64,
	pub animated_loop: bool,
	pub animated_easing: EasingType,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ColorMode {
	Solid,
	Gradient,
	Animated,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GradientType {
	Linear,
	Radial,
}

#[derive(Debug, Deserialize)]
pub struct ColorStop {
	pub position: f64,
	pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct ColorKeyframe {
	pub time: f64,
	pub color: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EasingType {
	Linear,
	EaseIn,
	EaseOut,
	EaseInOut,
}

// STL resource options
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StlOptions {
	pub rotation_speed: f64,
}

// Group animation state
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupState {
	pub name: String,
	pub shape_ids: Vec<String>,
	pub animation: Option<GroupAnimationOptions>,
	pub animation_playing: Option<bool>,
	pub animation_start_time: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupAnimationOptions {
	pub mode: GroupAnimationMode,
	pub fade_duration: f64,
	pub hold_duration: f64,
	#[serde(rename = "loop")]
	pub loop_animation: bool,
	pub auto_play_resource: bool,
	pub easing: EasingType,
	pub use_bpm: bool,
	pub use_midi: bool,
	pub bpm_speed: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GroupAnimationMode {
	None,
	Series,
	Random,
	FromMiddle,
}

// Outgoing messages from Rust → Electron
#[derive(Debug, serde::Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum OutgoingMessage {
	Ready,
	Error { message: String },
}
