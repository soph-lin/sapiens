# Dialogue

Implement a dialogue graph for short interactive stories.

## Goals

- Keep branching shallow; choices modify state and usually rejoin the main flow.
- Render text, choices, consequences, and endings.
- Validate story data before runtime.

## JSON shape

TypeScript types live in `src/lib/dialogue/types.ts`. Story files look like:

```json
{
  "metadata": {
    "stats": true
  },
  "start": "opening",
  "nodes": {
    "opening": {
      "type": "text",
      "id": "opening",
      "speaker": "Optional label",
      "text": "Beat copy. Interpolate {reputation} when stats are on.",
      "next": "fork"
    },
    "fork": {
      "type": "choice",
      "id": "fork",
      "prompt": "What do you do?",
      "choices": [
        {
          "label": "Lean in",
          "next": "lean",
          "effects": [
            { "variable": "reputation", "operation": "add", "value": 1 },
            { "variable": "flags.leaned_in", "operation": "set", "value": true }
          ]
        },
        {
          "label": "Hang back",
          "next": "back",
          "condition": {
            "variable": "safety",
            "operator": ">=",
            "value": 40
          }
        }
      ]
    },
    "apply": {
      "type": "set",
      "id": "apply",
      "effects": [{ "variable": "evidence", "operation": "add", "value": 1 }],
      "next": "closing"
    },
    "closing": {
      "type": "end",
      "id": "closing",
      "title": "Title",
      "text": "Debrief copy."
    }
  }
}
```

Node `type` values: `text` | `choice` | `set` | `end`.

The runtime contract is:

- `text`: required `type`, `id`, and non-empty `text`; optional non-empty `speaker`, `next`, and `condition`.
- `choice`: required `type`, `id`, and a non-empty `choices` array; optional non-empty `prompt`, `next`, and choice conditions/effects.
- `set`: required `type`, `id`, non-empty `effects`, and `next`.
- `end`: required `type`, `id`, non-empty `title`, and non-empty `text`.

Every node object must contain only fields for its node type. Optional string fields must be
omitted when unused; do not emit them as empty strings. Node map keys must match each node's
`id`, and all `start`/`next` references must resolve to existing node IDs.

Optional on `choice` nodes: `next` — if every choice is hidden by failing conditions, the engine continues to that node (e.g. after exhausting a menu of one-shot options).

Custom boolean state uses `flags.<name>` (always available). Any other referenced variable is a numeric stat and requires `metadata.stats`.

## Metadata

Optional top-level `metadata` object:

| Field          | Meaning                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stats`        | When `true`, track numeric variables referenced by the story in a dynamic stats map. Omit or `false` for framing / canon dialogue that only needs `flags`. |
| `statDefaults` | Optional numeric starting values keyed by dynamic stat name. Requires `stats: true`.                                                                       |

Stories that mutate numeric variables must set `"metadata": { "stats": true }`. Effects or conditions that reference numeric variables without that opt-in fail validation.

The writer's provider-facing JSON Schema lives in `src/lib/dialogue/json-schema.ts`. Anthropic's
structured-output subset requires `additionalProperties: false` on objects, so the provider
transport represents `nodes` as an array of node objects and `metadata.statDefaults` as an array
of `{ key, value }` entries. `src/lib/orchestrator/writer.ts` normalizes both back to the runtime
map/object shape before validation. `validateStory()` remains authoritative for rules that JSON
Schema does not express well, including node-key matching, `next` references, flag/stat value
compatibility, and the `metadata.stats` requirement.

## Schema change checklist

When changing the dialogue JSON shape, update and verify these dependencies together:

1. `src/lib/dialogue/types.ts` — canonical TypeScript node and story types.
2. `src/lib/dialogue/validate.ts` — runtime parsing, field validation, and cross-node invariants.
3. `src/lib/dialogue/json-schema.ts` — provider-facing schema used by the Writer's structured output.
4. `src/lib/dialogue/engine.ts` — state transitions and presentation for the changed node fields.
5. `src/lib/dialogue/index.ts` — public exports when types or runtime functions change.
6. `src/lib/prompts/WRITER.md` — JSON examples, field instructions, and authoring-archetype guidance.
7. `src/lib/orchestrator/writer.ts` — only when the Writer's top-level output contract changes; dialogue node changes normally flow through the imported schema automatically.
8. `src/lib/content/canon/` and `src/lib/content/voyages/` — existing story fixtures that use the changed shape.
9. Dialogue UI consumers under `src/app/components/dialogue/` and feature consumers under
   `src/app/components/fieldnotes/` — when presentation fields or runtime views change.

## UI boundary

`DialogueBox` only renders a prepared `Presentable` view. `DialoguePanel` adds shared
visual presentation such as the header, portrait, atmosphere, and box. Higher-level
wrappers own dialogue engines and providers: `StoryDialogue` owns story sessions,
the sail-only `components/fieldnotes/FieldCompanion` owns Coco and notes surfaces, and the map
NPC hook owns actor conversations.

After editing, run the type checker and linter, validate existing content through `validateStory`,
and inspect any affected dialogue UI paths. Keep `DIALOGUE.md` and `WRITER.md` synchronized with
the code contract.

## Runtime

1. Load and validate `{ start, nodes, metadata? }`.
2. Initialize state (`flags` always; dynamic numeric stats when `metadata.stats` is enabled).
3. Resolve the current node by ID.
4. Hide nodes/choices whose conditions fail.
5. Render text or choices.
6. On choice, apply effects and follow `next`.
7. Interpolate `{variable}` placeholders in text.
8. Stop at an `end` node; expose final state for the debrief (show dynamic stats UI only when stats are present).

Use JSON story files. Keep the parser/simulation engine independent from React UI.
