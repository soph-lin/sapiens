import type { SpriteBeingKind } from "./sprite-types";

type MapEntityBase = {
  id: string;
  assetKey: string;
  frame: number;
  animationKey?: string;
  col: number;
  row: number;
  solid?: boolean;
  label?: string;
};

export type MapEntity =
  | (MapEntityBase & { entityKind: "being"; beingKind: SpriteBeingKind })
  | (MapEntityBase & { entityKind: "object" });

export type TopDownMap = {
  width: number;
  height: number;
  tileSize: number;
  tiles: Array<"grass" | "grass2" | "grass3" | "path" | "water" | "stone">;
  entities: MapEntity[];
};

const width = 48;
const height = 36;

function key(col: number, row: number) {
  return `${col},${row}`;
}

function paintHorizontal(cells: Set<string>, fromCol: number, toCol: number, row: number, thickness = 1) {
  for (let col = fromCol; col <= toCol; col += 1) {
    for (let offset = 0; offset < thickness; offset += 1) cells.add(key(col, row + offset));
  }
}

function paintVertical(cells: Set<string>, col: number, fromRow: number, toRow: number, thickness = 1) {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let offset = 0; offset < thickness; offset += 1) cells.add(key(col + offset, row));
  }
}

const waterCells = new Set<string>();
for (let col = 0; col < width; col += 1) {
  waterCells.add(key(col, 0));
  waterCells.add(key(col, 1));
  waterCells.add(key(col, height - 1));
}
for (let row = 15; row <= 20; row += 1) {
  for (let col = 1; col <= 6; col += 1) {
    const distance = ((col - 3.6) ** 2) / 8 + ((row - 17.4) ** 2) / 6;
    if (distance < 1.2) waterCells.add(key(col, row));
  }
}
for (let row = 24; row <= 31; row += 1) {
  for (let col = 3; col <= 11; col += 1) {
    const distance = ((col - 7) ** 2) / 18 + ((row - 27.5) ** 2) / 10;
    if (distance < 1.2) waterCells.add(key(col, row));
  }
}

const stoneCells = new Set<string>();
for (let col = 0; col < width; col += 1) {
  stoneCells.add(key(col, 2));
  stoneCells.add(key(col, height - 2));
}
for (let row = 23; row <= 32; row += 1) {
  for (let col = 1; col <= 13; col += 1) {
    const distance = ((col - 7) ** 2) / 25 + ((row - 27.5) ** 2) / 16;
    if (distance < 1.4 && !waterCells.has(key(col, row))) stoneCells.add(key(col, row));
  }
}

const pathCells = new Set<string>();
paintHorizontal(pathCells, 5, 43, 20, 2);
paintVertical(pathCells, 24, 8, 31, 2);
paintHorizontal(pathCells, 9, 25, 14);
paintVertical(pathCells, 11, 14, 20);
paintHorizontal(pathCells, 25, 39, 13);
paintVertical(pathCells, 38, 13, 20);
paintHorizontal(pathCells, 11, 25, 28);
paintVertical(pathCells, 13, 21, 28);
paintHorizontal(pathCells, 25, 39, 29);
paintVertical(pathCells, 38, 21, 29);

export const DEMO_MAP: TopDownMap = {
  width,
  height,
  tileSize: 32,
  tiles: Array.from({ length: width * height }, (_, index) => {
    const row = Math.floor(index / width);
    const col = index % width;
    if (waterCells.has(key(col, row))) return "water";
    if (pathCells.has(key(col, row))) return "path";
    if (stoneCells.has(key(col, row))) return "stone";
    return "grass";
  }),
  entities: [
    { id: "player", assetKey: "player-base", frame: 0, col: 25, row: 20, entityKind: "being", beingKind: "player", label: "You" },
    { id: "lumberjack", assetKey: "lumberjack", frame: 0, animationKey: "lumberjack-1", col: 15, row: 27, entityKind: "being", beingKind: "npc", solid: true, label: "Lumberjack Jack" },
    { id: "cow", assetKey: "cow", frame: 0, animationKey: "cow-0", col: 17, row: 30, entityKind: "being", beingKind: "animal", label: "Cow" },
    { id: "goose-wanderer", assetKey: "goose", frame: 0, animationKey: "goose-0", col: 9, row: 25, entityKind: "being", beingKind: "animal", label: "Wandering goose" },
    { id: "barrels", assetKey: "barrels", frame: 0, col: 14, row: 22, entityKind: "object", solid: true, label: "Barrels" },
    { id: "barrels-b", assetKey: "barrels", frame: 1, col: 15, row: 22, entityKind: "object", solid: true, label: "Barrel variant" },
    { id: "crate-a", assetKey: "barrels", frame: 3, col: 33, row: 23, entityKind: "object", solid: true, label: "Crate" },
    { id: "crate-b", assetKey: "barrels", frame: 5, col: 34, row: 23, entityKind: "object", solid: true, label: "Crate variant" },
    { id: "flowers-a", assetKey: "flowers-anim", frame: 0, animationKey: "flower-flowers-1-anim-0", col: 10, row: 18, entityKind: "object", label: "Wildflowers" },
    { id: "flowers-b", assetKey: "flowers-potted-anim", frame: 0, animationKey: "flower-flowers-1-potted-anim-1", col: 27, row: 18, entityKind: "object", label: "Potted flowers" },
    { id: "flowers-c", assetKey: "flowers-anim", frame: 0, animationKey: "flower-flowers-1-anim-2", col: 17, row: 12, entityKind: "object", label: "Wildflowers" },
    { id: "flowers-d", assetKey: "flowers-potted-anim", frame: 0, animationKey: "flower-flowers-1-potted-anim-3", col: 39, row: 17, entityKind: "object", label: "Potted flowers" },
    { id: "flowers-e", assetKey: "flowers-anim", frame: 0, animationKey: "flower-flowers-1-anim-4", col: 42, row: 23, entityKind: "object", label: "Wildflowers" },
    { id: "flowers-f", assetKey: "flowers-anim", frame: 0, animationKey: "flower-flowers-1-anim-5", col: 8, row: 31, entityKind: "object", label: "Pond flowers" },
    { id: "flowers-g", assetKey: "flowers-anim", frame: 0, animationKey: "flower-flowers-1-anim-6", col: 21, row: 31, entityKind: "object", label: "Meadow flowers" },
    { id: "flowers-h", assetKey: "flowers-potted-anim", frame: 0, animationKey: "flower-flowers-1-potted-anim-7", col: 23, row: 17, entityKind: "object", label: "Potted flowers" },
    { id: "flowers-i", assetKey: "flowers", frame: 11, col: 13, row: 18, entityKind: "object", label: "Roadside flowers" },
    { id: "flowers-j", assetKey: "flowers", frame: 24, col: 18, row: 18, entityKind: "object", label: "Roadside flowers" },
    { id: "flowers-k", assetKey: "flowers", frame: 35, col: 31, row: 19, entityKind: "object", label: "Roadside flowers" },
    { id: "flowers-l", assetKey: "flowers", frame: 46, col: 36, row: 18, entityKind: "object", label: "Roadside flowers" },
    { id: "flowers-m", assetKey: "flowers", frame: 57, col: 19, row: 23, entityKind: "object", label: "Meadow flowers" },
    { id: "flowers-n", assetKey: "flowers", frame: 68, col: 29, row: 24, entityKind: "object", label: "Meadow flowers" },
    { id: "flowers-o", assetKey: "flowers", frame: 79, col: 36, row: 25, entityKind: "object", label: "Meadow flowers" },
    { id: "flowers-p", assetKey: "flowers", frame: 83, col: 41, row: 28, entityKind: "object", label: "Meadow flowers" },
    { id: "flower-grass-a", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 18, row: 13, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-b", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 34, row: 16, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-c", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 42, row: 12, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-d", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 43, row: 29, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-e", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 12, row: 17, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-f", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 20, row: 19, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-g", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 31, row: 18, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-h", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 40, row: 19, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-i", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 17, row: 24, entityKind: "object", label: "Flower grass" },
    { id: "flower-grass-j", assetKey: "flower-grass", frame: 0, animationKey: "grass-flower-grass-1-anim-0", col: 30, row: 25, entityKind: "object", label: "Flower grass" },
  ],
};
