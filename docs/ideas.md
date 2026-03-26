# Ideas & Future Features

## Resources

- ~~OBS feed integration as a live video source~~ — Implemented via camera resource type (captures any video input device including OBS Virtual Camera)

## Output

- Record / export projector output to video file

## Timecode Synchronization (partially implemented)

MTC (MIDI Timecode) and internal timecode generation are implemented. SMPTE/LTC audio decode remains as a future feature.

### Implemented

- MIDI Timecode (MTC) receive via quarter-frame messages
- Internal timecode generation (HH:MM:SS:FF format)
- Frame rate support: 24fps, 25fps, 29.97fps, 30fps
- Offset adjustment (ms)
- Sync status indicator (locked/unlocked)

### Remaining

- **SMPTE/LTC (Linear Timecode)** — decode timecode from audio signal (mic/line input). Complex: requires DSP-level audio processing or native addon.
- **Timecoded vinyl** — decode timecode audio signal from turntable output

### Compatibility Notes

Must be compatible with professional AV systems:
- Lighting consoles (GrandMA, Avolites, ETC)
- Media servers (Resolume, Disguise)
- DAWs (Ableton, Pro Tools)
- Any SMPTE/LTC or MTC-compatible device
