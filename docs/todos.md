# TODOs

## Project Setup

- [x] Initialize Electron + Vite + TypeScript project
- [x] Configure Tailwind
- [x] Set up PixiJS
- [x] Define project structure and base Web Components

## Global Controls

- [x] Save / Load config (JSON, native file dialogs, Ctrl+S / Ctrl+O)
- [x] Play / Pause all (Space key, respects ignoreGlobalPlayPause)
- [x] Global FPS slider
- [x] Add shape dropdown (circle, triangle, square, N-shape) + Add button
- [x] Show / Hide external window (button toggles, label updates)
- [x] External window toggles (outline, points, grid)
- [x] Canvas grid toggle + snap toggle
- [x] Keyboard shortcuts cheat sheet modal (⌨ button, ? key, Escape to close)
- [x] Undo / Redo (snapshot-based, debounced for drag, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)

## Resources Panel

- [x] File upload (video, image) via native file dialog
- [x] Media files copied to Electron userData/media/, served via `media://` protocol
- [x] Media library list with thumbnails and remove
- [x] Resource thumbnails (image preview, video first frame)
- [x] Drag & drop resource onto shape (auto-play on drop)
- [x] Text resource: full modal with font, size, bold/italic, color, background (transparent option), stroke, opacity, alignment, padding, letter spacing, marquee (speed, direction, loop), live preview
- [x] Color resource: modal with solid, gradient (linear/radial, angle, stops), animated (keyframes, duration, easing, loop), live preview
- [x] Double-click text/color resources to edit (in-place update, no re-assign needed)

## Canvas

- [x] PixiJS canvas with WebGL rendering
- [x] Output area border (blue rectangle matching resolution)
- [x] Add shapes at 300x300px default
- [x] Shape types: circle/ellipse, triangle, square, N-polygon (5-20 points)
- [x] Drag to move shapes, drag individual points
- [x] Visual rotation (container pivot around center)
- [x] Size controls: W/H with W→H / H→W buttons
- [x] Proportional resize (Alt+drag handle, all shapes)
- [x] Resource rendering inside shapes (sprite + mask, async texture loading)
- [x] Video playback in shapes (ticker-based frame updates, play/pause/FPS control)
- [x] Text marquee animation (controlled by shape play state)
- [x] Animated color resources (ticker-based)
- [x] Ctrl+click multi-select (cyan stroke, drag moves all selected)
- [x] Shift+click grouping (includes previously selected shape, modal on Shift release)
- [x] Grid overlay (20px) + snap to grid (8px threshold)
- [x] Z-order / layering
- [x] Zoom: scroll wheel (0.1x–5x, towards cursor), +/− buttons
- [x] Pan: middle-mouse, Alt+drag, ✋ mode button
- [x] Reset view (R button)
- [x] Floating toolbar (+, −, R, ✋)

## Right Panel (Tabbed: Shape / Groups)

- [x] Tabbed right panel with auto-switch on group select
- [x] Shape tab: shape list when nothing selected, full options when selected
- [x] Groups tab: group list when nothing selected, group options when selected

### Shape Options

- [x] Name, position (X/Y), size (W/H + W→H/H→W), rotation slider, layer up/down
- [x] Individual point positions (non-circle)
- [x] Resource assignment (dropdown + drag & drop + badge with clear)
- [x] Projection types:
  - [x] Default (stretch to bounding box)
  - [x] Fit (aspect ratio, centered)
  - [x] Masked (natural size window, visual positioning modal with zoom/pan/scale)
- [x] Playback: play/pause, FPS slider, loop, ignore global play/pause
- [x] BPM sync toggle (UI done)
- [x] Effects with PixiJS filters: blur, glow, color correction, distortion, glitch
- [x] Actions: duplicate, delete (also Delete/Backspace key)

### Group Options

- [x] Group name, shape list (reorder ↑↓, remove ✕, add from dropdown)
- [x] Click shape name to select on canvas
- [x] Group-level controls: play/pause all, FPS, loop, resource, projection type
- [x] Group projection:
  - [x] Masked: shared resource, all shapes shown at real positions in modal, drag resource
  - [x] Mapped: shared resource, each shape independently draggable in modal, per-shape offsets
  - [x] Warning when switching if shapes have different resources, first shape's resource applied to all
- [x] Group-level effects (all sliders apply to all shapes)
- [x] Sequence animation: series, random, from-middle modes
- [x] Fade in/hold/fade out with configurable durations
- [x] Loop + auto-play resource options
- [x] Groups persist in save/load

## Timeline

- [x] Blender-style UI with ruler, tracks, playhead
- [x] Resizable (200px–70vh, drag handle, toggle button)
- [x] Per-shape tracks with labels (click to select)
- [x] Show/hide shapes (◆/◇ toggle per track, hidden shapes skip rendering)
- [x] Insert keyframe (saves position, rotation, size, points, effects)
- [x] Keyframes: yellow diamonds, draggable, right-click delete
- [x] Keyframe popover: morph toggle, easing (linear/ease-in/ease-out/ease-in-out), hold time, delete
- [x] Draggable playhead, click ruler to seek
- [x] Play/pause/stop with looping
- [x] Morph interpolation with easing + hold time
- [x] Visual morph regions on tracks
- [x] Keyframes + timeline duration saved in config

## External Window

- [x] Separate Electron window (frameless, black)
- [x] Renders all resource types (video, image, text, color) with masking
- [x] All projection types (default, fit, masked, mapped)
- [x] Independent rendering — own ticker at 60fps, no per-frame IPC
- [x] Group animations calculated locally from synced config
- [x] Scene rebuilt only on state changes, persistent containers for animation
- [x] Toggle outline / points / grid
- [x] Auto-close when main window closes

## Persistence

- [x] Manual save/load via native file dialogs
- [x] Auto-save to separate file (5s debounce, Electron userData)
- [x] Media files persisted via `media://` protocol
- [x] Undo/redo history, keyframes, groups all saved in config

## Pending

- [ ] Audio / HDMI source selector (UI done)
- [ ] Output resolution config (UI done)
- [ ] BPM mode — mic sound level detection (Web Audio API): threshold-based show/hide, sound level controls fade speed. Needs prototyping.
- [ ] Beat detection — analyze audio for beat patterns, advance sequence on beat
- [ ] Projector assignment / multi-projector (UI done)
- [ ] MIDI sync (Web MIDI API)
- [ ] Transition effects
