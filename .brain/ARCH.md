# Architecture

## Current

- Next.js 16 App Router application.
- React 19 + TypeScript.
- Tailwind CSS 4 via PostCSS.
- Landing page at `/`; lounge at `/home` (`Lounge` + `HomeBackground` from ship scene, Coco from ship-2, space-themed `DialogueBox` on `canon/intro`); full dialogue play at `/go` (vanilla theme with header, stats, atmosphere); tile preview at `/map`; map walkthrough at `/draw/view`; shared map home at `/home-2d` with wandering star-character NPCs.
- Dialogue UI lives in `src/app/components/dialogue/`: `DialogueBox` is the lowest-level presentational text/choice/end view; `DialoguePanel` renders that view with shared header, portrait, and atmosphere UI; `StoryDialogue` owns story sessions and companion placement. The sail-only `FieldCompanion`, `NotesEditor`, and Lexical `CalloutNode` live in the sibling `components/fieldnotes/` feature folder; the companion consumes the shared `DialoguePanel`. Themes: `vanilla` (white / Playfair+Manrope) and `space` (black / Space Mono).
- Dialogue is data-driven JSON + a UI-independent `DialogueEngine` (`src/dialogue/`), rendered with React (not Phaser text, which blurred).
- Content lives under `src/content/`: `canon/` for shared framing dialogue (no voyage stats by default), `voyages/` for playable scenario graphs (opt into meters with `metadata.stats`), `art/` for atmosphere assets.
- Shared play snapshot lives in `src/game/state.ts` so React and a future Phaser world can read the same dialogue state.
- Agent implementations live in `src/lib/orchestrator/`; the generation pipeline runs researcher → director → writer → artist. The Writer selects character assets actually needed by the dialogue, while the Director's collectible is passed through to Artist. Model-backed agents share execution context, retry failures up to `ORCHESTRATOR_CONFIG.maxTries` total attempts, and receive the prior failure in retry instructions.
- Coco is a separate `gpt-5.6-luna` Responses API agent under `src/lib/orchestrator/coco.ts`; its server route loads the Story's authoritative topic/synopsis and enables OpenAI's hosted `web_search` tool, returning safe source citations to the dialogue companion. The actor agent under `src/lib/orchestrator/actor.ts` uses `ACTOR.md` to give map NPCs historically grounded, in-character greetings and replies.
- Completed generation runs are stored in `StoryGenRun` with replay metadata, per-agent outputs, and progress logs. Runs are listed under `/steer/voyages` and displayed through the steer console at `/steer/:slug`; legacy rows without the new snapshots are hidden.
- Character portraits are reused by matching `Character` name, and shared portrait assets may be attached to multiple stories. Each Character may also have an optional `spriteAsset` linked to a reusable `CHARACTER_SPRITE` Asset; the star character uses this relation for its top-down sprite. A sprite asset keeps its default frame in `Asset.data` and may have any number of generic-keyed `AssetFrame` children for rotations or animations.
- The old map prototype and its sprite pack are archived under `bin/src/app/`, `bin/src/lib/map/`, `bin/src/lib/game/`, and `bin/public/Cute_Fantasy/`; active map tile notes live in `.brain/MAP.md`.

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

The map walkthrough renderer is shared by `/draw/view` and `/home-2d`. `/home-2d` is a thin route wrapper around `src/app/components/game/GameController.tsx`, which owns map loading, input, camera, collision, and NPC movement; `src/lib/game/useNpcDialogue.ts` owns the NPC conversation state and actor calls. It loads the published `myroom` map and star-character summaries from the voyage API; star NPCs use `PLAYER_SPRITE_SCALE` and the same one-tile collision footprint as the player. NPC conversations are rendered by `MapRenderer` with the shared `DialoguePanel`; all NPC prompts, including free-form questions, call the actor boundary with a stable `Character.id`. Story and other Coco surfaces use the generic `/api/coco/chat` boundary with prepared topic and dialogue context.
