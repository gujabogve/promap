# Design

## Theme

Dark themed UI throughout. Dark neutral backgrounds with subtle borders and muted text. Custom thin scrollbars.

## UI Layout

```
+--------------------------------------------------+
| Controls (full width top bar)                     |
+----------+|+------------------------+|+-----------+
|          |||                        |||  Right    |
| Resources|||   Canvas               |||  Panel    |
| (left)   |||   (center)             ||| (tabbed)  |
|          |||                        |||           |
+----------+|+------------------------+|+-----------+
| Timeline (bottom, resizable)                      |
+--------------------------------------------------+

| = draggable resize handles (horizontal + vertical)
```

## Panels

### Global Controls (top bar, full width)

- Save / Load config (JSON files, native file dialogs, Ctrl+S / Ctrl+O)
- Audio / HDMI source selection dropdowns (auto-enumerate devices via mediaDevices API, refresh on focus + 10s timer)
- Play / Pause all (Space key, respects ignoreGlobalPlayPause, also toggles group animations)
- Global FPS slider
- Add shape: dropdown (circle, triangle, square, N-shape with point selector) + Add button
- Canvas grid toggle + snap toggle
- Resolution preset dropdown (1920×1080, 1280×720, 3840×2160, 1024×768, 800×600, Custom with W×H fields)
- Displays button — opens projector management modal (green with count when projectors open)
- Undo / Redo buttons (Ctrl+Z / Ctrl+Shift+Z)
- Keyboard shortcuts cheat sheet button (?)

### Resources (left panel, resizable 150-500px)

- Upload media via native file dialog (files copied to Electron userData/media/)
- Media served via custom `media://` protocol — persists across save/load
- Resource types:
  - **Video / Image** — uploaded via file dialog, thumbnails (image preview, video first frame)
  - **Text** — modal with: font, size, bold/italic, color, background (transparent option), stroke (color + width), opacity, alignment, padding, letter spacing, marquee (speed, direction left/right/up/down, loop), live preview. Double-click to edit.
  - **Color** — modal with three modes: solid (color picker), gradient (linear/radial, angle, multiple stops), animated (color keyframes at % positions, duration, easing, loop). Live preview with animation.
  - **STL 3D Models** — binary and ASCII STL file upload, rendered with THREE.js to PixiJS canvas texture, auto-centered geometry with lighting, configurable rotation speed per shape.
  - **SVG Shapes** — import SVG files to create custom polygon shapes. Parses paths, polygons, polylines, rects, circles, ellipses. Normalizes to shape size, simplifies to max 64 points.
  - **Camera / OBS** — live video input from webcam or OBS Virtual Camera. "+ Camera" button enumerates video devices, user selects from picker. Renders live feed inside shapes like any video resource. Stream cleanup on resource removal.
- Media library list with thumbnails, drag to assign to shapes
- Remove resources with X button
- Double-click text/color resources to edit
- **Audio section** (bottom of panel):
  - Mic toggle button (green when active)
  - dB level display
  - Level bar with threshold marker (red line)
  - Threshold slider (1-50%, red accent) — controls BPM animation sensitivity
  - Active dot (green above threshold, red below)
  - 32 frequency spectrum bars (color-coded green/yellow/red)
  - **MIDI section**:
    - Device selector dropdown + Connect/Disconnect button
    - Beat dots (4, pulse on quarter note)
    - Beat flash bar
    - 16 note activity bars with velocity decay
    - BPM display, last message display
    - Test button — opens MIDI test player modal
- **Download section** (purple pill tab):
  - Pixabay video and vector/image search
  - Download with automatic quality selection
  - Local caching (localStorage)
  - Custom API key support
- Future: OBS feed integration as a source
- **Cues section** (amber pill tab):
  - "+ Add" button to create new cues
  - Per-cue card with MIDI note badge, editable name, start/end times
  - MIDI learn: click badge to assign a MIDI key (listens for next note-on)
  - "S" / "E" buttons: set start/end to current timeline position
  - Pressing assigned MIDI key loops timeline between start and end times
  - Pressing same key again stops, pressing different cue key switches
  - Active cue highlighted with green border
  - Duplicate MIDI keys prevented

### Canvas (center, fills remaining space)

- Main editing area for shape drawing and positioning
- Output area border (blue rectangle matching resolution setting)
- Shapes added at 300x300px default size
- Shape types: circle (ellipse with W/H), triangle, square, N-sided polygon (5-20 points)
- Drag to move entire shape
- Drag individual points to reshape
- Rotate shapes (visual rotation via container pivot)
- Size controls: W/H for all shapes with W→H / H→W buttons
- Proportional resize: Alt+drag handle (works on all shapes)
- Resource player: assigned resources render inside shapes (sprite masked by shape geometry)
- Ctrl+click to multi-select (cyan stroke, drag moves all selected)
- Shift+click to select shapes for grouping (modal on Shift release to name/confirm, includes previously selected shape)
- Canvas grid overlay (20px, toggle in controls)
- Snap to grid (toggle in controls, 8px threshold)
- Zoom: scroll wheel (0.1x–5x, zooms towards cursor), +/− buttons
- Pan: middle-mouse drag, Alt+left-drag, or ✋ pan mode button
- Reset view: R button (1:1 zoom, origin)
- Floating toolbar: +, −, R, ✋ buttons in top-right corner
- Ghost rendering for hidden shapes (faint outline, clickable to select)

### Right Panel (tabbed: Shape / Groups, resizable 150-500px)

#### Shape Tab

- When nothing selected: list of all shapes with type icons (●▲■⬡) and visibility toggles (◆/◇), click to select
- When shape selected: full shape options (below)

#### Shape Options (visible when shape selected)

- Group membership banner (blue) — shows which group(s) the shape belongs to, clickable links to navigate to group. Info text about group overrides.
- Shape name (editable)
- Visibility toggle (◆ Visible / ◇ Hidden)
- Actions: Duplicate, Delete
- Position: X/Y inputs
- Size: W/H inputs with W→H / H→W buttons
- Rotation slider (0–360°)
- Z-order: Layer Up / Down buttons (normalized z-indices, single press = single layer change)
- Individual point positions (for non-circle shapes)
- Resource assignment: dropdown + drag & drop, blue badge shows assigned resource with clear button
- Projector assignment (1-4, for multi-projector support)
- Projection type:
  - **Default (stretch)** — resource stretched to fill shape bounding box
  - **Fit (aspect ratio)** — resource scaled to fit inside shape, maintains aspect ratio, centered
  - **Masked (window)** — resource at natural size, shape acts as window/cutout
    - "Position Resource" button opens visual modal
    - Modal: full-screen, shows resource + shape outline, drag resource behind shape
    - Modal controls: zoom (+/−/R), pan (✋), scale slider (10–500%), reset, apply/cancel
    - Resource scale saved per shape
- Playback: play/pause button, FPS slider (controls video playback rate)
- Loop toggle (default: looped)
- Block / ignore global play/pause
- BPM mode: mic-based sync toggle
- Video effects (all stacked, PixiJS filters, sliders default 0%):
  - Blur (BlurFilter)
  - Glow (blur + brightness)
  - Color correction (saturation + contrast via ColorMatrixFilter)
  - Distortion (chromatic aberration via color channel offset)
  - Glitch (random hue rotation per frame)

#### Groups Tab

- When nothing selected: list of all groups with shape count, click to select. Hint to Shift+click shapes to create.
- When group selected: group options with ← back button
- Group name (editable)
- Shape list: visibility toggles (◆/◇ per shape + show/hide all buttons), reorder (↑↓), remove from group (✕), add from dropdown
- Click shape name highlights on canvas (stays on groups tab)
- Group-level controls (apply to all shapes): play/pause all, FPS, loop, resource, projection type
- Group projection:
  - **Masked (group)** — all shapes share one resource, resource moves behind all shapes. Warning if shapes have different resources (skipped if same). First shape's resource applied to all on confirm. Visual positioning modal shows all shapes at actual canvas positions.
  - **Mapped (group)** — all shapes share one resource, each shape independently draggable in modal to pick its own area. Per-shape offsets saved individually. Resource stays fixed, shapes move (inverted drag). On canvas: shapes stay at positions, resource shifts per-shape.
- Group-level effects: blur, glow, color correction, distortion, glitch (applies to all shapes)
- Sequence animation:
  - Modes: In Order (series), Random, From Middle (pairs)
  - Configurable fade duration (ms) and hold duration (ms) — hidden when BPM mode active
  - Easing: linear, ease-in, ease-out, ease-in-out
  - Loop toggle
  - Auto-play resource toggle (starts/stops shape resource with animation)
  - BPM mode: "Use BPM (mic)" checkbox + speed slider (1x-20x)
  - Play/Stop button — shapes fade in/hold/fade out one at a time
  - From Middle: starts at center shape(s), expands outward to both ends as pairs
  - Hidden shapes skipped during animation
  - Global Play/Pause also controls group animations
- Delete group button (doesn't delete shapes, just the group)
- Groups persist in save/load

### Timeline (bottom panel, Blender-style)

- Resizable: drag handle at top edge (200px min, 70vh max)
- "▲ Timeline" title clickable to toggle between min and max height
- Per-shape timeline tracks with labels (click label to select shape)
- Show/hide shapes: ◆/◇ toggle per track
- "Insert Keyframe" button: saves full shape state (position, rotation, size, points, effects)
- Keyframes displayed as yellow diamonds, draggable to move, right-click to delete
- Click keyframe: popover with morph toggle, easing type, hold time (seconds), transition effect, delete
- Transition effects per keyframe: none, fade (blur), flash (glow), dissolve (glitch)
- Draggable playhead, click ruler to seek
- Play/pause/stop with looping, time display
- Morph interpolation between keyframes with configurable easing
- Hold time per keyframe (hold before transitioning)
- Visual morph regions (blue highlights) on tracks
- Keyframes + timeline duration saved in project config

### External Window / Projector Output

- **Displays modal** (browser-style tabs):
  - One tab per open projector, × to close, + to add new
  - Per-projector display options: outline, points, grid, face (white fill 20% opacity)
  - Assigned shapes list with type icons and visibility
  - Quick assign: dropdown to reassign shapes, "Assign all" bulk button
  - Close projector button
- Separate Electron windows (frameless, black background)
- Renders shapes + resources with masking
- All resource types supported (video, image, text, color)
- All projection types supported (default, fit, masked, mapped)
- Shape rotation, visibility
- Outline (2px, 70% opacity), points (6px radius, including center for circles), face fill
- **Independent rendering**: receives state once via IPC, runs own PixiJS ticker at 60fps
- Group animations calculated locally (no per-frame IPC sync)
- Scene only rebuilt on actual state changes, persistent containers for animation opacity
- Shapes filtered by projector assignment
- Multiple windows supported (each runs independently with own projector ID)
- Auto-closes when main window closes

### Native GPU Renderer (optional)

- Rust + wgpu native binary for projector output (replaces Electron BrowserWindow)
- Spawned by Electron via child process, communicates via stdin/stdout (length-prefixed JSON)
- FFmpeg hardware-accelerated video decode
- Stencil-based shape masking with all 4 projection types
- Toggle in Displays tab ("Native" switch), enabled by default
- Automatic fallback to Electron window on crash
- Docker cross-compilation for Windows (`build-win.sh`)
- Build artifacts in `native/promap-renderer/`

### MIDI Test Player (modal)

- BPM slider (60-200)
- Play/Stop clock (24 PPQ MIDI clock simulation)
- Beat dots (4/4 visual indicator)
- Beat counter
- Preset patterns: Techno (130), House (124), DnB (174), Ambient (80) — with Stop button
- Manual triggers: Beat, Note C4, CC #1
- Mini keyboard (C to C, 8 keys, mousedown/mouseup note on/off)
- Timestamped message log
- Clock keeps running in background when modal closed
- MIDI button turns green when clock active

## Config / Persistence

- All state saved as JSON
- Manual save: user-triggered, explicit file via native file dialog
- Auto-save: separate file in Electron userData (5s debounce), never overwrites manual save
- Load: restores full project state from JSON via native file dialog
- Media files: copied to Electron userData/media/ on upload, served via `media://` custom protocol, survives save/load
- Undo/redo history saved in config
- Keyframes, timeline duration, groups (with animation config) saved in config

## Interaction Summary

| Action | Modifier |
|---|---|
| Move shape | Drag shape |
| Move point | Drag individual point |
| Multi-select (no group) | Ctrl+click |
| Multi-select drag | Ctrl+click then drag any selected |
| Group shapes | Shift+click 2+, modal on Shift release |
| Proportional resize | Alt+drag handle |
| Delete shape | Delete / Backspace |
| Undo | Ctrl+Z |
| Redo | Ctrl+Shift+Z / Ctrl+Y |
| Save | Ctrl+S |
| Load | Ctrl+O |
| Play / Pause all | Space |
| Zoom canvas | Scroll wheel / +/− buttons |
| Pan canvas | Middle-mouse / Alt+drag / ✋ mode |
| Reset canvas view | R button |
| Resize panels | Drag border between panels |
| Toggle timeline size | Click "▲ Timeline" text |
| Shortcuts cheat sheet | ? |
| Close modal | Escape |

## Audio / DJ Sync

### BPM Mode (group sequence animation)

When "Use BPM" is enabled on a group sequence animation:

- **Mic input** via Web Audio API runs continuously in background
- **Sound level detection**: analyzes audio amplitude in real-time (RMS)
- **Below threshold** (quiet/muted): sequence stops, all group shapes hidden (opacity 0), holds current position
- **Above threshold** (sound detected): sequence resumes — shows next shape in sequence
- **Sound level controls speed**: louder = faster fade transitions, quieter = slower fades
- **Speed slider** (1x-20x): multiplier for sound level to animation speed mapping
- **Threshold slider**: configurable in audio section (1-50%)
- Sequence order (series/random/from-middle) still applies
- Easing still applies to fade curves
- Loop/auto-play resource options still work
- **Implementation**: AudioAnalyzer class with RMS level detection, accumulator-based timing

### MIDI Sync

- MidiSync class: `navigator.requestMIDIAccess()`, device enumeration
- **Device selector** in audio section: dropdown + connect/disconnect button
- Handles Note On/Off, Control Change, MIDI Clock, Start/Stop messages
- BPM detection from MIDI Clock (24 PPQ — 24 pulses per quarter note)
- Beat callbacks for advancing BPM-enabled group animations
- MIDI beat advances animation by one cycle (takes priority over mic when connected)
- Visual feedback: beat dots, note bars, BPM display, last message

### Beat Detection

- Bass frequency energy analysis (bottom 15% of spectrum)
- Rolling energy history (43 frames) for adaptive threshold
- Beat sensitivity slider (1-5x multiplier over average)
- 200ms cooldown between beats
- BPM calculation from beat intervals (40-240 BPM range)
- `onBeat()` callbacks advance group animations
- Priority: MIDI/Pro DJ Link > mic beat detection

### Pro DJ Link

- UDP listener on ports 50000 (announce) and 50002 (status)
- Pioneer CDJ/DJM device detection via network
- Status parsing: BPM, beat position (1-4), play/stop, master, pitch, track position
- Beat callbacks for animation advancement
- DJ Link tab (orange pill) in left sidebar with connect/disconnect and device list
- Per-shape sync: shapes with `midiSync` flag sync playback rate to CDJ BPM

### Timecode

- MIDI Timecode (MTC) receive via quarter-frame messages
- Internal timecode generation (HH:MM:SS:FF format)
- Frame rate support: 24fps, 25fps, 29.97fps, 30fps
- Offset adjustment (milliseconds)
- Locked/unlocked sync status indicator
- Future: SMPTE/LTC audio decode from mic/line input

### Transition Effects (timeline keyframes)

- Per-keyframe transition effect selector: none, fade, flash, dissolve
- **Fade**: adds blur during transition, peaks at midpoint
- **Flash**: brief glow burst at transition midpoint
- **Dissolve**: glitch + distortion during transition, sine curve intensity
- Effects are additive — applied on top of interpolated shape state

### Progressive sync implementation

1. **Mic-based sound level** — Web Audio API, amplitude analysis (implemented)
2. **MIDI sync** — Web MIDI API, device selection, clock/beat detection (implemented)
3. **Beat detection** — bass energy analysis, BPM calculation (implemented)
4. **Pro DJ Link** — Pioneer CDJ/DJM network integration (implemented)
5. **Timecode** — MTC receive + internal generation (implemented, SMPTE/LTC pending)
6. **Timecoded vinyl** — decode timecode audio signal (future, complex)
