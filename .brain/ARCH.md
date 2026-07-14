# Architecture

## Current

- Next.js 16 App Router application.
- React 19 + TypeScript.
- Tailwind CSS 4 via PostCSS.
- Landing page at `/`; lounge at `/home` (`Lounge` + `HomeBackground` from ship scene, Coco from ship-2, space-themed `DialogueBox` on `canon/intro`); full dialogue play at `/go` (vanilla theme with header, stats, atmosphere).
- Dialogue UI lives in `src/app/components/dialogue/`: `DialogueHeader` (title + stats), `AtmosphereArt`, `DialogueBox` (text / choices / end), composed by `DialoguePanel`. Themes: `vanilla` (white / Playfair+Manrope) and `space` (black / Space Mono).
- Dialogue is data-driven JSON + a UI-independent `DialogueEngine` (`src/dialogue/`), rendered with React (not Phaser text, which blurred).
- Content lives under `src/content/`: `canon/` for shared framing dialogue (no voyage stats by default), `voyages/` for playable scenario graphs (opt into meters with `metadata.stats`), `art/` for atmosphere assets.
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
