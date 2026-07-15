# Steer

Turn a historical topic into a replayable, playable voyage.

## Pipeline

`researcher → director → writer → artist`

- Researcher gathers source-backed context from Wikipedia.
- Director sets the bounded story shape and applies steering direction.
- Writer produces validated dialogue and identifies needed assets.
- Artist reuses known assets or generates missing character/collectible art using PixelLab API.

The shared execution context carries limits, progress, retries, and usage.

## Important files

Config for model types and limits: [src/lib/orchestrator/config.ts](../../src/lib/orchestrator/config.ts)

Prompts for agents: [src/lib/prompts](../../src/lib/prompts)

Definitions for clients: [src/lib/providers](../../src/lib/providers)

## Runs

- `/steer` streams individual agents or the full pipeline.
- `StoryGenRun` stores steering, config, per-agent outputs, progress, usage, and
  status for replay and inspection at `/steer/voyages`.
- Successful runs can be finalized as playable voyages.

## Agent i/o

### Researcher

**Input**

```json
{
  "historicalEvent": "historical event or topic"
}
```

**Output**

```json
{
  "articleUrl": "https://en.wikipedia.org/wiki/..."
}
```

The URL is the canonical English Wikipedia article selected for the Director.

### Director

**Input**

```json
{
  "research": {
    "articleUrl": "https://en.wikipedia.org/wiki/..."
  },
  "maxTurns": 10,
  "maxCharacters": 3
}
```

Optional steering direction is supplied through the shared execution context.

**Output**

```json
{
  "maxTurns": 10,
  "maxCharacters": 3,
  "synopsis": {},
  "characters": [{ "name": "...", "role": "...", "desc": "..." }],
  "endings": [],
  "collectible": { "name": "...", "desc": "..." },
  "scenes": []
}
```

### Writer

**Input**

```json
{
  "director": {}
}
```

`director` is the Director output.

**Output**

```json
{
  "dialogue": {},
  "embellish": [{ "detail": "...", "purpose": "...", "affected": "..." }],
  "need_assets": {
    "characters": [{ "name": "...", "desc": "..." }],
    "collectible": { "name": "...", "desc": "..." }
  }
}
```

`dialogue` is the validated `Story` object defined in [DIALOGUE.md](DIALOGUE.md). The
orchestrator derives `need_assets.characters` from cast members that appear in
the dialogue and carries over the Director's collectible.

### Artist

**Input**

```json
{
  "characters": [{ "name": "...", "desc": "..." }],
  "collectible": { "name": "...", "desc": "..." }
}
```

**Output**

```json
{
  "assets": [
    { "type": "character", "name": "...", "asset": {} },
    { "type": "collectible", "name": "...", "asset": {} }
  ]
}
```

Known character assets are reused; missing character assets and the collectible
are generated. Generated or reused image data is also emitted through asset
events.
