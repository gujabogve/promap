# Design

## Theme

Dark themed UI throughout. Dark neutral backgrounds with subtle borders and muted text. Custom thin scrollbars.

## UI Layout

```
+--------------------------------------------------+
| Controls (full width top bar)                     |
+----------------+---------------------+-----------+
|                |                     |  Right    |
| Resources      |   Canvas            |  Panel    |
| (left)         |   (center)          | (tabbed)  |
|                |                     |           |
+----------------+---------------------+-----------+
| Timeline (bottom, resizable, overlays bottom)     |
+--------------------------------------------------+
```

## Panels

### Global Controls (top bar, full width)

- Save / Load config (JSON files, native file dialogs, Ctrl+S / Ctrl+O)
- Audio / HDMI source selection dropdowns
- Play / Pause all (Space key, respects ignoreGlobalPlayPause)
- Global FPS slider
- Add shape: dropdown (circle, triangle, square, N-shape with point selector) + Add button
- Canvas grid toggle + snap toggle
- Show / Hide external projector window
- Toggle outline / points / grid on external window
- Output resolution config
- Undo / Redo buttons (Ctrl+Z / Ctrl+Shift+Z)
- Keyboard shortcuts cheat sheet button (?)

### Resources (left panel)

- Upload media via native file dialog (files copied to Electron userData/media/)
- Media served via custom `media://` protocol — persists across save/load
- Resource types:
  - **Video / Image** — uploaded via file dialog, thumbnails (image preview, video first frame)
  - **Text** — modal with: font, size, bold/italic, color, background (transparent option), stroke (color + width), opacity, alignment, padding, letter spacing, marquee (speed, direction left/right/up/down, loop), live preview. Double-click to edit.
  - **Color** — modal with three modes: solid (color picker), gradient (linear/radial, angle, multiple stops), animated (color keyframes at % positions, duration, easing, loop). Live preview with animation.
- Media library list with thumbnails, drag to assign to shapes
- Remove resources with X button
- Double-click text/color resources to edit
- Future: OBS feed integration as a source

### Canvas (center)

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

### Right Panel (tabbed: Shape / Groups)

#### Shape Tab

- When nothing selected: list of all shapes with type icons (●▲■⬡), click to select
- When shape selected: full shape options (below)

#### Shape Options (visible when shape selected)

- Shape name (editable)
- Actions: Duplicate, Delete
- Position: X/Y inputs
- Size: W/H inputs with W→H / H→W buttons
- Rotation slider (0–360°)
- Z-order: Layer Up / Down buttons
- Individual point positions (for non-circle shapes)
- Resource assignment: dropdown + drag & drop, blue badge shows assigned resource with clear button
- Projector assignment (multi-projector)
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
- Shape list: reorder (↑↓), remove from group (✕), add from dropdown
- Click shape name to select it on canvas
- Group-level controls (apply to all shapes): play/pause all, FPS, loop, resource, projection type
- Group projection:
  - **Masked (group)** — all shapes share one resource, resource moves behind all shapes. Warning if shapes have different resources. First shape's resource applied to all on confirm. Visual positioning modal shows all shapes at actual canvas positions.
  - **Mapped (group)** — all shapes share one resource, each shape independently draggable in modal to pick its own area. Per-shape offsets saved individually. Resource stays fixed, shapes move (inverted drag). On canvas: shapes stay at positions, resource shifts per-shape.
- Group-level effects: blur, glow, color correction, distortion, glitch (applies to all shapes)
- Sequence animation:
  - Modes: In Order (series), Random, From Middle
  - Configurable fade duration (ms) and hold duration (ms)
  - Loop toggle
  - Auto-play resource toggle (starts/stops shape resource with animation)
  - Play/Stop button — shapes fade in/hold/fade out one at a time
  - From Middle: starts at center shape, expands outward to both ends
- Delete group button (doesn't delete shapes, just the group)
- Groups persist in save/load

### Timeline (bottom panel, Blender-style)

- Resizable: drag handle at top edge (200px min, 70vh max), toggle button to snap between sizes
- Per-shape timeline tracks with labels (click label to select shape)
- Show/hide shapes: ◆/◇ toggle per track
- "Insert Keyframe" button: saves full shape state (position, rotation, size, points, effects)
- Keyframes displayed as yellow diamonds, draggable to move, right-click to delete
- Click keyframe: popover with morph toggle, easing type (linear/ease-in/ease-out/ease-in-out), hold time (seconds), delete
- Draggable playhead, click ruler to seek
- Play/pause/stop with looping, time display
- Morph interpolation between keyframes with configurable easing
- Hold time per keyframe (hold before transitioning)
- Visual morph regions (blue highlights) on tracks
- Keyframes + timeline duration saved in project config

### External Window (projector output)

- Separate Electron window (frameless, black background)
- Renders canvas content (shapes + resources with masking)
- All resource types supported (video, image, text, color)
- All projection types supported (default, fit, masked, mapped)
- Shape rotation, visibility
- Toggle outline / points / grid from main controls
- **Independent rendering**: receives state once via IPC, runs own PixiJS ticker at 60fps
- Group animations calculated locally (no per-frame IPC sync)
- Scene only rebuilt on actual state changes
- Designed for multiple external windows (each runs independently)
- Button toggles open/close, label updates
- Auto-closes when main window closes

## Config / Persistence

- All state saved as JSON
- Manual save: user-triggered, explicit file via native file dialog
- Auto-save: separate file in Electron userData (5s debounce), never overwrites manual save
- Load: restores full project state from JSON via native file dialog
- Media files: copied to Electron userData/media/ on upload, served via `media://` custom protocol, survives save/load
- Undo/redo history saved in config
- Keyframes, timeline duration, groups saved in config

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
| Shortcuts cheat sheet | ? |
| Close modal | Escape |

## Audio / DJ Sync

### BPM Mode (group sequence animation)

When "Use BPM" is enabled on a group sequence animation:

- **Mic input** via Web Audio API runs continuously in background
- **Sound level detection**: analyzes audio amplitude in real-time
- **Below threshold** (quiet/muted): sequence stops, all group shapes hidden (opacity 0), holds current position
- **Above threshold** (sound detected): sequence resumes — shows next shape in sequence
- **Sound level controls speed**: louder = faster fade transitions, quieter = slower fades
- Sequence order (series/random/from-middle) still applies
- Easing still applies to fade curves
- Loop/auto-play resource options still work
- **Needs prototyping** — sound level to speed mapping needs tuning

### Progressive sync implementation

1. **Mic-based sound level** — Web Audio API, amplitude analysis (first implementation for BPM mode)
2. **Beat detection** — analyze audio for beat patterns, advance on each beat
3. **MIDI sync** — Web MIDI API, works with Rekordbox, Serato, Traktor, any controller
4. **Pro DJ Link** — direct Rekordbox/CDJ integration via `prolink-connect` (Node.js, needs Electron)
5. **Timecoded vinyl** — decode timecode audio signal (future, complex)
