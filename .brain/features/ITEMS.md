# Items

Furniture and small-item assets live under `public/assets/` (`furniture1`,
`furniture2`, `smallitems`, plus doors/windows). The shared catalog is
`src/lib/game/items/shop.ts`.

## Variants

Assets that share a base name with orientation or state suffixes (`-side`,
`-back`, `-on`, `-lit`, `-full`, `-food`, and similar) collapse into one listing.
Furniture1/furniture2 duplicates with the same slug also collapse. Odd aliases
like `chair-back` (white chair rear view) are grouped with their base item.

The map editor collapses the same way for non-shop folders (e.g. stairs
front/side in `doorsandwindows`) via `src/lib/game/items/asset-variants.ts`. Shop and
draw share one variant catalog in `shop.ts`: A/D rotation and in-game Z state
changes both use `rotateShopItemAssetPath` / state groups, so a lamp or chair
keeps the same front/side/back and on/off sprites everywhere.

## Interactions

In-game Z prompts live in `src/lib/game/interactions/`. Behaviors are modular
and priority-ranked so new rules can be added without rewriting the resolver:

- **Toggle** — one item, two states (lamp, fridge, stove alone).
- **Choice** — one item, many state options (cup, wineglass, pet dish).
- **Compound** — enabled when related objects overlap (`createCompoundBehavior`):
  focus item takes state options, partner toggles on/off (pan on stove: cook
  choices fill the pan and turn the stove on; while engaged you can switch
  state or reset both).
- **Muse** — non-state small items get a single quirky player line
  (`SMALL_ITEM_MUSINGS` in `catalog.ts`); no choices, no sprite change.

`INTERACTION_BEHAVIORS` in `catalog.ts` is the registry. Compound rules outrank
solo toggles when their members overlap.

Z uses **trigger boxes**, not movement alone:

- Collidable furniture → trigger rects = collision solids (`itemSolidRects`).
- Surface furniture (counter, tables) → body solids below the countertop band;
  small items on the surface win by **column projection** when you face the
  cabinet/front below them. Empty countertop still prompts the surface.
- Non-collidable items (cups, pans, …) → trigger rects = full placed footprint.
- Z prefers a small item only when its trigger actually hits the facing cell
  or it projects from the surface column you are facing. A cup elsewhere on a
  table does not override the counter. Floor cups you stand on are still
  reachable via the player tile.
- The same white `Z` playfield tooltip used for NPCs appears above the item
  selected by this resolver, so the prompt always matches what pressing Z opens.

## Editor and play

Placed items can change facing with A/D (front → side → back) and interactive
state in-game via Z.

In `/draw`, small items may be placed on kitchen counters and tables; the click
stacks onto the surface instead of selecting it.
