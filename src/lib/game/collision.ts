import type { MapItem } from "./map";

/** Axis-aligned box in map tile space (may be fractional). */
export type CollisionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Cutaway punched from an item's collision box, in **tile units relative to
 * the item's top-left** `(item.x, item.y)` — the same grid the player walks on.
 *
 * Prefer whole tiles (e.g. `{ x: 0, y: 2, width: 6, height: 2 }`) so a 1×1
 * actor can actually enter the opening. Source-pixel notches from `/slice`
 * should be converted with `sourceHoleToTileHole` first.
 */
export type CollisionHole = CollisionRect;

export type ItemCollisionMask = {
  /** Remove these local-tile rects from the item AABB. */
  holes?: readonly CollisionHole[];
  /**
   * Or define solid local-tile rects explicitly (ignores `holes`).
   * Useful for L / U shapes you want to tune by eye on the tile grid.
   */
  solids?: readonly CollisionRect[];
};

/**
 * Per-asset collision masks. Paths match `COLLIDABLE_FURNITURE_ASSET_PATHS`
 * (with or without a `/assets` prefix).
 *
 * Kitchen counter is a 7×4 tile AABB (112×63px). The transparent bottom-left
 * pocket starts near source pixel (90, 41); snapped to tiles that is a 6×2
 * cutaway at local `(0, 2)`.
 */
const COLLISION_MASK_BY_ASSET: Record<string, ItemCollisionMask> = {
  "/furniture1/kitchen-counter.png": {
    holes: [{ x: 0, y: 2, width: 6, height: 2 }],
  },
  "/furniture2/kitchen-counter-on.png": {
    holes: [{ x: 0, y: 2, width: 6, height: 2 }],
  },
};

/** Tile rows from the item top that count as the placeable surface (countertop, tabletop). */
const SURFACE_TOP_ROWS_BY_ASSET: Record<string, number> = {
  "/furniture1/kitchen-counter.png": 2,
  "/furniture2/kitchen-counter-on.png": 2,
  "/furniture1/table-lg.png": 2,
  "/furniture2/table-lg.png": 2,
  "/furniture1/table-md.png": 2,
  "/furniture2/table-md.png": 2,
  "/furniture1/table-sm.png": 2,
  "/furniture2/table-sm.png": 2,
};

export function collisionAssetKey(assetPath: string): string {
  return assetPath.startsWith("/assets/")
    ? assetPath.slice("/assets".length)
    : assetPath;
}

export function collisionMaskForAsset(
  assetPath: string,
): ItemCollisionMask | null {
  return COLLISION_MASK_BY_ASSET[collisionAssetKey(assetPath)] ?? null;
}

/** @deprecated Prefer `collisionMaskForAsset`. */
export function collisionHolesForAsset(
  assetPath: string,
): readonly CollisionHole[] {
  return collisionMaskForAsset(assetPath)?.holes ?? [];
}

/**
 * Convert a `/slice` source-pixel notch rect into a tile-local hole.
 * Uses floor/ceil so the opening is at least as large as the transparent area.
 */
export function sourceHoleToTileHole(
  hole: CollisionRect,
  sourceTileSize: number,
): CollisionHole {
  const left = Math.floor(hole.x / sourceTileSize);
  const top = Math.floor(hole.y / sourceTileSize);
  const right = Math.ceil((hole.x + hole.width) / sourceTileSize);
  const bottom = Math.ceil((hole.y + hole.height) / sourceTileSize);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function rectsIntersect(a: CollisionRect, b: CollisionRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function rectIntersection(
  a: CollisionRect,
  b: CollisionRect,
): CollisionRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * Remove one axis-aligned hole from an outer rect, returning up to four
 * remaining solid rects. Call repeatedly for multiple holes.
 */
export function subtractRect(
  outer: CollisionRect,
  hole: CollisionRect,
): CollisionRect[] {
  const cut = rectIntersection(outer, hole);
  if (!cut) return [outer];

  const result: CollisionRect[] = [];
  const outerRight = outer.x + outer.width;
  const outerBottom = outer.y + outer.height;
  const cutRight = cut.x + cut.width;
  const cutBottom = cut.y + cut.height;

  if (cut.y > outer.y) {
    result.push({
      x: outer.x,
      y: outer.y,
      width: outer.width,
      height: cut.y - outer.y,
    });
  }
  if (cutBottom < outerBottom) {
    result.push({
      x: outer.x,
      y: cutBottom,
      width: outer.width,
      height: outerBottom - cutBottom,
    });
  }
  if (cut.x > outer.x) {
    result.push({
      x: outer.x,
      y: cut.y,
      width: cut.x - outer.x,
      height: cut.height,
    });
  }
  if (cutRight < outerRight) {
    result.push({
      x: cutRight,
      y: cut.y,
      width: outerRight - cutRight,
      height: cut.height,
    });
  }

  return result.filter((rect) => rect.width > 0 && rect.height > 0);
}

/** Punch every hole out of `outer`, iteratively. */
export function subtractRects(
  outer: CollisionRect,
  holes: readonly CollisionRect[],
): CollisionRect[] {
  let solids = [outer];
  for (const hole of holes) {
    solids = solids.flatMap((rect) => subtractRect(rect, hole));
  }
  return solids;
}

function toMapRect(
  item: Pick<MapItem, "x" | "y">,
  local: CollisionRect,
): CollisionRect {
  return {
    x: item.x + local.x,
    y: item.y + local.y,
    width: local.width,
    height: local.height,
  };
}

/**
 * Solid collision AABBs for a placed map item in map-tile space.
 * Default: the full placed tile AABB. Masked items use `solids` or `holes`.
 */
export function itemSolidRects(
  item: Pick<
    MapItem,
    "x" | "y" | "width" | "height" | "sourceWidth" | "sourceHeight" | "assetPath"
  >,
): CollisionRect[] {
  const mask = collisionMaskForAsset(item.assetPath);
  const bounds: CollisionRect = {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  };

  if (!mask) return [bounds];

  if (mask.solids?.length) {
    return mask.solids.map((local) => toMapRect(item, local));
  }

  if (mask.holes?.length) {
    const mapHoles = mask.holes.map((local) => toMapRect(item, local));
    return subtractRects(bounds, mapHoles);
  }

  return [bounds];
}

/** Rows from the top of a placed item that count as its surface band. */
export function surfaceTopRowCount(
  assetPath: string,
  itemHeight: number,
): number {
  const fixed = SURFACE_TOP_ROWS_BY_ASSET[collisionAssetKey(assetPath)];
  if (fixed !== undefined) return Math.min(fixed, itemHeight);
  return Math.max(1, Math.ceil(itemHeight / 3));
}

/** Top band of a surface item — where small items are placed in the editor. */
export function itemSurfaceTopBand(
  item: Pick<MapItem, "x" | "y" | "width" | "height" | "assetPath">,
): CollisionRect {
  const rows = surfaceTopRowCount(item.assetPath, item.height);
  return {x: item.x, y: item.y, width: item.width, height: rows};
}

/**
 * Solid collision rects below the surface band (cabinets, legs, front face).
 * Used for surface-furniture Z prompts so the countertop defers to items on top.
 */
export function itemBodySolidRects(
  item: Pick<
    MapItem,
    "x" | "y" | "width" | "height" | "sourceWidth" | "sourceHeight" | "assetPath"
  >,
): CollisionRect[] {
  const solids = itemSolidRects(item);
  const bandBottom = item.y + surfaceTopRowCount(item.assetPath, item.height);
  return solids.flatMap((rect) => {
    if (rect.y >= bandBottom) return [rect];
    const bottom = rect.y + rect.height;
    if (bottom <= bandBottom) return [];
    return [{...rect, y: bandBottom, height: bottom - bandBottom}];
  });
}

export function cellXInItemColumn(
  cellX: number,
  item: Pick<MapItem, "x" | "width">,
): boolean {
  return cellX >= item.x && cellX < item.x + item.width;
}

export function rectOverlapsItem(
  actor: CollisionRect,
  item: Pick<
    MapItem,
    "x" | "y" | "width" | "height" | "sourceWidth" | "sourceHeight" | "assetPath"
  >,
): boolean {
  return itemSolidRects(item).some((rect) => rectsIntersect(actor, rect));
}

/**
 * Interaction trigger AABBs in map-tile space.
 * Collidable furniture uses the same solids as walking collision; everything
 * else (small items, rugs, etc.) uses the full placed footprint so Z can hit
 * cups/pans even though they do not block movement.
 */
export function itemTriggerRects(
  item: Pick<
    MapItem,
    "x" | "y" | "width" | "height" | "sourceWidth" | "sourceHeight" | "assetPath"
  >,
  isCollidable: boolean,
): CollisionRect[] {
  if (isCollidable) return itemSolidRects(item);
  return [
    {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    },
  ];
}

export function cellHitsTrigger(
  cell: {x: number; y: number},
  triggers: readonly CollisionRect[],
): boolean {
  const cellRect = {x: cell.x, y: cell.y, width: 1, height: 1};
  return triggers.some((rect) => rectsIntersect(cellRect, rect));
}
