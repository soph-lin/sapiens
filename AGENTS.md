# Sapiens

Educational exploration game: players learn by exploring interactive worlds, investigating evidence, and seeing systems respond.

## Project navigation

- `.brain/PRODUCT.md` — product vision, audience, and core experience.
- `.brain/ARCH.md` — current implementation and target architecture.
- `.brain/features/DIALOGUE.md` — dialogue data model and runtime requirements.
- `.brain/features/CURRENCY.md` — stardust currency and shop notes.
- `.brain/features/STEER.md` — story orchestration pipeline and replayable runs.
- `src/app/` — Next.js application code.

## Dev

- This project uses **pnpm**. Never run `npm` (or `npx`) commands — use `pnpm` instead.
- Never locally deploy the website; this will be controlled by user.
- When creating components, strive to use `export default function` for the main export. Add auxiliary `function` in the same file if absolutely necessary, but try separating into individual files if possible.

## Documentation

Read the relevant `.brain` docs before making product or architecture decisions. Create new planning or product/architecture documentation in `.brain/`; update the relevant `.brain` doc whenever those decisions, assumptions, or implementation direction change. When creating or renaming a brain doc, update this navigation list in the same change. Keep docs as short and concise as possible, and prevent duplicate information in the same file and across files.
