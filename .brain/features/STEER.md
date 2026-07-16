# Steer

Turn a historical topic into a replayable, playable voyage.

## Pipeline

`researcher → director → writer → artist`

Core story building pipeline

- Researcher gathers source-backed context from Wikipedia.
- Director sets the bounded story shape and applies steering direction.
- Writer produces validated dialogue and identifies needed assets.
- Artist reuses existing assets or generates missing character/collectible art using PixelLab API.

Bonus task: choosing star character

- Director selects the most important real named person as
  `starCharacter`, or `null` when the event has no real people.
- Writer carries that brief through
- Artist reuses or creates an optional top-down sprite for the person.
- The star character is used in `/home-2d` where the player can interact with historical people from stories they have completed.

The shared execution context carries limits, progress, retries, and usage.

## Important files

Config for model types and limits: [src/lib/orchestrator/config.ts](../../src/lib/orchestrator/config.ts)

Prompts for agents: [src/lib/prompts](../../src/lib/prompts)

Definitions for clients: [src/lib/providers](../../src/lib/providers)

## Runs

- `/steer` streams individual agents or the full pipeline.
- `StoryGenRun` stores steering, config, per-agent outputs, progress, usage, and
  status for replay and inspection. Runs are listed at `/steer/voyages` and displayed
  in the steer console at `/steer/:slug`.
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
  "topic": "cleaned historical event or subject",
  "articleUrl": "https://en.wikipedia.org/wiki/..."
}
```

`topic` is the cleaned historical event or subject from the selected article. It must not
include the user's synopsis direction or gameplay framing. The URL is the canonical English
Wikipedia article selected for the Director.

### Director

**Input**

```json
{
  "research": {
    "topic": "cleaned historical event or subject",
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
  "synopsis": {
    "premise": "...",
    "eventSpine": "...",
    "playerGoal": "...",
    "learningFocus": "..."
  },
  "characters": [{ "name": "...", "role": "...", "desc": "..." }],
  "starCharacter": { "name": "...", "role": "...", "desc": "..." },
  "endings": [],
  "collectible": { "name": "...", "desc": "..." },
  "scenes": []
}
```

`starCharacter` is the real named person the Director judges most important to the event;
it is not an invented protagonist or a replacement for the broader cast. The Director
returns `null` when no real person is suitable. `Story.topic` is saved from
`researcher.topic`, and `Story.synopsis` is saved from `director.synopsis`. Legacy stories
without a stored Director snapshot may have a null synopsis until they are regenerated.

The pipeline also exposes the complete Director synopsis object as its `synopsis` result;
the finalizer passes that object unchanged into `Story.synopsis`.

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
    "starCharacter": { "name": "...", "desc": "..." },
    "collectible": { "name": "...", "desc": "..." }
  }
}
```

`dialogue` is the validated `Story` object defined in [DIALOGUE.md](DIALOGUE.md). The
orchestrator derives `need_assets.characters` from cast members that appear in
the dialogue, includes the selected `starCharacter` when present so its Character record
can own the optional sprite, and carries over the Director's collectible.

### Artist

**Input**

```json
{
  "characters": [{ "name": "...", "desc": "..." }],
  "starCharacter": { "name": "...", "desc": "..." },
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

Existing character assets are reused by name; missing character portraits and the collectible
are generated. For a selected `starCharacter`, Artist first reuses an existing sprite by
character name. If none exists, it generates one with PixelLab's v3 character endpoint at
48px using highly detailed, low top-down, humanoid settings.
The default frame remains in the asset's existing `data` field; generated or reused
additional frames are stored as optional generic-keyed `AssetFrame` records and emitted
through asset events.
