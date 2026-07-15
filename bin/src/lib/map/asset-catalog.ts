import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { CATALOG_OVERRIDES } from "./assets/index";
import { playerWorldAnimations } from "./assets/player";
import { filenameKey, rowAnimations } from "./animation-data";
import type { CatalogAnimationContext, CatalogAssetKind, CatalogOverride, SpriteAnimation, SpriteBeingKind, SpriteEntityKind, SpriteOrientation } from "./sprite-types";

export type CatalogAsset = {
  key: string;
  label: string;
  category: string;
  type: string;
  relativePath: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  animations: SpriteAnimation[];
  kind: CatalogAssetKind;
  preview?: "cells" | "animation";
  note?: string;
  entityKind?: SpriteEntityKind;
  beingKind?: SpriteBeingKind;
  orientation?: SpriteOrientation;
};

export type MapAsset = CatalogAsset & { entityKind: SpriteEntityKind };

type MapAssetRegistration = {
  relativePath: string;
  key: string;
  entityKind: SpriteEntityKind;
  beingKind?: SpriteBeingKind;
  orientation?: SpriteOrientation;
};

/** The only map-specific registry. All geometry, frames, and URLs come from the discovered catalog below. */
const MAP_ASSET_REGISTRY: MapAssetRegistration[] = [
  { relativePath: "Animals/Goose/Goose_01.png", key: "goose", entityKind: "being", beingKind: "animal", orientation: "left" },
  { relativePath: "Animals/Cow/Cow_01.png", key: "cow", entityKind: "being", beingKind: "animal", orientation: "left" },
  { relativePath: "NPCs (Premade)/Lumberjack_Jack.png", key: "lumberjack", entityKind: "being", beingKind: "npc", orientation: "right" },
  { relativePath: "Outdoor decoration/barrels.png", key: "barrels", entityKind: "object" },
  { relativePath: "Outdoor decoration/Flowers.png", key: "flowers", entityKind: "object" },
  { relativePath: "Outdoor decoration/Outdoor_Decor_Animations/Flower_Animations/Not_Potted/Flowers_1_Anim.png", key: "flowers-anim", entityKind: "object" },
  { relativePath: "Outdoor decoration/Outdoor_Decor_Animations/Flower_Animations/Potted/Flowers_1_Potted_Anim.png", key: "flowers-potted-anim", entityKind: "object" },
  { relativePath: "Outdoor decoration/Outdoor_Decor_Animations/Grass_Animations/Flower_Grass_1_Anim.png", key: "flower-grass", entityKind: "object" },
  { relativePath: "Player/Player_Base/Player_Base_animations.png", key: "player-base", entityKind: "being", beingKind: "player", orientation: "right" },
];

const mapRegistrationByPath = new Map(MAP_ASSET_REGISTRY.map((registration) => [registration.relativePath, registration]));
const root = path.join(process.cwd(), "public", "Cute_Fantasy");

function findOverride(relativePath: string): CatalogOverride | undefined {
  return CATALOG_OVERRIDES.find((override) => override.matches(relativePath));
}

function pngSize(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function occupiedFrames(filePath: string, width: number, height: number, frameWidth: number, frameHeight: number) {
  const buffer = fs.readFileSync(filePath);
  let offset = 8;
  let compressed = Buffer.alloc(0);
  let colorType = 6;
  let bitDepth = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") compressed = Buffer.concat([compressed, data]);
    offset += length + 12;
  }
  if (bitDepth !== 8 || colorType !== 6) return [] as number[][];
  const raw = inflateSync(compressed);
  const stride = width * 4;
  const rows: Uint8Array[] = [];
  let rawOffset = 0;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const current = new Uint8Array(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? current[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      if (filter === 1) current[x] = (current[x] + left) & 255;
      else if (filter === 2) current[x] = (current[x] + up) & 255;
      else if (filter === 3) current[x] = (current[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const estimate = left + up - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const upDistance = Math.abs(estimate - up);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        const predictor = leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left : upDistance <= upperLeftDistance ? up : upperLeft;
        current[x] = (current[x] + predictor) & 255;
      }
    }
    rows.push(current);
    previous = current;
  }
  const columns = Math.floor(width / frameWidth);
  const frameRows: number[][] = [];
  for (let row = 0; row < Math.floor(height / frameHeight); row += 1) {
    const frames: number[] = [];
    for (let column = 0; column < columns; column += 1) {
      let occupied = false;
      for (let y = row * frameHeight; y < Math.min((row + 1) * frameHeight, height) && !occupied; y += 1) {
        for (let x = column * frameWidth; x < Math.min((column + 1) * frameWidth, width); x += 1) {
          if (rows[y][x * 4 + 3] > 16) { occupied = true; break; }
        }
      }
      if (occupied) frames.push(column);
    }
    frameRows.push(frames);
  }
  return frameRows;
}

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : entry.name.endsWith(".png") ? [fullPath] : [];
  });
}

function titleFromFile(filePath: string) {
  return path.basename(filePath, ".png").replaceAll("_", " ").replaceAll("-", " ");
}

function inferFrameSize(relativePath: string, width: number, height: number) {
  const parts = relativePath.split(path.sep);
  const category = parts[0];
  const isAnimation = relativePath.includes("Animations") || /_Anim\.png$/i.test(relativePath);
  let inferred: { frameWidth: number; frameHeight: number; kind: CatalogAssetKind; note?: string };

  if (category === "NPCs (Premade)" || category === "Player") {
    inferred = { frameWidth: 64, frameHeight: 64, kind: "layer" };
  } else if (category === "Animals" || category === "Enemies") {
    if (/Bee_Flying|Butterfly/i.test(relativePath)) inferred = { frameWidth: 16, frameHeight: 16, kind: "animation" };
    else if (/Bee_Hive/i.test(relativePath)) inferred = { frameWidth: 16, frameHeight: 16, kind: "composite-object" };
    else if (/Bee_Nest/i.test(relativePath)) inferred = { frameWidth: 32, frameHeight: 48, kind: "composite-object" };
    else if (/Slime\//i.test(relativePath)) inferred = { frameWidth: width, frameHeight: height, kind: "composite-object", note: "Mixed-size bands; requires explicit source rectangles rather than one Phaser grid." };
    else inferred = { frameWidth: 32, frameHeight: 32, kind: "animation" };
  } else if (category === "Icons" || category === "Tiles" || category === "Crops") {
    if (category === "Crops" && /Fruit_Trees_Fruit_Objects/i.test(relativePath)) inferred = { frameWidth: 16, frameHeight: 16, kind: "animation" };
    else if (category === "Crops") inferred = { frameWidth: width, frameHeight: height, kind: "composite-object" };
    else inferred = { frameWidth: 16, frameHeight: 16, kind: category === "Icons" ? "icon-atlas" : "tile-atlas" };
  } else if (isAnimation) {
    inferred = { frameWidth: relativePath.includes("Break_Animations") ? 48 : 16, frameHeight: relativePath.includes("Break_Animations") ? 48 : 16, kind: "animation" };
  } else if (category === "Trees") {
    inferred = /Particle/i.test(relativePath) ? { frameWidth: 16, frameHeight: 16, kind: "composite-object" } : { frameWidth: width, frameHeight: height, kind: "composite-object" };
  } else if (category === "Buildings") {
    inferred = { frameWidth: width, frameHeight: height, kind: "composite-object" };
  } else if (category === "Weather effects") {
    if (/Rain_Drop_Impact|Wind_Anim/i.test(relativePath)) inferred = { frameWidth: 16, frameHeight: 16, kind: "animation" };
    else inferred = { frameWidth: width, frameHeight: height, kind: "composite-object" };
  } else if (category === "Outdoor decoration") {
    inferred = { frameWidth: width, frameHeight: height, kind: "composite-object" };
  } else if (category === "Other") {
    inferred = { frameWidth: 16, frameHeight: 16, kind: "animation" };
  } else {
    inferred = { frameWidth: width, frameHeight: height, kind: "composite-object" };
  }

  const override = findOverride(relativePath);
  return {
    ...inferred,
    frameWidth: override?.frameWidth ?? inferred.frameWidth,
    frameHeight: override?.frameHeight ?? inferred.frameHeight,
    kind: override?.kind ?? inferred.kind,
  };
}

function defaultAnimationsFor(relativePath: string, category: string, type: string, rows: number, columns: number, occupied?: number[][]): SpriteAnimation[] {
  const key = `catalog-${filenameKey(relativePath)}`;
  if (category === "NPCs (Premade)") {
    return rowAnimations(key, Array.from({ length: rows }, (_, row) => `action · row ${row}`), columns, occupied);
  }
  if (category === "Player") {
    return rowAnimations(key, Array.from({ length: rows }, (_, row) => `UNLABELED PLAYER ROW ${String(row).padStart(2, "0")}`), columns, occupied);
  }
  if (category === "Animals" || category === "Enemies") {
    const directions = ["down", "up", "side", "alternate side"];
    return rowAnimations(key, Array.from({ length: rows }, (_, row) => `${type} · ${directions[Math.floor(row / 2)] ?? `action row ${row}`} ${row % 2 ? "motion" : "idle"}`), columns, occupied);
  }
  return rowAnimations(key, Array.from({ length: rows }, (_, row) => `${type} · row ${row + 1}`), columns, occupied);
}

function isMapAsset(asset: CatalogAsset): asset is MapAsset {
  return Boolean(asset.entityKind);
}

export function getAssetCatalog(): CatalogAsset[] {
  return walk(root).sort().map((filePath, index) => {
    const relativePath = path.relative(root, filePath);
    const parts = relativePath.split(path.sep);
    const category = parts[0];
    const type = parts.length > 2 ? parts[1] : path.basename(category);
    const { width, height } = pngSize(filePath);
    const geometry = inferFrameSize(relativePath, width, height);
    const columns = Math.floor(width / geometry.frameWidth);
    const rows = Math.floor(height / geometry.frameHeight);
    const shouldInspectOccupancy = geometry.kind === "animation" || geometry.kind === "tile-atlas" || category === "NPCs (Premade)" || category === "Player";
    const occupied = shouldInspectOccupancy ? occupiedFrames(filePath, width, height, geometry.frameWidth, geometry.frameHeight) : undefined;
    const context: CatalogAnimationContext = { relativePath, columns, rows, occupied };
    const override = findOverride(relativePath);
    const customAnimations = override?.createAnimations?.(context);
    const animations = customAnimations ?? defaultAnimationsFor(relativePath, category, titleFromFile(filePath), rows, columns, occupied);
    const registration = mapRegistrationByPath.get(relativePath);
    return {
      key: registration?.key ?? `catalog-${index}`,
      label: titleFromFile(filePath),
      category,
      type,
      relativePath,
      path: `/Cute_Fantasy/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`,
      frameWidth: geometry.frameWidth,
      frameHeight: geometry.frameHeight,
      columns,
      rows,
      animations,
      kind: geometry.kind,
      preview: override?.preview ?? (geometry.kind === "animation" || category === "NPCs (Premade)" || category === "Player" ? "animation" : undefined),
      note: override?.note ?? geometry.note,
      entityKind: registration?.entityKind,
      beingKind: registration?.beingKind,
      orientation: registration?.orientation,
    };
  });
}

export function getMapAssets(catalog = getAssetCatalog()): MapAsset[] {
  const catalogByPath = new Map(catalog.map((asset) => [asset.relativePath, asset]));
  return MAP_ASSET_REGISTRY.flatMap((registration) => {
    const asset = catalogByPath.get(registration.relativePath);
    if (!asset || !isMapAsset(asset)) return [];
    return [{ ...asset, animations: asset.key === "player-base" ? playerWorldAnimations(asset.animations) : asset.animations }];
  });
}
