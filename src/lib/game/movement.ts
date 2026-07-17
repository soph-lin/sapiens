import { COLLIDABLE_FURNITURE_ASSET_SET } from "./config";
import { rectOverlapsItem, rectsIntersect } from "./collision";
import type { MapDocument, MapItem } from "./map";

export const PLAYER_WIDTH = 1;
export const PLAYER_HEIGHT = 1;

export type PlayerPosition = {
  x: number;
  y: number;
};

export type PlayerDirection = "up" | "down" | "left" | "right";

/** Labels in atlas rows 6–8 are the documented floor bands. */
export function isFloorTileLabel(label: number | null): boolean {
  if (label === null) return false;
  const sheetRow = Math.floor((label - 1) / 18) + 1;
  return sheetRow >= 6 && sheetRow <= 8;
}

export function visibleTileLabel(document: MapDocument, index: number) {
  return visibleTileCell(document, index).label;
}

function visibleTileCell(document: MapDocument, index: number) {
  return document.layers.reduce<{ label: number | null; isBorder: boolean }>(
    (visible, layer) => {
      if (layer.border[index] !== null && layer.border[index] !== undefined) {
        return { label: layer.border[index], isBorder: true };
      }
      if (layer.tiles[index] !== null && layer.tiles[index] !== undefined) {
        return { label: layer.tiles[index], isBorder: false };
      }
      return visible;
    },
    { label: null, isBorder: false },
  );
}

export function canPlayerOccupy(
  document: MapDocument,
  position: PlayerPosition,
  occupiedPositions: readonly PlayerPosition[] = [],
): boolean {
  return canActorOccupy(document, position, occupiedPositions);
}

export function canActorOccupy(
  document: MapDocument,
  position: PlayerPosition,
  occupiedPositions: readonly PlayerPosition[] = [],
): boolean {
  if (
    position.x < 0 ||
    position.y < 0 ||
    position.x + PLAYER_WIDTH > document.width ||
    position.y + PLAYER_HEIGHT > document.height
  ) {
    return false;
  }

  for (let y = position.y; y < position.y + PLAYER_HEIGHT; y += 1) {
    for (let x = position.x; x < position.x + PLAYER_WIDTH; x += 1) {
      const index = y * document.width + x;
      const cell = visibleTileCell(document, index);
      if (cell.isBorder || !isFloorTileLabel(cell.label)) {
        return false;
      }
    }
  }

  if (document.layers.some((layer) =>
    layer.items.some((item) =>
      isCollidableItem(item) &&
      rectOverlapsItem(
        {
          x: position.x,
          y: position.y,
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
        },
        item,
      ),
    ),
  )) {
    return false;
  }

  return !occupiedPositions.some((occupied) =>
    rectsIntersect(
      {
        x: position.x,
        y: position.y,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
      },
      {
      x: occupied.x,
      y: occupied.y,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      },
    ),
  );
}

export function moveActor(
  document: MapDocument,
  current: PlayerPosition,
  direction: PlayerDirection,
  occupiedPositions: readonly PlayerPosition[] = [],
): PlayerPosition {
  const delta = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  }[direction];
  const next = { x: current.x + delta.x, y: current.y + delta.y };
  return canActorOccupy(document, next, occupiedPositions) ? next : current;
}

export function movePlayer(
  document: MapDocument,
  current: PlayerPosition,
  direction: PlayerDirection,
  occupiedPositions: readonly PlayerPosition[] = [],
): PlayerPosition {
  return moveActor(document, current, direction, occupiedPositions);
}

export function findPlayerStart(document: MapDocument): PlayerPosition | null {
  return findActorStart(document);
}

export function findActorStart(
  document: MapDocument,
  occupiedPositions: readonly PlayerPosition[] = [],
): PlayerPosition | null {
  for (let y = 0; y <= document.height - PLAYER_HEIGHT; y += 1) {
    for (let x = 0; x <= document.width - PLAYER_WIDTH; x += 1) {
      const position = { x, y };
      if (canActorOccupy(document, position, occupiedPositions)) return position;
    }
  }
  return null;
}

/** Pick a random unoccupied floor tile, rather than the first available one. */
export function findRandomActorStart(
  document: MapDocument,
  occupiedPositions: readonly PlayerPosition[] = [],
): PlayerPosition | null {
  const candidates: PlayerPosition[] = [];
  for (let y = 0; y <= document.height - PLAYER_HEIGHT; y += 1) {
    for (let x = 0; x <= document.width - PLAYER_WIDTH; x += 1) {
      const position = { x, y };
      if (canActorOccupy(document, position, occupiedPositions)) {
        candidates.push(position);
      }
    }
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function isCollidableItem(item: MapItem) {
  return COLLIDABLE_FURNITURE_ASSET_SET.has(item.assetPath);
}

export function computeCameraPosition(
  document: MapDocument,
  player: PlayerPosition,
  viewWidth: number,
  viewHeight: number,
) {
  return {
    x: Math.min(
      Math.max(0, player.x - Math.floor(viewWidth / 2)),
      Math.max(0, document.width - viewWidth),
    ),
    y: Math.min(
      Math.max(0, player.y - Math.floor(viewHeight / 2)),
      Math.max(0, document.height - viewHeight),
    ),
  };
}
