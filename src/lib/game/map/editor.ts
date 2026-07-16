import type { MapRegion, TileRole } from "./index";

export const DRAW_MAP_WIDTH = 32;
export const DRAW_MAP_HEIGHT = 20;

export type MapItem = {
  id: string;
  assetPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  rotation?: number;
  scale?: number;
};

export type MapLayer = {
  id: string;
  name: string;
  tiles: Array<number | null>;
  border: Array<number | null>;
  items: MapItem[];
};

export type MapDocument = {
  width: number;
  height: number;
  layers: MapLayer[];
};

export const DEFAULT_LAYER_IDS = ["00", "01"] as const;

export const WOOD_BORDER_LABELS = [
  1, 2, 17, 18, 19, 36, 127, 144, 145, 146, 161, 162,
] as const;

const WOOD_BORDER_LABEL_SET = new Set<number>(WOOD_BORDER_LABELS);
const MOVED_ASSET_FOLDERS = new Set([
  "doorsandwindows",
  "floorsandwalls",
  "furniture1",
  "furniture2",
  "opendoors",
  "smallitems",
  "spritesheets",
]);
const SOLID_REGION_COLUMNS: Record<MapRegion, number[]> = {
  1: [2, 3, 4, 5],
  2: [6, 7, 8, 9],
  3: [10, 11, 12, 13],
  4: [14, 15, 16, 17],
};
const WALL_ROWS = [2, 3, 4, 5];
const FLOOR_ROWS = [6, 7, 8];
const RECTANGLE_TILE_ROWS: Record<
  MapRegion,
  Record<TileRole, readonly (readonly number[])[]>
> = {
  1: {
    wall: [[20, 21, 22, 23], [38, 39, 40, 41], [56, 57, 58, 59], [74, 75, 76, 77]],
    floor: [[92, 93, 94, 95], [110, 111, 112, 113], [128, 129, 130, 131]],
  },
  2: {
    wall: [[24, 25, 26, 27], [42, 43, 44, 45], [60, 61, 62, 63], [78, 79, 80, 81]],
    floor: [[96, 97, 98, 99], [114, 115, 116, 117], [132, 133, 134, 135]],
  },
  3: {
    wall: [[28, 29, 30, 31], [46, 47, 48, 49], [64, 65, 66, 67], [82, 83, 84, 85]],
    floor: [[100, 101, 102, 103], [118, 119, 120, 121], [136, 137, 138, 139]],
  },
  4: {
    wall: [[32, 33, 34, 35], [50, 51, 52, 53], [68, 69, 70, 71], [86, 87, 88, 89]],
    floor: [[104, 105, 106, 107], [122, 123, 124, 125], [140, 141, 142, 143]],
  },
};

export function createEmptyMapDocument(
  width = DRAW_MAP_WIDTH,
  height = DRAW_MAP_HEIGHT,
): MapDocument {
  return {
    width,
    height,
    layers: DEFAULT_LAYER_IDS.map((id) => createEmptyMapLayer(id, width, height)),
  };
}

export function createEmptyMapLayer(
  id: string,
  width: number,
  height: number,
): MapLayer {
  return {
    id,
    name: id,
    tiles: Array.from({ length: width * height }, () => null),
    border: Array.from({ length: width * height }, () => null),
    items: [],
  };
}

export function gridSizeForAsset(
  naturalWidth: number,
  naturalHeight: number,
  sourceTileSize: number,
) {
  return {
    width: Math.max(1, Math.ceil(naturalWidth / sourceTileSize)),
    height: Math.max(1, Math.ceil(naturalHeight / sourceTileSize)),
  };
}

export function itemRenderSize(
  item: Pick<MapItem, "width" | "height" | "sourceWidth" | "sourceHeight">,
  cellSize: number,
  sourceTileSize: number,
) {
  return {
    width: item.sourceWidth * (cellSize / sourceTileSize),
    height: item.sourceHeight * (cellSize / sourceTileSize),
  };
}

export function normalizeMapDocument(
  value: unknown,
  fallbackWidth = DRAW_MAP_WIDTH,
  fallbackHeight = DRAW_MAP_HEIGHT,
): MapDocument {
  if (!isRecord(value)) {
    return createEmptyMapDocument(fallbackWidth, fallbackHeight);
  }

  const width = clampInteger(value.width, 4, 128, fallbackWidth);
  const height = clampInteger(value.height, 4, 128, fallbackHeight);
  const isLegacyMixedLayerDocument = value.version === 1;
  const layerValue = value.layers;
  if (Array.isArray(layerValue) && layerValue.every((layer) => isRecord(layer) && Array.isArray(layer.tiles))) {
    const layers = layerValue.map((layer, index) => normalizeLayer(layer, index, width, height));
    return { width, height, layers: ensureMinimumLayers(layers, width, height) };
  }

  const namedLayers = isRecord(layerValue) ? layerValue : {};
  const rawBase = Array.isArray(layerValue) ? layerValue[0] : namedLayers.base;
  const rawBorder = Array.isArray(layerValue) ? layerValue[1] : namedLayers.border;
  const rawItems = Array.isArray(layerValue) ? layerValue[2] : namedLayers.items;
  const first = createEmptyMapLayer("00", width, height);
  first.tiles = normalizeTiles(rawBase, width * height, isLegacyMixedLayerDocument);
  first.border = normalizeBorder(rawBorder, width * height);
  first.items = normalizeItems(rawItems, width, height);
  return { width, height, layers: ensureMinimumLayers([first], width, height) };
}

function ensureMinimumLayers(layers: MapLayer[], width: number, height: number) {
  const result = [...layers];
  for (const id of DEFAULT_LAYER_IDS) {
    if (!result.some((layer) => layer.id === id)) {
      result.push(createEmptyMapLayer(id, width, height));
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeLayer(value: Record<string, unknown>, index: number, width: number, height: number): MapLayer {
  const id = typeof value.id === "string" && value.id ? value.id : String(index).padStart(2, "0");
  const layer = createEmptyMapLayer(id, width, height);
  layer.name = typeof value.name === "string" && value.name ? value.name : id;
  layer.tiles = normalizeTiles(value.tiles, width * height, false);
  layer.border = normalizeBorder(value.border, width * height);
  layer.items = normalizeItems(value.items, width, height);
  return layer;
}

function normalizeTiles(value: unknown, length: number, legacyMixed: boolean) {
  return Array.from({ length }, (_, index) => {
    const label = Array.isArray(value) ? value[index] : undefined;
    return typeof label === "number" && label >= 1 && label <= 162 && !(legacyMixed && WOOD_BORDER_LABEL_SET.has(label))
      ? Math.floor(label)
      : null;
  });
}

function normalizeBorder(value: unknown, length: number) {
  return Array.from({ length }, (_, index) => {
    const label = Array.isArray(value) ? value[index] : undefined;
    return typeof label === "number" && WOOD_BORDER_LABEL_SET.has(label) ? Math.floor(label) : null;
  });
}

function normalizeItems(value: unknown, width: number, height: number): MapItem[] {
  return Array.isArray(value)
    ? value.flatMap((item, index) => {
      if (!isRecord(item) || typeof item.assetPath !== "string") return [];
        const itemWidth = clampInteger(item.width, 1, width, 1);
        const itemHeight = clampInteger(item.height, 1, height, 1);
        return [{
          id: typeof item.id === "string" ? item.id : `item-${index.toString(36)}`,
          assetPath: normalizeAssetPath(item.assetPath),
          x: clampNumber(item.x, 0, width - itemWidth, 0),
          y: clampNumber(item.y, 0, height - itemHeight, 0),
          width: itemWidth,
          height: itemHeight,
          sourceWidth: clampInteger(item.sourceWidth, 1, 4096, itemWidth * 16),
          sourceHeight: clampInteger(item.sourceHeight, 1, 4096, itemHeight * 16),
          ...(typeof item.rotation === "number" ? { rotation: item.rotation } : {}),
          ...(typeof item.scale === "number" ? { scale: item.scale } : {}),
        }];
      })
    : [];
}

export function normalizeAssetPath(assetPath: string) {
  const folder = assetPath.split("/")[1];
  return assetPath.startsWith("/assets/") || !MOVED_ASSET_FOLDERS.has(folder)
    ? assetPath
    : `/assets${assetPath}`;
}

export function applyWoodBorder(document: MapDocument, layerId: string): MapDocument {
  const layer = document.layers.find((candidate) => candidate.id === layerId) ?? document.layers[0];
  if (!layer) return document;
  const border = Array.from({ length: document.width * document.height }, () => null as number | null);
  const occupied = layer.tiles.map((label) => label !== null);

  for (let y = 0; y < document.height; y += 1) {
    for (let x = 0; x < document.width; x += 1) {
      const index = y * document.width + x;

      if (occupied[index]) {
        continue;
      }

      const neighbors = borderNeighbors(occupied, document.width, document.height, x, y);
      if (Object.values(neighbors).some(Boolean)) {
        border[index] = borderLabelForNeighbors(neighbors);
      }
    }
  }

  return {
    ...document,
    layers: document.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, border } : candidate),
  };
}

export function clearWoodBorder(document: MapDocument, layerId: string): MapDocument {
  const layer = document.layers.find((candidate) => candidate.id === layerId);
  if (!layer) return document;
  const border = layer.border.map(() => null);

  return {
    ...document,
    layers: document.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, border } : candidate),
  };
}

export type MapPoint = { x: number; y: number };
export type RegionRectangleTile = { point: MapPoint; label: number };

/**
 * Returns the atlas tile for every cell in a rectangle. Each preset uses only
 * the four solid columns assigned to that region in MAP.md. The selected role
 * controls the atlas row band, matching the wall/floor split documented there;
 * the separate wood-border layer owns edge and corner tiles.
 */
export function regionRectangleTiles(
  start: MapPoint,
  end: MapPoint,
  region: MapRegion,
  role: TileRole,
): RegionRectangleTile[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const rows = RECTANGLE_TILE_ROWS[region][role];
  const tiles: RegionRectangleTile[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const localX = x - minX;
      const localY = y - minY;
      const tileRow = rectangleRowForDepth(
        rows,
        localY,
        height,
        region,
        role,
      );
      const rectangleColumns =
        region === 4 && role === "floor" && tileRow[0] === 122
          ? [122, 123, 123, 125]
          : tileRow;
      const label = rectangleColumnForWidth(
        rectangleColumns,
        localX,
        width,
      );
      tiles.push({
        point: { x, y },
        label,
      });
    }
  }

  return tiles;
}

function rectangleRowForDepth(
  rows: readonly (readonly number[])[],
  depth: number,
  height: number,
  region: MapRegion,
  role: TileRole,
) {
  if (role === "wall" && region === 4 && height > rows.length) {
    const bottomDepth = depth - 1;
    const bottomHeight = height - 1;
    if (depth === 0) {
      return rows[0];
    }
    if (bottomDepth === bottomHeight - 1) {
      return rows[rows.length - 1];
    }
    if (bottomDepth === 0) {
      return rows[1];
    }
    return rows[2];
  }

  if (role === "wall" && region === 2 && height > rows.length) {
    const fixedBottomHeight = 2;
    const expandableHeight = height - fixedBottomHeight;
    if (depth === 0) {
      return rows[0];
    }
    if (depth < expandableHeight) {
      return rows[1];
    }
    return rows[2 + depth - expandableHeight];
  }

  if (height <= 1) {
    return rows[0];
  }
  if (depth === 0) {
    return rows[0];
  }
  if (depth === height - 1) {
    return rows[rows.length - 1];
  }

  const interiorRows = rows.slice(1, -1);
  return interiorRows[(depth - 1) % interiorRows.length];
}

function rectangleColumnForWidth(
  columns: readonly number[],
  position: number,
  width: number,
) {
  if (width <= 1) {
    return columns[0];
  }
  if (position === 0) {
    return columns[0];
  }
  if (position === width - 1) {
    return columns[columns.length - 1];
  }

  const interiorColumns = columns.slice(1, -1);
  return interiorColumns[(position - 1) % interiorColumns.length];
}

export function paintRegionRectangle(
  document: MapDocument,
  start: MapPoint,
  end: MapPoint,
  region: MapRegion,
  role: TileRole,
  layerId = "00",
): MapDocument {
  const layer = document.layers.find((candidate) => candidate.id === layerId) ?? document.layers[0];
  if (!layer) return document;
  const tiles = [...layer.tiles];
  const border = [...layer.border];

  for (const { point, label } of regionRectangleTiles(start, end, region, role)) {
    if (
      point.x < 0 ||
      point.x >= document.width ||
      point.y < 0 ||
      point.y >= document.height
    ) {
      continue;
    }

    const index = point.y * document.width + point.x;
    tiles[index] = label;
    border[index] = null;
  }

  return {
    ...document,
    layers: document.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, tiles, border } : candidate),
  };
}

export function createRandomLayoutMap(
  width = DRAW_MAP_WIDTH,
  height = DRAW_MAP_HEIGHT,
  seed = Date.now(),
): MapDocument {
  const random = mulberry32(seed);
  const occupancy = Array.from({ length: width * height }, () => false);
  const regions: Array<MapRegion | null> = Array.from(
    { length: width * height },
    () => null,
  );
  const rooms: RandomRoom[] = [];
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);
  const slots = [
    { minX: 1, maxX: halfWidth - 1, minY: 1, maxY: halfHeight - 1 },
    { minX: halfWidth, maxX: width - 2, minY: 1, maxY: halfHeight - 1 },
    { minX: 1, maxX: halfWidth - 1, minY: halfHeight, maxY: height - 2 },
    { minX: halfWidth, maxX: width - 2, minY: halfHeight, maxY: height - 2 },
  ];

  for (const [index, slot] of slots.entries()) {
    const roomWidth = randomInteger(
      random,
      7,
      Math.min(11, slot.maxX - slot.minX + 1),
    );
    const roomHeight = randomInteger(
      random,
      5,
      Math.min(7, slot.maxY - slot.minY + 1),
    );
    const room = {
      x: randomInteger(random, slot.minX, slot.maxX - roomWidth + 1),
      y: randomInteger(random, slot.minY, slot.maxY - roomHeight + 1),
      width: roomWidth,
      height: roomHeight,
      region: index % 2 === 0 ? 2 : 3,
    } satisfies RandomRoom;
    rooms.push(room);
    carveRectangle(room, occupancy, regions, width);
  }

  connectRooms(rooms[0], rooms[1], random, occupancy, regions, width, height);
  connectRooms(rooms[1], rooms[3], random, occupancy, regions, width, height);
  connectRooms(rooms[3], rooms[2], random, occupancy, regions, width, height);

  const base = occupancy.map((occupied, index) => {
    if (!occupied) {
      return null;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    const verticalDepth = verticalDepthFromTop(occupancy, width, x, y);
    const roleRows = verticalDepth < WALL_ROWS.length ? WALL_ROWS : FLOOR_ROWS;
    const region = regions[index] ?? 2;
    const hasWestNeighbor = isOccupiedAt(occupancy, width, x - 1, y);
    const hasEastNeighbor = isOccupiedAt(occupancy, width, x + 1, y);
    const columns = !hasWestNeighbor
      ? [1]
      : !hasEastNeighbor
        ? [18]
        : SOLID_REGION_COLUMNS[region];
    const sheetColumn = columns[x % columns.length];
    const rowOffset =
      verticalDepth < WALL_ROWS.length
        ? verticalDepth
        : verticalDepth - WALL_ROWS.length;
    const sheetRow = roleRows[rowOffset % roleRows.length];
    return (sheetRow - 1) * 18 + sheetColumn;
  });

  return {
    width,
    height,
    layers: createEmptyMapDocument(width, height).layers.map((layer, index) =>
      index === 0 ? { ...layer, tiles: base } : layer,
    ),
  };
}

type RandomRoom = {
  x: number;
  y: number;
  width: number;
  height: number;
  region: MapRegion;
};

function connectRooms(
  first: RandomRoom,
  second: RandomRoom,
  random: () => number,
  occupancy: boolean[],
  regions: Array<MapRegion | null>,
  width: number,
  height: number,
) {
  const corridorRegion = first.region;
  const corridorWidth = randomInteger(random, 2, 3);
  const firstCenterX = first.x + Math.floor(first.width / 2);
  const firstCenterY = first.y + Math.floor(first.height / 2);
  const secondCenterX = second.x + Math.floor(second.width / 2);
  const secondCenterY = second.y + Math.floor(second.height / 2);
  const runsLeftToRight = first.x < second.x;
  const runsTopToBottom = first.y < second.y;

  if (Math.abs(second.x - first.x) >= Math.abs(second.y - first.y)) {
    const firstAnchor = {
      x: runsLeftToRight ? first.x + first.width - 1 : first.x,
      y: firstCenterY,
    };
    const secondAnchor = {
      x: runsLeftToRight ? second.x : second.x + second.width - 1,
      y: secondCenterY,
    };
    const pivotX = Math.floor((firstAnchor.x + secondAnchor.x) / 2);

    carveCorridor(
      firstAnchor,
      { x: pivotX, y: firstAnchor.y },
      corridorWidth,
      corridorRegion,
      occupancy,
      regions,
      width,
      height,
    );
    carveCorridor(
      { x: pivotX, y: firstAnchor.y },
      { x: pivotX, y: secondAnchor.y },
      corridorWidth,
      corridorRegion,
      occupancy,
      regions,
      width,
      height,
    );
    carveCorridor(
      { x: pivotX, y: secondAnchor.y },
      secondAnchor,
      corridorWidth,
      corridorRegion,
      occupancy,
      regions,
      width,
      height,
    );
  } else {
    const firstAnchor = {
      x: firstCenterX,
      y: runsTopToBottom ? first.y + first.height - 1 : first.y,
    };
    const secondAnchor = {
      x: secondCenterX,
      y: runsTopToBottom ? second.y : second.y + second.height - 1,
    };
    const pivotY = Math.floor((firstAnchor.y + secondAnchor.y) / 2);

    carveCorridor(
      firstAnchor,
      { x: firstAnchor.x, y: pivotY },
      corridorWidth,
      corridorRegion,
      occupancy,
      regions,
      width,
      height,
    );
    carveCorridor(
      { x: firstAnchor.x, y: pivotY },
      { x: secondAnchor.x, y: pivotY },
      corridorWidth,
      corridorRegion,
      occupancy,
      regions,
      width,
      height,
    );
    carveCorridor(
      { x: secondAnchor.x, y: pivotY },
      secondAnchor,
      corridorWidth,
      corridorRegion,
      occupancy,
      regions,
      width,
      height,
    );
  }
}

function carveRectangle(
  room: RandomRoom,
  occupancy: boolean[],
  regions: Array<MapRegion | null>,
  width: number,
) {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      occupancy[y * width + x] = true;
      regions[y * width + x] = room.region;
    }
  }
}

function carveCorridor(
  first: { x: number; y: number },
  second: { x: number; y: number },
  corridorWidth: number,
  region: MapRegion,
  occupancy: boolean[],
  regions: Array<MapRegion | null>,
  width: number,
  height: number,
) {
  const horizontal = first.y === second.y;
  const start = horizontal
    ? Math.min(first.x, second.x)
    : Math.min(first.y, second.y);
  const end = horizontal
    ? Math.max(first.x, second.x)
    : Math.max(first.y, second.y);

  for (let offset = start; offset <= end; offset += 1) {
    for (let thickness = 0; thickness < corridorWidth; thickness += 1) {
      const x = horizontal
        ? offset
        : first.x + thickness - Math.floor(corridorWidth / 2);
      const y = horizontal
        ? first.y + thickness - Math.floor(corridorWidth / 2)
        : offset;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        occupancy[y * width + x] = true;
        regions[y * width + x] = region;
      }
    }
  }
}

function borderNeighbors(
  occupied: boolean[],
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const at = (neighborX: number, neighborY: number) =>
    neighborX >= 0 &&
    neighborX < width &&
    neighborY >= 0 &&
    neighborY < height
      ? occupied[neighborY * width + neighborX]
      : false;

  return {
    north: at(x, y - 1),
    south: at(x, y + 1),
    west: at(x - 1, y),
    east: at(x + 1, y),
    northWest: at(x - 1, y - 1),
    northEast: at(x + 1, y - 1),
    southWest: at(x - 1, y + 1),
    southEast: at(x + 1, y + 1),
  };
}

function borderLabelForNeighbors(neighbors: ReturnType<typeof borderNeighbors>) {
  const {
    north,
    south,
    west,
    east,
    northWest,
    northEast,
    southWest,
    southEast,
  } = neighbors;

  if (south && southWest && !southEast) return 17;
  if (east && northEast && !southEast) return 127;
  if (west && northWest && !southWest) return 144;
  if (north && northWest && !northEast) return 161;

  if (!north && !south && !west && !east) {
    if (southEast) return 1;
    if (southWest) return 18;
    if (northEast) return 145;
    if (northWest) return 162;
  }

  if (south) return 2;
  if (west) return 36;
  if (east) return 19;
  if (north) return 146;
  if (southEast) return 1;
  if (southWest) return 18;
  if (northEast) return 145;
  return 162;
}

function verticalDepthFromTop(
  occupancy: boolean[],
  width: number,
  x: number,
  y: number,
) {
  let depth = 0;
  for (let row = y - 1; row >= 0 && occupancy[row * width + x]; row -= 1) {
    depth += 1;
  }
  return depth;
}

function isOccupiedAt(
  occupancy: boolean[],
  width: number,
  x: number,
  y: number,
) {
  return x >= 0 && y >= 0 && x < width && y < occupancy.length / width
    ? occupancy[y * width + x]
    : false;
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function randomInteger(random: () => number, min: number, max: number) {
  return min + Math.floor(random() * (max - min + 1));
}

function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
