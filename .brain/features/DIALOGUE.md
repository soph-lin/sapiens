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
of `{ key, value }` entries. `src/lib/orchestrator/agent/writer.ts` normalizes both back to the runtime
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
7. `src/lib/orchestrator/agent/writer.ts` — only when the Writer's top-level output contract changes; dialogue node changes normally flow through the imported schema automatically.
8. `src/lib/content/canon/` and `src/lib/content/voyages/` — existing story fixtures that use the changed shape.
9. Dialogue UI consumers under `src/app/components/dialogue/` and feature consumers under
   `src/app/components/fieldnotes/` — when presentation fields or runtime views change.

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

## Shared dialogue UI

`DialoguePanel` / `DialogueBox` render story and companion choice lists. Beyond fixed
choice labels, the UI supports two custom option types used by `/home` actors and
voyage Coco (`/sail`):

- `editableChoice` — free-text option. Empty `label` shows only the input; set
  `placeholder` for the blank prompt (Coco: `Type in your question here`).
- `dropdownChoice` — expands into a select of fixed values.
- `richText` — when true (Coco), dialogue body renders inline markdown (`**bold**`,
  `*italic*` / `_italic_`). HTML-like tags stay literal text and are never executed.
  Typewriter reveals plain letters only: emphasis styles apply as characters appear;
  markdown markers are never shown while typing.

Choice lists accept digit quick-keys `1`–`9` (and numpad) matching the visible
option numbers: press `1` to run the first fixed choice. Free-text / dropdown
slots focus on their digit instead of auto-submitting. Digits are ignored while
typing in an input/select, and when `keyboardEnabled` is false (e.g. story under
an open Coco overlay). When only one option is present, the left-side index
labels are hidden (quick-keys still work).

Voyage Coco (`/sail`): Escape always closes the overlay. Closing (Escape, M, or
the X control) resets to the greeting so a mid-answer dismiss never reopens with
the generated reply plus choice options. Options still appear only after the
player advances through the full answer (including the follow-up line).

`/home` NPC chat and voyage Coco both pass these through the same panel so free-text
and dropdown behavior stay consistent. Coco enables `richText` on that shared panel.
