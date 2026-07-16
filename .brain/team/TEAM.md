# Team workflow

Use a team for complex features when the work spans product interpretation, UI, implementation, validation, and cleanup. The orchestrator decides whether a team is warranted and may run one designer plus multiple independent dev/eval/housekeeper tracks.

## Flow

1. **Orchestrator** reads this workflow, the relevant role briefs, and the core `.brain` docs before breaking the original request into bounded tasks and assigning roles. Every agent receives the original user request, relevant repo context, constraints, and its own task; agents do not pass a lossy summary down a telephone chain.
2. **Designer** defines the UI direction and interaction details before implementation.
3. **Dev** builds the assigned slice, including complete states, accessibility, error handling, and tests where appropriate.
4. **Eval** reviews that slice against the original request, checks edge cases and regressions, and visually inspects or screenshots the page when UI is involved.
5. **Housekeeper** combs the relevant large regions of the codebase—not just changed files—to remove duplicate code and logic, catch misplaced feature files, and check that the change fits existing architecture.
6. Repeat the dev → eval → housekeeper loop until the slice is complete and clean. Each dev owns its corresponding eval; independent slices may run in parallel.
7. **Orchestrator** synchronizes every affected core `.brain` doc, integrates the results, and produces a final report covering design, implemented features, validation, documentation updates, and why the architecture is clean. Agents should return these report inputs explicitly.

## Handoff rules

- Include acceptance criteria, affected files, dependencies, and verification expectations in every assignment.
- Preserve the user's exact intent and constraints in each agent's context.
- Discourage lazy development: no speculative placeholders, dead code, duplicated patterns, skipped states, or “works on the happy path” handoffs.
- Prefer existing components, utilities, data models, and conventions; document a necessary architecture change in the relevant `.brain` file.
