# Sapiens

Educational exploration game: players learn by exploring interactive worlds, investigating evidence, and seeing systems respond.

## Project navigation

- `.brain/PRODUCT.md` — product vision, audience, and core experience.
- `.brain/ARCH.md` — current implementation and target architecture.
- `.brain/MAP.md` — floor/wall tile regions and map asset usage notes.
- `.brain/features/DIALOGUE.md` — dialogue data model and runtime requirements.
- `.brain/features/CURRENCY.md` — stardust currency notes.
- `.brain/features/ITEMS.md` — furniture/small-item catalog, variants, editor placement.
- `.brain/features/STEER.md` — story orchestration pipeline and replayable runs.
- `.brain/features/FLOURISH.md` — source grounding, reports, classroom source policy, and learning-loop rules.
- `.brain/team/TEAM.md` — feature team workflow and role handoffs.
- `src/app/` — Next.js application code.

Do NOT read or edit `/bin` it is where the rejected ideas live...

## Dev

For every feature implementation, the orchestrator must read `.brain/team/TEAM.md` and the relevant role briefs before assigning work. The orchestrator must carry the original user request into every assignment and update the relevant role docs when broad user guidance reveals a missing rule.
Development rules live in `.brain/team/roles/DEV.md` and must be followed for implementation work.
When testing the UI, reuse the user's existing server whenever possible:

- First inspect `http://localhost:3000` with the browser or run a host-level health check such as `curl http://127.0.0.1:3000/` with the required permission. Do not use a sandboxed shell probe as the initial authority for a host-running server.
- If a sandboxed shell probe was attempted and reports connection-refused, `EPERM`, or a similar failure, treat it as inconclusive; retry the same read-only check with host-level permission before starting anything.
- If the host-level check returns a response, use the existing server at `localhost:3000`. Do not start a second Next.js process or switch to another port.
- Start a server only after the host-level check confirms that port 3000 is unavailable. Keep the server process alive for the duration of UI validation and use the browser to inspect the running page.

## Documentation

Read relevant core `.brain` docs before product or architecture decisions. The orchestrator must update affected docs during implementation; if none change, note why in the final report. Add planning or product/architecture docs under `.brain/`, and update this navigation list when creating or renaming one. Keep docs concise without cramming distinct ideas into one paragraph: use clear headers and sections, and avoid duplication.
