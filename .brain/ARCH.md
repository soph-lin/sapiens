# Architecture

## Current

- Next.js 16 App Router application.
- React 19 + TypeScript.
- Tailwind CSS 4 via PostCSS.
- Landing page at `/`; lounge at `/home` (Coco blob + Zzz); play session at `/go`.
- Dialogue is data-driven JSON + a UI-independent `DialogueEngine` (`src/dialogue/`), rendered with React on `/go` (not Phaser text, which blurred).
- Shared play snapshot lives in `src/game/state.ts` so React and a future Phaser world can read the same dialogue state.

## Target direction

Use a hybrid web architecture:

```text
Next.js/React UI
  ├─ dialogue, journal, sources, inventory, progression
  └─ Phaser 2D world
       ├─ movement, scenes, NPCs, interactions
       └─ map and simulation presentation

Shared scenario data → deterministic simulation engine → UI/world renderers
```

- Keep scenarios data-driven and independent of React or Phaser.
- Start text-first, then add visual-novel scenes and 2D exploration.
- Keep simulation rules deterministic; AI, if added, is a bounded presentation/helper layer.
- Store source, rights, and provenance metadata with content and assets.
- Use a PWA/web-first delivery model; consider native/3D only if the experience requires it.
