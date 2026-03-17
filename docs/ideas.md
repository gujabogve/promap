# Ideas & Future Features

## Resources

- OBS feed integration as a live video source

## DJ / Audio Sync

- Pro DJ Link integration (Rekordbox/CDJ direct sync via network)
- Rekordbox, Serato, Traktor support via MIDI and/or Pro DJ Link

## Shapes

- Custom/complex shapes (e.g. car, logo outlines) — import SVG paths or freehand draw

## Output

- Record / export projector output to video file

## Timecode Synchronization

Timecode is a system used in professional audio, lighting, and video production to synchronize multiple devices with precise timing. It ensures that different systems — projection mapping, lighting consoles, LED screens, and audio playback — all run in perfect sync during live shows.

Timecode format: **HH:MM:SS:FF** (hours, minutes, seconds, frames). Allows events to be triggered at exact moments, down to the frame level.

### Supported Timecode Formats

- **SMPTE/LTC (Linear Timecode)** — transmitted as an audio signal, industry standard for professional AV sync
- **MIDI Timecode (MTC)** — transmitted via MIDI between digital systems

### Purpose in ProMap

Allow the software to synchronize 3D projection mapping visuals with external systems in real-time:

- **Receive** external timecode and follow it accurately
- **Generate** and send its own timecode (optional)
- **Trigger** visuals, animations, and cues based on a timeline linked to timecode
- **Frame-accurate** and stable during live performances

### Compatibility

Must be compatible with any professional lighting, audio, and video systems that support standard timecode formats, including but not limited to:
- Lighting consoles (GrandMA, Avolites, ETC, etc.)
- Media servers (Resolume, Disguise, etc.)
- DAWs (Ableton, Pro Tools, etc.)
- LED processors
- Any SMPTE/LTC or MTC-compatible device

### Key Features

- **Timeline with timecode display** — HH:MM:SS:FF format
- **Cue points** — animation triggers based on timecode positions
- **Transport controls** — play, pause, timeline navigation synced to timecode
- **Timecode source selection** — internal (ProMap generates) or external (follows incoming)
- **Offset adjustment** — compensate for latency between systems (ms or frames)
- **Sync status indicator** — visual locked/unlocked indicator showing whether ProMap is in sync with external timecode
- **Frame rate support** — 24fps, 25fps, 29.97fps (drop-frame), 30fps

### Implementation Notes

- SMPTE/LTC: decode audio signal from mic/line input, extract timecode. Use Web Audio API or native addon.
- MTC: receive via MIDI input (already have MIDI infrastructure). MTC uses quarter-frame messages for smooth tracking.
- Internal timecode: generate from ProMap's timeline, send via MIDI out or audio out.
- Design for professional live show environments: reliability, low latency, frame-accurate sync.
- Consider jitter handling and flywheel algorithm for stable external timecode following.
