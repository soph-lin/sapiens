# Sapiens

Educational exploration game: players learn by exploring interactive worlds, investigating evidence, and seeing systems respond.

## Project navigation

- `.brain/PRODUCT.md` — product vision, audience, and core experience.
- `.brain/ARCH.md` — current implementation and target architecture.
- `.brain/MAP.md` — floor/wall tile regions and map asset usage notes.
- `.brain/features/DIALOGUE.md` — dialogue data model and runtime requirements.
- `.brain/features/CURRENCY.md` — stardust currency and shop notes.
- `.brain/features/STEER.md` — story orchestration pipeline and replayable runs.
- `.brain/team/TEAM.md` — feature team workflow and role handoffs.
- `src/app/` — Next.js application code.

DO not read or edit `/bin` it is where the rejected ideas live...

## Dev

For every feature implementation, the orchestrator must read `.brain/team/TEAM.md` and the relevant role briefs before assigning work. The orchestrator must carry the original user request into every assignment and update the relevant role docs when broad user guidance reveals a missing rule.
Development rules live in `.brain/team/roles/DEV.md` and must be followed for implementation work.

## Documentation

Read relevant core `.brain` docs before product or architecture decisions. The orchestrator must update affected docs during implementation; if none change, note why in the final report. Add planning or product/architecture docs under `.brain/`, and update this navigation list when creating or renaming one. Keep docs concise without cramming distinct ideas into one paragraph: use clear headers and sections, and avoid duplication.
