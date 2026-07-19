# Steer

Turn a historical topic into a replayable, playable voyage.

## Pipeline

`curator (optional) → researcher → director → writer → artist`

Core story building pipeline

- Curator (optional) curates a structured idea for a voyage from user prompt.
- Researcher gathers source-backed context from Wikipedia.
- Director sets the bounded story shape and applies steering direction.
- Writer produces validated dialogue and identifies needed assets.
- Artist reuses existing assets or generates missing character/collectible art using PixelLab API.

Bonus task: choosing star character

- Director selects the most important real named person as
  `starCharacter`, or `null` when no suitable named person has a verified English Wikipedia
  biography page. A selected star must include the canonical fetched page URL in
  `wikipediaUrl`; a name appearing in the event article alone is not sufficient.
- Writer carries that brief through.
- Artist reuses or creates an optional top-down sprite for the person.
- The star character is used in `/home` where the player can interact with historical people from stories they have completed.

The shared execution context carries limits, progress, retries, and usage.

## Important files

Config for model types and limits: [src/lib/orchestrator/config.ts](../../src/lib/orchestrator/config.ts)

Prompts for agents: [src/lib/prompts](../../src/lib/prompts)

Definitions for clients: [src/lib/providers](../../src/lib/providers)

## Runs

- `/steer` streams individual agents or the full pipeline.
- `StoryGenRun` stores the raw free-text `steering` request, the cleaned Researcher
  `topic`, Curator output, config, per-agent outputs, progress, usage, and status for
  replay and inspection. Runs are listed at `/voyages` and displayed
  in the steer console at `/steer/:slug`.
- Successful runs can be finalized as playable voyages.

## Agent i/o

### Curator

Optional entry agent. Accepts a free-text request, extracts any genre, location, and
period, and returns one sourceable idea for Researcher.

**Input**

```text
an innovative story about Europe in the Middle Ages
```

**Output**

```json
{
  "genre": "innovative",
  "location": "Europe",
  "period": "the Middle Ages",
  "idea": {
    "name": "Short evocative title",
    "historicalEvent": "Canonical historical event or subject",
    "era": "Concrete historical era or date range for the selected event",
    "region": "Place or geographic setting",
    "whyItFits": "Why it matches the request",
    "plotDirection": "Cleaned story direction preserving explicit user constraints",
    "sourceSearchTerms": "Terms for Researcher"
  },
  "voyage": {
    "title": "Optional voyage title or null",
    "topic": "Optional historical topic or null",
    "period": "Optional period or null",
    "scene": "Optional scene prompt or null",
    "lessonPlan": "Optional investigation prompt or null"
  }
}
```

`voyage` may be `null` when classroom-facing metadata is not useful. The Researcher
remains responsible for source gathering and classroom source-policy enforcement.

Researcher receives `idea.historicalEvent` for context, `idea.plotDirection` for downstream
story scope, and `idea.sourceSearchTerms` as the authoritative focused search input. The
story pipeline also passes the lesson plan as an explicit learning-focus constraint to
Director. The full contract and genre definitions remain authoritative in
[CURATOR.md](../../src/lib/prompts/CURATOR.md).

### Researcher

**Input**

```json
{
  "historicalEvent": "canonical subject or topic with context",
  "sourceSearchTerms": "focused subject or exact Wikipedia title",
  "plotDirection": "cleaned story direction preserving explicit user constraints",
  "flourish": {
    "sourceMode": "free",
    "approvedDomains": ["en.wikipedia.org"],
    "furtherReading": false
  }
}
```

**Output**

```json
{
  "topic": "cleaned historical event or subject",
  "articleUrl": "https://en.wikipedia.org/wiki/...",
  "sources": [
    {
      "title": "...",
      "url": "https://...",
      "kind": "article",
      "keyPoints": ["..."]
    }
  ],
  "furtherReading": []
}
```

`topic` is the cleaned historical event or subject from the selected article. It must not
include gameplay framing. The URL is the canonical English
Wikipedia article selected for the Director.

### Director

**Input**

```json
{
  "research": {
    "topic": "cleaned historical event or subject",
    "articleUrl": "https://en.wikipedia.org/wiki/..."
  },
  "plotDirection": "cleaned story direction preserving explicit user constraints",
  "maxTurns": 10,
  "maxCharacters": 3
}
```

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
  "characters": [
    { "name": "...", "role": "...", "desc": "...", "ageRange": "adult" }
  ],
  "starCharacter": {
    "name": "...",
    "role": "...",
    "desc": "...",
    "wikipediaUrl": "https://en.wikipedia.org/wiki/..."
  },
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
  "report": {
    "reportText": "## What was Fact?\n...\n## What was Fiction?\n...",
    "sources": [],
    "furtherReading": []
  },
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

Existing character portraits are reused only by exact normalized name plus `ageRange`; a
different age range generates a separate portrait. Missing character portraits and the collectible
are generated. For a selected `starCharacter`, Artist first reuses an existing sprite by
character name. If none exists, it generates one with PixelLab's v3 character endpoint at
48px using highly detailed, low top-down, humanoid settings.
The default frame remains in the asset's existing `data` field; generated or reused
additional frames are stored as optional generic-keyed `AssetFrame` records and emitted
through asset events.
