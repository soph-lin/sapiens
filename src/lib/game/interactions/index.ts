import {
  cellHitsTrigger,
  cellXInItemColumn,
  itemBodySolidRects,
  itemSurfaceTopBand,
  itemTriggerRects,
  rectsIntersect,
  type CollisionRect,
} from "../collision";
import type { MapDocument, MapItem } from "../map";
import {
  isCollidableItem,
  type PlayerDirection,
  type PlayerPosition,
} from "../movement";
import { isShopSmallItem, isSurfaceFurniture } from "../items/shop";
import { INTERACTION_BEHAVIORS } from "./catalog";
import { buildInteractionContext, itemsOverlap } from "./context";
import type {
  InteractionContext,
  ItemInteractionDefinition,
  ItemInteractionOutcome,
  ItemInteractionTarget,
} from "./types";

export type {
  InteractionBehavior,
  InteractionContext,
  ItemInteractionDefinition,
  ItemInteractionEffect,
  ItemInteractionOption,
  ItemInteractionOutcome,
  ItemInteractionTarget,
} from "./types";
export {
  createChoiceBehavior,
  createCompoundBehavior,
  createMuseBehaviors,
  createToggleBehavior,
  createVesselNeedsHeatBehavior,
} from "./behaviors";
export type {
  ChoiceFillOption,
  ChoiceSpec,
  CompoundSpec,
  MuseSpec,
  ToggleSpec,
} from "./behaviors";
export { buildInteractionContext, shopGroupId } from "./context";
export { INTERACTION_BEHAVIORS } from "./catalog";

/** Pick the highest-priority behavior that matches this focus context. */
export function resolveInteraction(
  ctx: InteractionContext,
): ItemInteractionDefinition | undefined {
  let best:
    | {priority: number; definition: ItemInteractionDefinition}
    | undefined;
  for (const behavior of INTERACTION_BEHAVIORS) {
    if (!behavior.match(ctx)) continue;
    if (best && behavior.priority <= best.priority) continue;
    const definition = behavior.resolve(ctx);
    if (!definition) continue;
    best = {priority: behavior.priority, definition};
  }
  return best?.definition;
}

export function getItemInteraction(
  document: MapDocument,
  target: ItemInteractionTarget,
): ItemInteractionDefinition | undefined {
  return resolveInteraction(buildInteractionContext(document, target));
}

export function applyItemInteraction(
  document: MapDocument,
  target: ItemInteractionTarget,
  optionId: string,
): ItemInteractionOutcome | undefined {
  const interaction = getItemInteraction(document, target);
  const option = interaction?.options.find(
    (candidate) => candidate.id === optionId,
  );
  if (!option) return undefined;
  return {response: option.response, effects: option.effects};
}

function triggersFor(item: MapItem): CollisionRect[] {
  if (!isCollidableItem(item)) {
    return itemTriggerRects(item, false);
  }
  if (isSurfaceFurniture(item.assetPath)) {
    return itemBodySolidRects(item);
  }
  return itemTriggerRects(item, true);
}

function itemHitsCell(item: MapItem, cell: PlayerPosition): boolean {
  return cellHitsTrigger(cell, triggersFor(item));
}

function smallItemsOnSurfaceColumn(
  document: MapDocument,
  surface: MapItem,
  cellX: number,
): ItemInteractionTarget[] {
  const band = itemSurfaceTopBand(surface);
  const targets: ItemInteractionTarget[] = [];
  for (const layer of document.layers) {
    for (const item of layer.items) {
      if (!isShopSmallItem(item.assetPath)) continue;
      if (!cellXInItemColumn(cellX, item)) continue;
      if (
        !rectsIntersect(band, {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        })
      ) {
        continue;
      }
      if (!itemsOverlap(surface, item)) continue;
      const target = {layerId: layer.id, item};
      if (!getItemInteraction(document, target)) continue;
      targets.push(target);
    }
  }
  return targets;
}

function dedupeTargets(
  targets: readonly ItemInteractionTarget[],
): ItemInteractionTarget[] {
  const seen = new Set<string>();
  const unique: ItemInteractionTarget[] = [];
  for (const target of targets) {
    if (seen.has(target.item.id)) continue;
    seen.add(target.item.id);
    unique.push(target);
  }
  return unique;
}

/**
 * Among items that actually hit the facing (or stand-on) cell, prefer
 * non-collidable small items over furniture. Surface furniture only prompts
 * on its body (cabinets / front face); small items on the countertop win
 * via column projection when you face the surface below them.
 */
function rankInteractable(
  target: ItemInteractionTarget,
  layerIndex: number,
  itemIndex: number,
): number {
  const smallBoost = isCollidableItem(target.item) ? 0 : 1_000;
  return smallBoost + layerIndex * 10 + itemIndex;
}

function collectCellCandidates(
  document: MapDocument,
  cell: PlayerPosition,
  options: {nonCollidableOnly?: boolean} = {},
): ItemInteractionTarget[] {
  const candidates: ItemInteractionTarget[] = [];
  const projected: ItemInteractionTarget[] = [];

  for (const layer of document.layers) {
    for (const item of layer.items) {
      if (options.nonCollidableOnly && isCollidableItem(item)) continue;

      const surface =
        isCollidableItem(item) && isSurfaceFurniture(item.assetPath);
      const bodyHit = itemHitsCell(item, cell);
      const topBandHit =
        surface &&
        cellHitsTrigger(cell, [itemSurfaceTopBand(item)]);
      const hit = bodyHit || topBandHit;

      if (!hit) continue;

      if (surface) {
        const onColumn = smallItemsOnSurfaceColumn(document, item, cell.x);
        if (onColumn.length) {
          projected.push(...onColumn);
          continue;
        }
      }

      const target = {layerId: layer.id, item};
      if (!getItemInteraction(document, target)) continue;
      candidates.push(target);
    }
  }

  return dedupeTargets([...candidates, ...projected]);
}

function pickBestCandidate(
  document: MapDocument,
  candidates: readonly ItemInteractionTarget[],
): ItemInteractionTarget | undefined {
  let best: ItemInteractionTarget | undefined;
  let bestRank = -1;
  for (const candidate of candidates) {
    const layerIndex = document.layers.findIndex(
      (layer) => layer.id === candidate.layerId,
    );
    const layer = document.layers[layerIndex];
    const itemIndex =
      layer?.items.findIndex((item) => item.id === candidate.item.id) ?? 0;
    const rank = rankInteractable(
      candidate,
      Math.max(0, layerIndex),
      Math.max(0, itemIndex),
    );
    if (rank > bestRank) {
      bestRank = rank;
      best = candidate;
    }
  }
  return best;
}

export function findInteractableItem(
  document: MapDocument,
  player: PlayerPosition | null,
  direction: PlayerDirection,
): ItemInteractionTarget | undefined {
  if (!player) return undefined;
  const delta = {
    up: {x: 0, y: -1},
    down: {x: 0, y: 1},
    left: {x: -1, y: 0},
    right: {x: 1, y: 0},
  }[direction];
  const facingCell = {x: player.x + delta.x, y: player.y + delta.y};

  // Primary: whatever's trigger box hits the facing cell.
  const facing = collectCellCandidates(document, facingCell);
  if (facing.length) return pickBestCandidate(document, facing);

  // Walk-through small items: you can stand on a floor cup, so also allow Z
  // when its trigger covers the player's current tile.
  const underfoot = collectCellCandidates(document, player, {
    nonCollidableOnly: true,
  });
  return pickBestCandidate(document, underfoot);
}
