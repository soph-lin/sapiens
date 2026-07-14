# Dialogue

Implement a dialogue graph for short interactive stories.

## Goals

- Support ~6 turns per story.
- Keep branching shallow; choices modify state and usually rejoin the main flow.
- Render text, choices, consequences, and endings.
- Validate story data before runtime.

## JSON shape

Typescript types live in `src/dialogue/types.ts`. Story files look like:

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
      "effects": [
        { "variable": "evidence", "operation": "add", "value": 1 }
      ],
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

Optional on `choice` nodes: `next` — if every choice is hidden by failing conditions, the engine continues to that node (e.g. after exhausting a menu of one-shot options).

Custom boolean state uses `flags.<name>` (always available). Voyage meters require `metadata.stats`.

## Metadata

Optional top-level `metadata` object:

| Field | Meaning |
| --- | --- |
| `stats` | When `true`, track voyage meters (`reputation`, `evidence`, `safety`). Omit or `false` for framing / canon dialogue that only needs `flags`. |

Voyages that mutate those variables must set `"metadata": { "stats": true }`. Effects or conditions that reference `reputation` / `evidence` / `safety` without that opt-in fail at runtime.

## Runtime

1. Load and validate `{ start, nodes, metadata? }`.
2. Initialize state (`flags` always; meters only if `metadata.stats`).
3. Resolve the current node by ID.
4. Hide nodes/choices whose conditions fail.
5. Render text or choices.
6. On choice, apply effects and follow `next`.
7. Interpolate `{variable}` placeholders in text.
8. Stop at an `end` node; expose final state for the debrief (show meters UI only when stats are enabled).

Use JSON story files. Keep the parser/simulation engine independent from React UI.
