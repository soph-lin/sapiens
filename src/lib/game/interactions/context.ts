import { rectsIntersect } from "../collision";
import type { MapDocument, MapItem } from "../map";
import {
  getShopItemByAssetPath,
  getShopVariantGroup,
} from "../items/shop";
import type { InteractionContext, ItemInteractionTarget } from "./types";

export function shopGroupId(item: MapItem): string | undefined {
  const shopItem = getShopItemByAssetPath(item.assetPath);
  if (!shopItem) return undefined;
  return getShopVariantGroup(shopItem)?.id;
}

export function itemsOverlap(a: MapItem, b: MapItem): boolean {
  return rectsIntersect(
    {x: a.x, y: a.y, width: a.width, height: a.height},
    {x: b.x, y: b.y, width: b.width, height: b.height},
  );
}

export function findOverlappingByGroup(
  ctx: InteractionContext,
  groupId: string,
): ItemInteractionTarget | undefined {
  return ctx.overlapping.find(
    (target) => shopGroupId(target.item) === groupId,
  );
}

export function buildInteractionContext(
  document: MapDocument,
  focus: ItemInteractionTarget,
): InteractionContext {
  const overlapping: ItemInteractionTarget[] = [];
  for (const layer of document.layers) {
    for (const item of layer.items) {
      if (item.id === focus.item.id) continue;
      if (itemsOverlap(focus.item, item)) {
        overlapping.push({layerId: layer.id, item});
      }
    }
  }
  return {document, focus, overlapping};
}
