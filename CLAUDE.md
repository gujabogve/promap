# ProMap - Projection Mapping Tool

## Project Overview

Desktop projection mapping application. Users create shapes on a canvas, assign media resources to them, and output the result to a projector via an external window.

## Tech Stack

- **Runtime:** Electron
- **Build:** Vite
- **Language:** TypeScript (strict, no `any`)
- **Rendering:** PixiJS (WebGL)
- **CSS:** Tailwind
- **UI:** Vanilla Web Components (no framework)
- **Audio:** Web Audio API (BPM detection), Web MIDI API (DJ sync)
- **Config format:** JSON

## Code Conventions

- Semicolons always.
- Tabs for indentation.
- camelCase for variables/functions, PascalCase for classes/components.
- OOP preferred, functional where it fits.
- Minimal changes — don't refactor beyond the task.
- No new packages without asking.
- No comments/docstrings on untouched code.

## Project Structure

```
docs/           — design docs, ideas, todos
src/            — application source
```

## Dev Rules

- Don't start/stop dev servers unless asked.
- Don't commit/push unless asked.
- Don't write tests unless asked.
- Don't delete files without asking.
- Don't add dependencies without asking.
- Auto-save writes to a separate file — never overwrites manual saves.
- **Docs and code must stay in sync.** Every code change or addition must be reflected in the relevant docs (design.md, todos.md, ideas.md).
