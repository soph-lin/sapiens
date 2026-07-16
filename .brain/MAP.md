# Map Tiles

Floor and wall tile exports live in `public/assets/floorsandwalls/`. The numbered
files use the same one-based labels as the source sheet, so sheet label `1` is
`01.png`, sheet label `2` is `02.png`, and so on.

## Floors And Walls Regions

The source sheet is 18 columns wide and uses the visible 1-based labels from
the review image.

- Region 1: columns 1-5. Wall rows are labels 20-23 through 74-77; floor rows are
  labels 92-95 through 128-131.
- Region 2: columns 24-27. Use the same wall/floor y split as region 1.
- Region 3: columns 28-31. Use the same wall/floor y split as region 1.
- Region 4: columns 32-35. Use the same wall/floor y split as region 1.

## Repeat Rules

The atlas labels are related texture samples, not one-use room parts. Region 1
contains the left exterior border (`19`, `37`, `55`, `73` for visible wall body;
`91`, `109`, `127`, `145` for floor rows) plus adjacent fill tiles such as
`20-23`, `38-41`, `56-59`, and `74-77`. Region 4 mirrors that on the right with
the exterior edge at `36`, `54`, `72`, `90`, then `108`, `126`, `144`, and `162`.

Regions 2 and 3 are repeatable middle materials. For example, `24-27`, `42-45`,
`60-63`, and `78-81` can repeat for orange wall spans; `28-31`, `46-49`, `64-67`,
and `82-85` can repeat for light wall spans. The matching floor bands start at
`96-99`, `114-117`, `132-135`, `150-153` for region 2 and `100-103`, `118-121`,
`136-139`, `154-157` for region 3.

## Draw editor map model

The `/draw` editor stores a versionless document with `width`, `height`, and a
user-managed `layers` array. A new map starts with layer objects `00` and `01`,
with `00` selected; users can add more layers and no layer has a fixed semantic
role. Each layer has an `id`, `name`, row-major `tiles` array, generated
`border` overlay, and positioned `items` collection. Labels are stable one-based
atlas labels; filenames remain a renderer concern.

The Rectangle tool exposes eight source presets: Regions 1–4 paired with wall
or floor. It uses only each region's four solid body columns: sheet columns 2–5
for Region 1, 6–9 for Region 2, 10–13 for Region 3, and 14–17 for Region 4.
Wall presets use rows 2–5 and floor presets use rows 6–8. Rectangles place the
first row at the top, extend only the interior rows through the middle, and
place the final row at the bottom; top/bottom border rows are never repeated
inside a taller rectangle. The first and final region columns are likewise
placed once at the left and right edges, while only interior columns extend
through a wider rectangle. The separate wood-border layer owns the edge and
corner tiles. For Region 2 wall rectangles specifically, row 2 stays fixed at
the top, row 3 is the only row repeated through the expandable middle, and
rows 4–5 remain fixed at the bottom. Region 4 is different: row 2 stays fixed
at the top while its bottom three rows (3–5) stretch downward.
For Region 4 floor rectangles, the interior of the middle floor row uses tile
`123` as the repeat tile; tile `124` is not used for that extension.

The editor's border action traces the actual eight-neighbor perimeter of
occupied tiles on the selected layer, so disconnected rooms and concave
corridors receive local wood borders rather than one rectangular bounding-box
border. It uses the
supplied corner groups: `1, 2, 19`, `17, 18, 36`, `127, 145, 146`, and
`144, 161, 162`. Random layouts first create a connected room/corridor
occupancy mask, then follow the renderer's vertical sequence: wall rows first,
followed by floor rows in the same coherent region.
Room connectors start and end on facing room edges and route their bend through
the open space between footprints, keeping corridor carving out of room
interiors.

### Database upload shape

The `Map` table stores `id`, `name`, `createdAt`, and `updatedAt` as database
columns. Its `data` JSON/JSONB column contains only the map document:

```json
{
  "width": 32,
  "height": 20,
  "layers": [
    {
      "id": "00",
      "name": "00",
      "tiles": [96, 97, null],
      "border": [null, null, null],
      "items": []
    },
    {
      "id": "01",
      "name": "01",
      "tiles": [null, null, null],
      "border": [null, null, null],
      "items": [
        {
          "id": "chair-1",
          "assetPath": "/assets/furniture2/chair-orange.png",
          "x": 8,
          "y": 6,
          "width": 1,
          "height": 1,
          "sourceWidth": 16,
          "sourceHeight": 16
        }
      ]
    }
  ]
}
```

For every layer, tile index `y * width + x` is the cell at `(x, y)`. A tile
value is a one-based atlas label or `null`; the renderer derives the filename
(`96` becomes `96.png`). The border overlay is kept with the layer it was
generated for. Items store a public `assetPath`, position, and the number of
grid units reserved by the item (`width` and `height`) plus its source pixel
dimensions (`sourceWidth` and `sourceHeight`). The renderer uses those source
dimensions to center and evenly pad smaller images inside their grid footprint
without making them larger than their shared tile scale.
`POST /api/maps` validates the map name, dimensions, every layer's cell arrays,
item coordinates/sizes, atlas labels, and public asset paths before writing the
snapshot. `GET /api/maps` returns the saved map names for the draw editor's
restore panel, while `GET /api/maps/:id` returns the selected map's full JSON
snapshot. `PUT /api/maps/:id` saves edits back to an existing published map.
The editor stores the published map id separately in local storage so reloads
can show Save instead of Publish without adding metadata to the downloadable
JSON. Older fixed-slot drafts are normalized into layer `00` plus an empty
layer `01` when opened.

### Walk-through view

The View action opens `/draw/view` in a new tab and reads the current local draft.
Movement is implemented in `src/lib/game/movement.ts`: the player occupies one
tile by one tile, can only enter visible floor cells, cannot cross the map
boundary, and cannot overlap furniture listed in
`src/lib/game/config.ts`. The player is currently rendered as a temporary
rectangle by `src/app/components/game/Player.tsx`; its movement tween uses the
shared `PLAYER_SPEED` setting in `src/lib/game/config.ts`. The walk-through
does not show editor grid lines and displays a fixed `VIEW_WIDTH` by
`VIEW_HEIGHT` tile camera from `src/lib/game/config.ts` that follows the player
without a scrollbar. Spawn searches for the
first valid floor position; if none exists, the player is omitted and
the game view shows a `No floor available` error toast.

The shared renderer is also used by `/home-2d`; its `GameController` owns the
gameplay state and display orchestration while the route page remains a thin
wrapper. Non-visual NPC conversation state and actor requests live in
`src/lib/game/useNpcDialogue.ts`; `src/app/components/game/MapRenderer.tsx`
only adapts that view model into displayable UI.
That controller loads the published
map named `myroom`; a missing or failed map load shows an error without
rendering a canvas. It adds every available star character from the voyage
summaries as a wandering NPC, using `NPC_SPRITE_SCALE` and a one-by-one
tile collision footprint. Press `Z` while facing an adjacent NPC to open the
space-themed `DialogueBox`; the actor handles the greeting and three suggested
questions, while the free-form question is answered by Coco.

## Template Layouts

Reusable layout templates live in `src/lib/game/map/`. The `/map` page renders
the atlas grid first, followed by `layout-00`, `layout-01`, and `layout-02`.
The current templates are rectangular rooms joined by rectangular hall/path
segments. Each zone repeats one coherent region, and different rooms can use
different regions as long as arbitrary material bands are not striped through a
single room.

Do not stripe multiple material regions through one connected room or footprint.
That creates fake wall/floor borders. A generated room/footprint should choose a
coherent material region and repeat that region's body columns horizontally
while preserving the atlas row sequence vertically. Shape complexity should come
from the occupancy mask, not from arbitrary material bands or variant mixing.

Generated layouts should not use mostly transparent border/corner exports as
generic fill. The renderer first creates a connected occupancy mask, then picks
solid wall/floor body tiles from an explicit fill palette for the selected
region. Avoid trim/cap tiles inside generated walls and floors; for example,
`60`, `50`, and similar visible-divider pieces should not be repeated as generic
fill. Sparse edge exports such as `1`, `19`, `36`, `37`, `54`, `55`, `72`, `73`,
`90`, and similar low-alpha border pieces are for future explicit edge
decoration, not normal layout fill.

`123.png` is a vent/detail floor tile, not generic floor fill. Use it sparingly,
for example at most once in a small room, and place it near the edge of a floor
area rather than repeating it through the middle of a room or hallway. The
layout renderer reserves this tile and excludes it from repeated fill selection.
