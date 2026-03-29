# TODOs

## Project Setup

- [x] Initialize Electron + Vite + TypeScript project
- [x] Configure Tailwind
- [x] Set up PixiJS
- [x] Define project structure and base Web Components

## Global Controls

- [x] Save / Load config (JSON, native file dialogs, Ctrl+S / Ctrl+O)
- [x] Play / Pause all (Space key, respects ignoreGlobalPlayPause, toggles group animations)
- [x] Global FPS slider
- [x] Add shape dropdown (circle, triangle, square, N-shape) + Add button
- [x] Resolution preset dropdown (1920×1080, 1280×720, 3840×2160, 1024×768, 800×600, Custom)
- [x] Displays button — projector management modal
- [x] Audio / HDMI source selector (device enumeration via mediaDevices API)
- [x] Canvas grid toggle + snap toggle
- [x] Keyboard shortcuts cheat sheet modal (⌨ button, ? key, Escape to close)
- [x] Undo / Redo (snapshot-based, debounced, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)

## Resources Panel (resizable)

- [x] File upload (video, image) via native file dialog
- [x] Media files copied to Electron userData/media/, served via `media://` protocol
- [x] Media library list with thumbnails and remove
- [x] Drag & drop resource onto shape (auto-play on drop)
- [x] Text resource: full modal with all text options, live preview, double-click to edit
- [x] Color resource: solid, gradient, animated with keyframes, live preview, double-click to edit
- [x] Audio meter: mic toggle, dB display, level bar with threshold marker, frequency bars
- [x] Threshold slider (1-50%) for BPM sensitivity
- [x] MIDI section: device selector, connect button, beat dots, note bars, BPM display
- [x] MIDI test player with preset patterns (Techno, House, DnB, Ambient)

## Canvas

- [x] PixiJS canvas with WebGL rendering
- [x] Output area border (blue rectangle matching resolution)
- [x] All shape types with drag, points, rotation, resize
- [x] Proportional resize (Alt+drag)
- [x] Resource rendering with async texture loading, video playback, text marquee, animated colors
- [x] Ctrl+click multi-select, Shift+click grouping
- [x] Grid overlay + snap to grid
- [x] Z-order layering (normalized, single-press swap)
- [x] Zoom, pan, reset view, floating toolbar
- [x] Ghost rendering for hidden shapes

## Right Panel (tabbed, resizable)

### Shape Options
- [x] Group membership banner with navigation links
- [x] All shape properties: name, visibility, position, size (W→H/H→W), rotation, layer, points
- [x] Resource assignment with badge, projector assignment (1-4)
- [x] Projection types: default, fit, masked (with visual positioning modal)
- [x] Playback controls, BPM sync toggle
- [x] Effects with PixiJS filters

### Group Options
- [x] Shape list with visibility toggles, reorder, add/remove
- [x] Group-level controls: playback, resource, projection, effects
- [x] Group projection: masked (all shapes in modal), mapped (per-shape drag)
- [x] Sequence animation: series, random, from-middle (pairs)
- [x] BPM mode with speed slider + easing
- [x] Groups persist in save/load

## Timeline

- [x] Blender-style UI, resizable (200px-70vh), title click to toggle
- [x] Per-shape tracks with visibility toggles
- [x] Keyframes: insert, drag, delete, popover (morph, easing, hold, transition effect)
- [x] Transition effects: fade, flash, dissolve
- [x] Playback with morph interpolation and easing

## External Window / Projectors

- [x] Multi-projector: Displays modal with browser-style tabs
- [x] Per-projector display options (outline, points, grid, face)
- [x] Shape assignment and quick assign
- [x] Independent rendering at 60fps with local animation calculation
- [x] All resource types, projection types, rotation, visibility
- [x] Persistent containers, scene rebuilt only on state changes

## Audio / DJ Sync

- [x] AudioAnalyzer: Web Audio API mic input, RMS level detection, threshold
- [x] BPM mode: accumulator-based timing, speed slider, threshold tuning
- [x] MidiSync: device enumeration, connect/disconnect, note/CC/clock handling
- [x] MIDI BPM detection (24 PPQ), beat callbacks advancing group animations
- [x] MIDI test player with preset patterns
- [x] Visual feedback: level bars, frequency spectrum, beat dots, note bars

## Persistence

- [x] Manual save/load via native file dialogs
- [x] Auto-save (5s debounce, Electron userData)
- [x] Media files via `media://` protocol
- [x] Full state: undo/redo, keyframes, groups, animation config

## MIDI Cues

- [x] Cues tab in left sidebar (amber pill)
- [x] Add/remove/edit cues with name, MIDI note, start/end time
- [x] MIDI learn mode (click badge, press key to assign)
- [x] Duplicate MIDI key prevention
- [x] Cue triggering via MIDI (loop timeline segment)
- [x] Toggle (same key stops, different key switches)
- [x] Start/End time buttons (grab from timeline position)
- [x] Active cue highlighting
- [x] Cues persist in save/load

## Camera / OBS Feed

- [x] Camera resource type with getUserMedia capture
- [x] Video device enumeration and picker UI
- [x] OBS Virtual Camera support (any video input device)
- [x] Live feed rendering inside shapes with masking
- [x] Stream cleanup on resource removal
- [x] Works on both canvas editor and external projectors

## STL 3D Models

- [x] Binary and ASCII STL file parsing
- [x] THREE.js rendering to PixiJS canvas texture
- [x] Rotation speed control per shape
- [x] Auto-centered geometry with lighting

## Pixabay Integration

- [x] Video and vector/image search via Pixabay API
- [x] Download with automatic quality selection
- [x] Local caching (localStorage)
- [x] Custom API key support
- [x] Download tab (purple pill) in left sidebar

## SVG Import

- [x] Parse SVG paths, polygons, polylines, rects, circles, ellipses
- [x] Normalize to shape size, simplify to max 64 points
- [x] "Add SVG Shape" button in resources panel

## Pro DJ Link

- [x] UDP listener on ports 50000 (announce) and 50002 (status)
- [x] Pioneer CDJ/DJM device detection and status parsing
- [x] BPM, beat position, play/stop, master, pitch tracking
- [x] Beat callbacks for animation advancement
- [x] DJ Link tab (orange pill) in left sidebar

## Timecode

- [x] MIDI Timecode (MTC) receive via quarter-frame messages
- [x] Internal timecode generation (HH:MM:SS:FF)
- [x] Frame rate support (24, 25, 29.97, 30fps)
- [x] Offset adjustment (ms)
- [x] Locked/unlocked sync status

## Native GPU Renderer

- [x] Rust + wgpu native binary for projector output
- [x] FFmpeg video decode with hardware acceleration
- [x] Stencil-based shape masking, all 4 projection types
- [x] Docker cross-compilation for Windows
- [x] Toggle in Displays tab, automatic Electron fallback

## Remaining

- [x] Beat detection from audio analysis
- [x] Per-shape BPM sync (individual shapes, not just groups)

## Recording / Export

- [x] Record projector output to WebM video via MediaRecorder API
- [x] Per-projector record/stop button in Displays tab
- [x] Canvas captureStream at 60fps with VP9 codec
- [x] Save dialog on stop with file picker

## Project System

- [x] Project-based save/load (folder per project in userData)
- [x] Project screen on startup (new, recent, import)
- [x] Auto-save to project directory (no dialog)
- [x] Export project as .promap compressed archive
- [x] Import .promap archive as new project
- [x] Recent projects list (last 5)
- [x] Close project returns to project screen
- [x] Per-project media isolation

## Future

- [ ] SMPTE/LTC timecode (audio signal decode)
- [x] ~~OBS feed integration as live video source~~ (camera resource type)
- [x] ~~Record / export projector output to video file~~ (WebM recording)
