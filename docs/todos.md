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
- [x] Audio / HDMI source selector — enumerates devices via mediaDevices API
- [x] Output resolution config — wired to state, canvas border updates live

## Resources Panel

- [x] File upload (video, image) via native file dialog
- [x] Media files copied to Electron userData/media/, served via `media://` protocol
- [x] Media library list with thumbnails and remove
- [x] Resource thumbnails (image preview, video first frame)
- [x] Drag & drop resource onto shape (auto-play on drop)
- [x] Text resource: full modal with font, size, bold/italic, color, background (transparent), stroke, opacity, alignment, padding, letter spacing, marquee (speed, direction, loop), live preview
- [x] Color resource: modal with solid, gradient (linear/radial, angle, stops), animated (keyframes, duration, easing, loop), live preview
- [x] Double-click text/color resources to edit (in-place update)

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
- [x] Video playback in shapes (ticker-based, play/pause/FPS control)
- [x] Text marquee animation (controlled by shape play state)
- [x] Animated color resources (ticker-based)
- [x] Ctrl+click multi-select (cyan stroke, drag moves all selected)
- [x] Shift+click grouping (includes previously selected, modal on Shift release)
- [x] Grid overlay (20px) + snap to grid (8px threshold)
- [x] Z-order / layering
- [x] Zoom: scroll wheel (0.1x–5x, towards cursor), +/− buttons
- [x] Pan: middle-mouse, Alt+drag, ✋ mode button
- [x] Reset view (R button), floating toolbar (+, −, R, ✋)
- [x] Ghost rendering for hidden shapes (faint outline, clickable)

## Right Panel (Tabbed: Shape / Groups)

- [x] Tabbed right panel with auto-switch on group/shape select
- [x] Shape tab: shape list with visibility toggles when nothing selected
- [x] Groups tab: group list when nothing selected

### Shape Options

- [x] Name, position, size (W→H/H→W), rotation slider, layer up/down, visibility toggle
- [x] Individual point positions (non-circle)
- [x] Resource assignment (dropdown + drag & drop + badge with clear)
- [x] Projector assignment (1-4, for multi-projector support)
- [x] Projection types: default (stretch), fit (aspect ratio), masked (visual positioning modal)
- [x] Mask positioning modal: full-screen, zoom/pan/scale controls, drag resource
- [x] Playback: play/pause, FPS slider, loop, ignore global play/pause
- [x] BPM sync toggle (UI)
- [x] Effects with PixiJS filters: blur, glow, color correction, distortion, glitch
- [x] Actions: duplicate, delete (Delete/Backspace key)

### Group Options

- [x] Group name, shape list (reorder, remove, add, visibility toggles, show/hide all)
- [x] Click shape name highlights on canvas (stays on groups tab)
- [x] Group-level controls: play/pause all, FPS, loop, resource, projection type
- [x] Group projection: masked (all shapes in modal), mapped (per-shape drag in modal)
- [x] Group-level effects
- [x] Sequence animation: series, random, from-middle (pairs) modes
- [x] Fade in/hold/fade out with configurable durations + easing
- [x] Loop + auto-play resource + BPM mode options
- [x] Groups persist in save/load

## Timeline

- [x] Blender-style UI with ruler, tracks, playhead
- [x] Resizable (200px–70vh, drag handle, toggle button)
- [x] Per-shape tracks with labels and visibility toggles (◆/◇)
- [x] Insert keyframe (position, rotation, size, points, effects)
- [x] Keyframes: yellow diamonds, draggable, right-click delete
- [x] Keyframe popover: morph toggle, easing, hold time, transition effect, delete
- [x] Transition effects: fade (blur), flash (glow), dissolve (glitch)
- [x] Draggable playhead, click ruler to seek
- [x] Play/pause/stop with looping
- [x] Morph interpolation with easing + hold time
- [x] Visual morph regions on tracks
- [x] Keyframes + timeline duration saved in config

## External Window

- [x] Separate Electron window(s) (frameless, black)
- [x] Multi-projector: multiple windows, each with projector ID
- [x] Shapes filtered by projector assignment
- [x] All resource types and projection types supported
- [x] Independent rendering — own ticker at 60fps
- [x] Group animations calculated locally
- [x] Persistent containers, scene rebuilt only on state changes
- [x] Toggle outline / points / grid
- [x] Auto-close when main window closes

## Audio / DJ Sync

- [x] Audio analyzer: Web Audio API mic input, RMS level detection
- [x] BPM mode: audio level drives group animation timing (accumulator-based)
- [x] MIDI sync module: device enumeration, note/CC/clock handling
- [x] MIDI BPM detection from clock (24 PPQ)
- [x] MIDI beat callbacks for advancing group animations

## Persistence

- [x] Manual save/load via native file dialogs
- [x] Auto-save to separate file (5s debounce, Electron userData)
- [x] Media files persisted via `media://` protocol
- [x] Undo/redo history, keyframes, groups, animation config all saved

## Remaining

- [ ] Beat detection from audio analysis (analyze for beat patterns)
- [ ] MIDI device selector in UI
- [ ] BPM mode threshold/sensitivity tuning UI
- [ ] Per-shape BPM sync (individual shapes, not just groups)
