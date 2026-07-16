import { normalizeMapDocument, type MapDocument } from "./editor";

const MAX_MAP_NAME_LENGTH = 120;
const MAX_MAP_DIMENSION = 128;

export function validateMapData(value: unknown): MapDocument {
  if (!isRecord(value)) {
    throw new Error("Map data must be an object.");
  }

  const width = requiredDimension(value.width, "width");
  const height = requiredDimension(value.height, "height");
  const layers = value.layers;
  if (!Array.isArray(layers) || layers.length < 2) {
    throw new Error("Map data must include at least layers 00 and 01.");
  }

  const expectedCellCount = width * height;
  for (const [index, layer] of layers.entries()) {
    if (!isRecord(layer) || typeof layer.id !== "string" || typeof layer.name !== "string") {
      throw new Error(`layers[${index}] must include an id and name.`);
    }
    validateTileLayer(layer.tiles, expectedCellCount, `layers[${index}].tiles`);
    validateTileLayer(layer.border, expectedCellCount, `layers[${index}].border`);
    validateItems(layer.items, width, height, `layers[${index}].items`);
  }

  return normalizeMapDocument({ width, height, layers });
}

export function requiredMapName(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Map name is required.");
  }

  const name = value.trim();
  if (!name) {
    throw new Error("Map name is required.");
  }
  if (name.length > MAX_MAP_NAME_LENGTH) {
    throw new Error(`Map name must be ${MAX_MAP_NAME_LENGTH} characters or fewer.`);
  }
  return name;
}

function validateTileLayer(value: unknown, expectedLength: number, label: string) {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(`${label} must contain ${expectedLength} cells.`);
  }

  for (const tile of value) {
    if (tile !== null && (!Number.isInteger(tile) || tile < 1 || tile > 162)) {
      throw new Error(`${label} contains an invalid atlas tile.`);
    }
  }
}

function validateItems(value: unknown, width: number, height: number, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an item array.`);
  }

  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || typeof item.assetPath !== "string" || !item.assetPath.startsWith("/")) {
      throw new Error(`${label}[${index}] must reference a public asset path.`);
    }
    if (!finiteNumber(item.x) || item.x < 0 || item.x >= width) {
      throw new Error(`${label}[${index}].x is outside the map.`);
    }
    if (!finiteNumber(item.y) || item.y < 0 || item.y >= height) {
      throw new Error(`${label}[${index}].y is outside the map.`);
    }
    if (
      !integerInRange(item.width, 1, width) ||
      !integerInRange(item.height, 1, height) ||
      item.x + item.width > width ||
      item.y + item.height > height
    ) {
      throw new Error(`${label}[${index}] must include a valid grid size.`);
    }
    if (item.rotation !== undefined && !finiteNumber(item.rotation)) {
      throw new Error(`${label}[${index}].rotation must be a finite number.`);
    }
    if (item.scale !== undefined && (!finiteNumber(item.scale) || item.scale <= 0)) {
      throw new Error(`${label}[${index}].scale must be greater than zero.`);
    }
  }
}

function requiredDimension(value: unknown, label: string) {
  if (!integerInRange(value, 4, MAX_MAP_DIMENSION)) {
    throw new Error(`${label} must be an integer between 4 and ${MAX_MAP_DIMENSION}.`);
  }
  return value;
}

function integerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
