"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Package,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type ImageInfo = {
  height: number;
  name: string;
  src: string;
  width: number;
};

type PixelPoint = {
  x: number;
  y: number;
};

type PixelSelection = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type ConcavityDirection = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type ConcavityPoint = {
  direction: ConcavityDirection;
  id: string;
  x: number;
  y: number;
};

type CropBox = PixelSelection & {
  autoName?: boolean;
  concavities?: ConcavityPoint[];
  id: string;
  name: string;
};

type ResizeHandle = "nw" | "ne" | "sw" | "se";

type DragState =
  | {
      kind: "draw";
      selection: PixelSelection;
      start: PixelPoint;
    }
  | {
      id: string;
      kind: "move";
      origin: PixelSelection;
      start: PixelPoint;
      wasSelected: boolean;
    }
  | {
      handle: ResizeHandle;
      id: string;
      kind: "resize";
      origin: PixelSelection;
      start: PixelPoint;
    };

type ZipSource = {
  data: Uint8Array;
  name: string;
};

type CachedBounds = {
  boxes: CropBox[];
  error: string | null;
  image: ImageInfo | null;
  selectedId: string | null;
};

type HistorySnapshot = {
  boxes: CropBox[];
  selectedConcavityId: string | null;
  selectedId: string | null;
};

const DEFAULT_BORDER_COLOR = "#f8e26a";
const MAX_BORDER_WIDTH = 8;
const MIN_COMPONENT_PIXELS = 8;
const STORAGE_KEY = "sapiens:asset-extract:bounds:v1";
const ZOOM_LEVELS = [0.5, 1, 2, 3, 4, 6, 8, 12, 16];
const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];
const CONCAVITY_DIRECTIONS: ConcavityDirection[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const CRC_TABLE = createCrcTable();

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createBoxId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function toCropFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^/.]+$/, "") || "extracted-image";

  return `${baseName}.png`;
}

function toZipFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^/.]+$/, "") || "extracted-objects";

  return `${baseName}-objects.zip`;
}

function sanitizeFilePart(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");

  return sanitized || fallback;
}

function getInitialZoom(width: number, height: number) {
  const largestSide = Math.max(width, height);

  if (largestSide <= 64) {
    return 8;
  }

  if (largestSide <= 160) {
    return 4;
  }

  if (largestSide <= 320) {
    return 2;
  }

  return 1;
}

function getNextZoom(currentZoom: number, direction: 1 | -1) {
  const closestIndex = ZOOM_LEVELS.reduce((bestIndex, zoom, index) => {
    const bestDistance = Math.abs(ZOOM_LEVELS[bestIndex] - currentZoom);
    const nextDistance = Math.abs(zoom - currentZoom);

    return nextDistance < bestDistance ? index : bestIndex;
  }, 0);
  const nextIndex = clamp(closestIndex + direction, 0, ZOOM_LEVELS.length - 1);

  return ZOOM_LEVELS[nextIndex];
}

function getNextConcavityDirection(direction: ConcavityDirection) {
  const index = CONCAVITY_DIRECTIONS.indexOf(direction);

  return CONCAVITY_DIRECTIONS[(index + 1) % CONCAVITY_DIRECTIONS.length];
}

function formatConcavityDirection(direction: ConcavityDirection) {
  return direction
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatConcavityPoint(point: ConcavityPoint) {
  return `${formatConcavityDirection(point.direction)} at local x ${point.x}, y ${point.y}`;
}

function makeSelection(start: PixelPoint, end: PixelPoint): PixelSelection {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x) + 1;
  const height = Math.abs(end.y - start.y) + 1;

  return { x, y, width, height };
}

function getReadingOrder(boxes: CropBox[]) {
  if (boxes.length === 0) {
    return [];
  }

  const heights = [...boxes].map((box) => box.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 1;
  const rowTolerance = Math.max(8, medianHeight * 0.75);
  const rows: { boxes: CropBox[]; centerY: number; top: number }[] = [];

  for (const box of [...boxes].sort(
    (a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x,
  )) {
    const centerY = box.y + box.height / 2;
    const row = rows.find(
      (candidate) => Math.abs(centerY - candidate.centerY) <= rowTolerance,
    );

    if (row) {
      row.boxes.push(box);
      row.centerY =
        row.boxes.reduce((sum, rowBox) => sum + rowBox.y + rowBox.height / 2, 0) /
        row.boxes.length;
      row.top = Math.min(row.top, box.y);
      continue;
    }

    rows.push({
      boxes: [box],
      centerY,
      top: box.y,
    });
  }

  return rows
    .sort((a, b) => a.centerY - b.centerY || a.top - b.top)
    .flatMap((row) =>
      row.boxes.sort(
        (a, b) => a.x + a.width / 2 - (b.x + b.width / 2) || a.y - b.y,
      ),
    );
}

function shouldAutoName(box: CropBox) {
  return box.autoName === true || /^\d+$/.test(box.name);
}

function applyReadingOrderNames(boxes: CropBox[]) {
  const orderedIds = new Map(
    getReadingOrder(boxes).map((box, index) => [
      box.id,
      String(index + 1).padStart(2, "0"),
    ]),
  );

  return boxes.map((box) =>
    shouldAutoName(box)
      ? {
          ...box,
          autoName: true,
          name: orderedIds.get(box.id) ?? box.name,
        }
      : box,
  );
}

function areBoxListsEqual(left: CropBox[], right: CropBox[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clampConcavities(box: CropBox): CropBox {
  if (!box.concavities?.length) {
    return box;
  }

  return {
    ...box,
    concavities: box.concavities.map((point) => ({
      ...point,
      x: clamp(point.x, 1, Math.max(1, box.width - 1)),
      y: clamp(point.y, 1, Math.max(1, box.height - 1)),
    })),
  };
}

function getConcavityRect(box: PixelSelection, point: ConcavityPoint) {
  const x = clamp(Math.round(point.x), 1, Math.max(1, box.width - 1));
  const y = clamp(Math.round(point.y), 1, Math.max(1, box.height - 1));

  switch (point.direction) {
    case "top-left":
      return { x: 0, y: 0, width: x, height: y };
    case "top-right":
      return { x, y: 0, width: box.width - x, height: y };
    case "bottom-left":
      return { x: 0, y, width: x, height: box.height - y };
    case "bottom-right":
      return { x, y, width: box.width - x, height: box.height - y };
  }
}

function getBoxEdges(box: PixelSelection) {
  return {
    bottom: box.y + box.height - 1,
    left: box.x,
    right: box.x + box.width - 1,
    top: box.y,
  };
}

function resizeBox(
  box: PixelSelection,
  handle: ResizeHandle,
  point: PixelPoint,
): PixelSelection {
  const edges = getBoxEdges(box);
  let { bottom, left, right, top } = edges;

  if (handle.includes("n")) {
    top = point.y;
  }

  if (handle.includes("s")) {
    bottom = point.y;
  }

  if (handle.includes("w")) {
    left = point.x;
  }

  if (handle.includes("e")) {
    right = point.x;
  }

  const nextLeft = Math.min(left, right);
  const nextRight = Math.max(left, right);
  const nextTop = Math.min(top, bottom);
  const nextBottom = Math.max(top, bottom);

  return {
    height: nextBottom - nextTop + 1,
    width: nextRight - nextLeft + 1,
    x: nextLeft,
    y: nextTop,
  };
}

function moveBox(
  box: PixelSelection,
  start: PixelPoint,
  point: PixelPoint,
  image: ImageInfo,
): PixelSelection {
  const dx = point.x - start.x;
  const dy = point.y - start.y;

  return {
    ...box,
    x: clamp(box.x + dx, 0, Math.max(0, image.width - box.width)),
    y: clamp(box.y + dy, 0, Math.max(0, image.height - box.height)),
  };
}

function clampBoxToImage(box: CropBox, image: ImageInfo): CropBox {
  const x = clamp(box.x, 0, Math.max(0, image.width - 1));
  const y = clamp(box.y, 0, Math.max(0, image.height - 1));

  return clampConcavities({
    ...box,
    height: clamp(box.height, 1, Math.max(1, image.height - y)),
    width: clamp(box.width, 1, Math.max(1, image.width - x)),
    x,
    y,
  });
}

function drawCropToCanvas(
  sourceImage: HTMLImageElement,
  selection: PixelSelection & { concavities?: ConcavityPoint[] },
  canvas: HTMLCanvasElement,
) {
  canvas.width = selection.width;
  canvas.height = selection.height;

  const context = canvas.getContext("2d");

  if (!context) {
    return false;
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(
    sourceImage,
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    0,
    0,
    selection.width,
    selection.height,
  );

  for (const point of selection.concavities ?? []) {
    const rect = getConcavityRect(selection, point);
    context.clearRect(rect.x, rect.y, rect.width, rect.height);
  }

  return true;
}

async function createCropBlob(
  sourceImage: HTMLImageElement,
  selection: PixelSelection & { concavities?: ConcavityPoint[] },
) {
  const canvas = document.createElement("canvas");

  if (!drawCropToCanvas(sourceImage, selection, canvas)) {
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
}

function getPixelIndex(x: number, y: number, width: number) {
  return y * width + x;
}

function colorDistance(
  data: Uint8ClampedArray,
  index: number,
  background: [number, number, number],
) {
  const offset = index * 4;

  return (
    Math.abs(data[offset] - background[0]) +
    Math.abs(data[offset + 1] - background[1]) +
    Math.abs(data[offset + 2] - background[2])
  );
}

function getBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const corners = [
    getPixelIndex(0, 0, width),
    getPixelIndex(width - 1, 0, width),
    getPixelIndex(0, height - 1, width),
    getPixelIndex(width - 1, height - 1, width),
  ];
  const totals = corners.reduce(
    (sum, index) => {
      const offset = index * 4;

      return [
        sum[0] + data[offset],
        sum[1] + data[offset + 1],
        sum[2] + data[offset + 2],
      ];
    },
    [0, 0, 0],
  );

  return [
    Math.round(totals[0] / corners.length),
    Math.round(totals[1] / corners.length),
    Math.round(totals[2] / corners.length),
  ];
}

function detectObjects(sourceImage: HTMLImageElement): CropBox[] {
  const width = sourceImage.naturalWidth;
  const height = sourceImage.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return [];
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(sourceImage, 0, 0, width, height);

  let data: Uint8ClampedArray;

  try {
    data = context.getImageData(0, 0, width, height).data;
  } catch {
    return [];
  }

  const background = getBackgroundColor(data, width, height);
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const hasTransparency = (() => {
    for (let index = 0; index < totalPixels; index += 1) {
      if (data[index * 4 + 3] < 245) {
        return true;
      }
    }

    return false;
  })();

  function isObjectPixel(index: number) {
    const alpha = data[index * 4 + 3];

    if (alpha <= 12) {
      return false;
    }

    if (hasTransparency) {
      return alpha > 12;
    }

    return colorDistance(data, index, background) > 36;
  }

  const boxes: PixelSelection[] = [];

  for (let index = 0; index < totalPixels; index += 1) {
    if (visited[index] || !isObjectPixel(index)) {
      continue;
    }

    const stack = [index];
    visited[index] = 1;
    let count = 0;
    let minX = index % width;
    let maxX = minX;
    let minY = Math.floor(index / width);
    let maxY = minY;

    while (stack.length > 0) {
      const current = stack.pop() ?? 0;
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1,
      ];

      for (const neighbor of neighbors) {
        if (
          neighbor >= 0 &&
          !visited[neighbor] &&
          isObjectPixel(neighbor)
        ) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }

    const box = {
      height: maxY - minY + 1,
      width: maxX - minX + 1,
      x: minX,
      y: minY,
    };
    const coversMostImage =
      box.width > width * 0.95 && box.height > height * 0.95;

    if (
      count >= MIN_COMPONENT_PIXELS &&
      box.width > 1 &&
      box.height > 1 &&
      !coversMostImage
    ) {
      boxes.push(box);
    }
  }

  return applyReadingOrderNames(
    boxes.map((box, index) => ({
      ...box,
      autoName: true,
      id: createBoxId(),
      name: String(index + 1).padStart(2, "0"),
    })),
  );
}

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createZipBlob(files: ZipSource[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const records: {
    crc: number;
    data: Uint8Array;
    nameBytes: Uint8Array;
    offset: number;
  }[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.data.byteLength, true);
    view.setUint32(22, file.data.byteLength, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, file.data);
    records.push({ crc, data: file.data, nameBytes, offset });
    offset += localHeader.byteLength + file.data.byteLength;
  }

  const centralOffset = offset;

  for (const record of records) {
    const centralHeader = new Uint8Array(46 + record.nameBytes.length);
    const view = new DataView(centralHeader.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, record.crc, true);
    view.setUint32(20, record.data.byteLength, true);
    view.setUint32(24, record.data.byteLength, true);
    view.setUint16(28, record.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, record.offset, true);
    centralHeader.set(record.nameBytes, 46);
    centralParts.push(centralHeader);
    offset += centralHeader.byteLength;
  }

  const centralSize = offset - centralOffset;
  const endRecord = new Uint8Array(22);
  const view = new DataView(endRecord.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, records.length, true);
  view.setUint16(10, records.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);

  const blobParts = [...localParts, ...centralParts, endRecord].map(
    (bytes) => {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);

      return copy.buffer as ArrayBuffer;
    },
  );

  return new Blob(blobParts, {
    type: "application/zip",
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("The selected image could not be read."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("The selected image could not be read."));
    });
    reader.readAsDataURL(file);
  });
}

function readCachedBounds(): CachedBounds {
  if (typeof window === "undefined") {
    return { boxes: [], error: null, image: null, selectedId: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { boxes: [], error: null, image: null, selectedId: null };
    }

    const saved = JSON.parse(raw) as {
      boxes?: CropBox[];
      image?: ImageInfo | null;
      selectedId?: string | null;
    };

    if (!Array.isArray(saved.boxes)) {
      return { boxes: [], error: null, image: null, selectedId: null };
    }

    return {
      boxes: saved.boxes,
      error: null,
      image: saved.image ?? null,
      selectedId: saved.selectedId ?? saved.boxes[0]?.id ?? null,
    };
  } catch {
    return {
      boxes: [],
      error: "Saved borders could not be read, so the cache was ignored.",
      image: null,
      selectedId: null,
    };
  }
}

export default function SlicePage() {
  const [cachedBounds] = useState(readCachedBounds);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [borderColor, setBorderColor] = useState(DEFAULT_BORDER_COLOR);
  const [borderWidth, setBorderWidth] = useState(1);
  const [concavityDirection, setConcavityDirection] =
    useState<ConcavityDirection>("top-left");
  const [cropBoxes, setCropBoxes] = useState<CropBox[]>(() =>
    applyReadingOrderNames(cachedBounds.boxes),
  );
  const [detectionNote, setDetectionNote] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [error, setError] = useState<string | null>(cachedBounds.error);
  const [future, setFuture] = useState<HistorySnapshot[]>([]);
  const [image, setImage] = useState<ImageInfo | null>(cachedBounds.image);
  const [past, setPast] = useState<HistorySnapshot[]>([]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [selectedConcavityId, setSelectedConcavityId] = useState<string | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    cachedBounds.selectedId,
  );
  const [tooltipStyle, setTooltipStyle] = useState<
    { left: string; top: string } | undefined
  >(undefined);
  const [zoom, setZoom] = useState(1);
  const dragHistoryRef = useRef<HistorySnapshot | null>(null);

  const selectedBox = useMemo(
    () => cropBoxes.find((box) => box.id === selectedId) ?? null,
    [cropBoxes, selectedId],
  );
  const selectedConcavity = useMemo(
    () =>
      selectedBox?.concavities?.find(
        (point) => point.id === selectedConcavityId,
      ) ?? null,
    [selectedBox, selectedConcavityId],
  );
  const boxNumberById = useMemo(
    () =>
      new Map(
        getReadingOrder(cropBoxes).map((box, index) => [
          box.id,
          String(index + 1).padStart(2, "0"),
        ]),
      ),
    [cropBoxes],
  );
  const draftSelection =
    dragState?.kind === "draw" ? dragState.selection : null;
  const borderWidthLimit = image
    ? Math.max(1, Math.min(MAX_BORDER_WIDTH, image.width, image.height))
    : MAX_BORDER_WIDTH;
  const scaledFrameStyle =
    image?.width && image.height
      ? {
          height: `${image.height * zoom}px`,
          width: `${image.width * zoom}px`,
        }
      : undefined;
  const nativeLayerStyle =
    image?.width && image.height
      ? {
          height: `${image.height}px`,
          transform: `scale(${zoom})`,
          width: `${image.width}px`,
        }
      : undefined;
  const positionTooltip = useCallback(
    (box: PixelSelection | null, zoomValue = zoom) => {
      if (!box || !imageRef.current || typeof window === "undefined") {
        setTooltipStyle(undefined);
        return;
      }

      const rect = imageRef.current.getBoundingClientRect();
      setTooltipStyle({
        left: `${clamp(
          rect.left + (box.x + box.width) * zoomValue + 12,
          12,
          Math.max(12, window.innerWidth - 276),
        )}px`,
        top: `${clamp(
          rect.top + box.y * zoomValue - 12,
          12,
          Math.max(12, window.innerHeight - 360),
        )}px`,
      });
    },
    [zoom],
  );

  const createHistorySnapshot = useCallback(
    (): HistorySnapshot => ({ boxes: cropBoxes, selectedConcavityId, selectedId }),
    [cropBoxes, selectedConcavityId, selectedId],
  );
  const recordHistory = useCallback(
    (snapshot = createHistorySnapshot()) => {
      setPast((currentPast) => [...currentPast, snapshot]);
      setFuture([]);
    },
    [createHistorySnapshot],
  );
  const splitSelectedBox = useCallback(() => {
    if (!selectedBox) {
      return;
    }

    const splitVertically = selectedBox.width >= selectedBox.height;
    const splitSize = splitVertically ? selectedBox.width : selectedBox.height;

    if (splitSize < 2) {
      return;
    }

    const firstSize = Math.floor(splitSize / 2);
    const secondBoxId = createBoxId();
    const baseBox = { ...selectedBox, concavities: undefined };
    const firstBox: CropBox = splitVertically
      ? { ...baseBox, width: firstSize }
      : { ...baseBox, height: firstSize };
    const secondBox: CropBox = splitVertically
      ? {
          ...baseBox,
          id: secondBoxId,
          name: "00",
          autoName: true,
          width: selectedBox.width - firstSize,
          x: selectedBox.x + firstSize,
        }
      : {
          ...baseBox,
          id: secondBoxId,
          name: "00",
          autoName: true,
          height: selectedBox.height - firstSize,
          y: selectedBox.y + firstSize,
        };
    const nextBoxes = applyReadingOrderNames(
      cropBoxes.flatMap((box) =>
        box.id === selectedBox.id ? [firstBox, secondBox] : [box],
      ),
    );

    recordHistory();
    setCropBoxes(nextBoxes);
    setSelectedId(selectedBox.id);
    setSelectedConcavityId(null);
    requestAnimationFrame(() => positionTooltip(firstBox));
  }, [cropBoxes, positionTooltip, recordHistory, selectedBox]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ boxes: cropBoxes, image, selectedId }),
      );
    } catch {
      // Large sheets can exceed localStorage limits; borders still work in-session.
    }
  }, [cropBoxes, image, selectedId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift" && !event.repeat) {
        event.preventDefault();
        const selectedPoint = cropBoxes
          .find((box) => box.id === selectedId)
          ?.concavities?.find((point) => point.id === selectedConcavityId);

        if (selectedPoint && selectedId) {
          const nextDirection = getNextConcavityDirection(
            selectedPoint.direction,
          );

          recordHistory();
          setCropBoxes((currentBoxes) =>
            currentBoxes.map((box) =>
              box.id === selectedId
                ? {
                    ...box,
                    concavities: box.concavities?.map((point) =>
                      point.id === selectedConcavityId
                        ? { ...point, direction: nextDirection }
                        : point,
                    ),
                  }
                : box,
            ),
          );
          setConcavityDirection(nextDirection);
          return;
        }

        setConcavityDirection((currentDirection) =>
          getNextConcavityDirection(currentDirection),
        );
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.isContentEditable ||
        Boolean(target?.closest("input, textarea, select"));

      if (isEditing) {
        return;
      }

      if ((event.key === "z" || event.key === "Z") && !event.repeat) {
        event.preventDefault();

        if (past.length === 0) {
          return;
        }

        const previous = past[past.length - 1];
        setPast(past.slice(0, -1));
        setFuture([...future, createHistorySnapshot()]);
        setCropBoxes(previous.boxes);
        setSelectedId(previous.selectedId);
        setSelectedConcavityId(previous.selectedConcavityId);
        setTooltipStyle(undefined);
        return;
      }

      if ((event.key === "x" || event.key === "X") && !event.repeat) {
        event.preventDefault();

        if (future.length === 0) {
          return;
        }

        const next = future[future.length - 1];
        setFuture(future.slice(0, -1));
        setPast([...past, createHistorySnapshot()]);
        setCropBoxes(next.boxes);
        setSelectedId(next.selectedId);
        setSelectedConcavityId(next.selectedConcavityId);
        setTooltipStyle(undefined);
        return;
      }

      if (event.key === "s" || event.key === "S") {
        if (selectedBox && !selectedConcavityId) {
          event.preventDefault();
          splitSelectedBox();
        }
        return;
      }

      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        const nextZoom = getNextZoom(zoom, 1);
        setZoom(nextZoom);
        requestAnimationFrame(() => positionTooltip(selectedBox, nextZoom));
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        const nextZoom = getNextZoom(zoom, -1);
        setZoom(nextZoom);
        requestAnimationFrame(() => positionTooltip(selectedBox, nextZoom));
      }

      if (event.key === "Tab" && cropBoxes.length > 0) {
        event.preventDefault();
        const orderedBoxes = getReadingOrder(cropBoxes);
        const selectedIndex = orderedBoxes.findIndex(
          (box) => box.id === selectedId,
        );
        const nextIndex = event.shiftKey
          ? selectedIndex <= 0
            ? orderedBoxes.length - 1
            : selectedIndex - 1
          : selectedIndex === -1 || selectedIndex === orderedBoxes.length - 1
            ? 0
            : selectedIndex + 1;
        const nextBox = orderedBoxes[nextIndex];

        setSelectedId(nextBox.id);
        requestAnimationFrame(() => positionTooltip(nextBox));
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedConcavityId &&
        selectedId
      ) {
        event.preventDefault();
        const idToDelete = selectedConcavityId;
        recordHistory();
        setCropBoxes((currentBoxes) =>
          currentBoxes.map((box) =>
            box.id === selectedId
              ? {
                  ...box,
                  concavities: box.concavities?.filter(
                    (point) => point.id !== idToDelete,
                  ),
                }
              : box,
          ),
        );
        setSelectedConcavityId(null);
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault();
        const idToDelete = selectedId;
        recordHistory();
        setCropBoxes((currentBoxes) =>
          applyReadingOrderNames(
            currentBoxes.filter((box) => box.id !== idToDelete),
          ),
        );
        setSelectedId(null);
        setSelectedConcavityId(null);
        setTooltipStyle(undefined);
      }
    }

    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [
    cropBoxes,
    createHistorySnapshot,
    future,
    past,
    positionTooltip,
    recordHistory,
    selectedBox,
    selectedConcavityId,
    selectedId,
    splitSelectedBox,
    zoom,
  ]);

  useEffect(() => {
    if (!selectedBox || !imageRef.current) {
      setPreviewSrc(null);
      return;
    }

    const canvas = document.createElement("canvas");

    if (!drawCropToCanvas(imageRef.current, selectedBox, canvas)) {
      setPreviewSrc(null);
      return;
    }

    setPreviewSrc(canvas.toDataURL("image/png"));
  }, [image?.src, selectedBox]);

  function getPixelPoint(event: React.PointerEvent<Element>) {
    if (!image || !imageRef.current || !image.width || !image.height) {
      return null;
    }

    const rect = imageRef.current.getBoundingClientRect();
    const x = clamp(
      Math.floor(((event.clientX - rect.left) / rect.width) * image.width),
      0,
      image.width - 1,
    );
    const y = clamp(
      Math.floor(((event.clientY - rect.top) / rect.height) * image.height),
      0,
      image.height - 1,
    );

    return { x, y };
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPG, WebP, or GIF image.");
      return;
    }

    try {
      const nextSrc = await readFileAsDataUrl(file);
      setDetectionNote(null);
      setError(null);
      setSelectedConcavityId(null);
      setTooltipStyle(undefined);
      setImage({
        height: 0,
        name: file.name,
        src: nextSrc,
        width: 0,
      });
    } catch {
      setError("The selected image could not be read.");
    } finally {
      input.value = "";
    }
  }

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalHeight, naturalWidth } = event.currentTarget;

    if (!naturalHeight || !naturalWidth) {
      setError("This image loaded without readable dimensions.");
      return;
    }

    const nextImage = image
      ? {
          ...image,
          height: naturalHeight,
          width: naturalWidth,
        }
      : {
          height: naturalHeight,
          name: "uploaded-image",
          src: event.currentTarget.src,
          width: naturalWidth,
        };

    setImage(nextImage);
    const nextZoom = getInitialZoom(naturalWidth, naturalHeight);
    setZoom(nextZoom);
    if (cropBoxes.length > 0) {
      const nextBoxes = applyReadingOrderNames(
        cropBoxes.map((box) => clampBoxToImage(box, nextImage)),
      );
      const nextSelectedBox =
        nextBoxes.find((box) => box.id === selectedId) ?? nextBoxes[0] ?? null;
      setCropBoxes(nextBoxes);
      setSelectedId((currentId) =>
        nextBoxes.some((box) => box.id === currentId)
          ? currentId
          : nextBoxes[0]?.id ?? null,
      );
      requestAnimationFrame(() => positionTooltip(nextSelectedBox, nextZoom));
      setDetectionNote(`Kept ${nextBoxes.length} cached borders.`);
      return;
    }

    const detectedBoxes = detectObjects(event.currentTarget);
    setCropBoxes(detectedBoxes);
    setSelectedId(detectedBoxes[0]?.id ?? null);
    requestAnimationFrame(() => positionTooltip(detectedBoxes[0] ?? null, nextZoom));
    setDetectionNote(
      detectedBoxes.length > 0
        ? `Detected ${detectedBoxes.length} possible objects.`
        : "No clear objects detected. Draw borders manually.",
    );
  }

  function zoomIn() {
    const nextZoom = getNextZoom(zoom, 1);
    setZoom(nextZoom);
    requestAnimationFrame(() => positionTooltip(selectedBox, nextZoom));
  }

  function zoomOut() {
    const nextZoom = getNextZoom(zoom, -1);
    setZoom(nextZoom);
    requestAnimationFrame(() => positionTooltip(selectedBox, nextZoom));
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleSmartDraw() {
    if (!imageRef.current) {
      setError("Upload a spritesheet before drawing borders.");
      return;
    }

    const detectedBoxes = detectObjects(imageRef.current);

    if (detectedBoxes.length === 0) {
      setDetectionNote("No clear objects detected. Existing borders kept.");
      return;
    }

    recordHistory();
    setCropBoxes(detectedBoxes);
    setSelectedId(detectedBoxes[0].id);
    setSelectedConcavityId(null);
    setTooltipStyle(undefined);
    requestAnimationFrame(() => positionTooltip(detectedBoxes[0]));
    setDetectionNote(`Drew ${detectedBoxes.length} detected borders.`);
  }

  function clearBorders() {
    if (cropBoxes.length === 0) {
      return;
    }

    recordHistory();
    setCropBoxes([]);
    setSelectedId(null);
    setSelectedConcavityId(null);
    setPreviewSrc(null);
    setTooltipStyle(undefined);
    setDetectionNote("Cleared all borders.");
  }

  function deleteBox(id: string) {
    if (!cropBoxes.some((box) => box.id === id)) {
      return;
    }

    const nextBoxes = applyReadingOrderNames(
      cropBoxes.filter((box) => box.id !== id),
    );
    recordHistory();
    setCropBoxes(nextBoxes);
    setSelectedId((currentId) => (currentId === id ? null : currentId));
    setSelectedConcavityId(null);
    setTooltipStyle(undefined);
  }

  function updateBoxName(id: string, name: string) {
    setCropBoxes((currentBoxes) =>
      currentBoxes.map((box) =>
        box.id === id ? { ...box, autoName: false, name } : box,
      ),
    );
  }

  function addConcavityPoint(box: CropBox, point: PixelPoint) {
    const localX = clamp(point.x - box.x, 1, Math.max(1, box.width - 1));
    const localY = clamp(point.y - box.y, 1, Math.max(1, box.height - 1));
    const pointId = createBoxId();

    setCropBoxes((currentBoxes) =>
      currentBoxes.map((currentBox) =>
        currentBox.id === box.id
          ? {
              ...currentBox,
              concavities: [
                ...(currentBox.concavities ?? []),
                {
                  direction: concavityDirection,
                  id: pointId,
                  x: localX,
                  y: localY,
                },
              ],
            }
          : currentBox,
      ),
    );
    setSelectedConcavityId(pointId);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const point = getPixelPoint(event);

    if (!point || !previewRef.current) {
      return;
    }

    previewRef.current.setPointerCapture(event.pointerId);
    dragHistoryRef.current = createHistorySnapshot();
    setDragState({
      kind: "draw",
      selection: makeSelection(point, point),
      start: point,
    });
    setSelectedId(null);
    setSelectedConcavityId(null);
    setTooltipStyle(undefined);
  }

  function startMove(event: React.PointerEvent, box: CropBox) {
    const point = getPixelPoint(event);

    if (!point || !previewRef.current) {
      return;
    }

    event.stopPropagation();
    previewRef.current.setPointerCapture(event.pointerId);
    const wasSelected = selectedId === box.id;
    dragHistoryRef.current = createHistorySnapshot();
    setSelectedId(box.id);
    if (!wasSelected) {
      setSelectedConcavityId(null);
    }
    positionTooltip(box);
    setDragState({
      id: box.id,
      kind: "move",
      origin: box,
      start: point,
      wasSelected,
    });
  }

  function startResize(
    event: React.PointerEvent,
    box: CropBox,
    handle: ResizeHandle,
  ) {
    const point = getPixelPoint(event);

    if (!point || !previewRef.current) {
      return;
    }

    event.stopPropagation();
    previewRef.current.setPointerCapture(event.pointerId);
    dragHistoryRef.current = createHistorySnapshot();
    setSelectedId(box.id);
    setSelectedConcavityId(null);
    positionTooltip(box);
    setDragState({
      handle,
      id: box.id,
      kind: "resize",
      origin: box,
      start: point,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState || !image) {
      return;
    }

    const point = getPixelPoint(event);

    if (!point) {
      return;
    }

    if (dragState.kind === "draw") {
      setDragState({
        ...dragState,
        selection: makeSelection(dragState.start, point),
      });
      return;
    }

    if (dragState.kind === "move") {
      const nextBox = moveBox(dragState.origin, dragState.start, point, image);
      positionTooltip(nextBox);
      setCropBoxes((currentBoxes) =>
        currentBoxes.map((box) =>
          box.id === dragState.id ? { ...box, ...nextBox } : box,
        ),
      );
      return;
    }

    const nextBox = resizeBox(dragState.origin, dragState.handle, point);
    positionTooltip(nextBox);
    setCropBoxes((currentBoxes) =>
      currentBoxes.map((box) =>
        box.id === dragState.id
          ? { ...box, ...clampBoxToImage({ ...box, ...nextBox }, image) }
          : box,
      ),
    );
  }

  function finishPointer(event: React.PointerEvent<HTMLDivElement>) {
    const point = getPixelPoint(event);
    const historyBeforeDrag = dragHistoryRef.current;

    if (previewRef.current?.hasPointerCapture(event.pointerId)) {
      previewRef.current.releasePointerCapture(event.pointerId);
    }

    if (dragState?.kind === "draw") {
      if (
        dragState.selection.width <= 1 &&
        dragState.selection.height <= 1
      ) {
        dragHistoryRef.current = null;
        setDragState(null);
        return;
      }

      const id = createBoxId();
      const box = {
        ...dragState.selection,
        autoName: true,
        id,
        name: "00",
      };
      if (historyBeforeDrag) {
        recordHistory(historyBeforeDrag);
      }
      setCropBoxes((currentBoxes) =>
        applyReadingOrderNames([...currentBoxes, box]),
      );
      setSelectedId(id);
      positionTooltip(box);
    }

    if (dragState?.kind === "move" || dragState?.kind === "resize") {
      if (
        dragState.kind === "move" &&
        dragState.wasSelected &&
        point &&
        point.x === dragState.start.x &&
        point.y === dragState.start.y
      ) {
        const targetBox =
          cropBoxes.find((box) => box.id === dragState.id) ??
          ({
            ...dragState.origin,
            id: dragState.id,
            name: "",
          } as CropBox);
        if (historyBeforeDrag) {
          recordHistory(historyBeforeDrag);
        }
        addConcavityPoint(targetBox, point);
        dragHistoryRef.current = null;
        setDragState(null);
        return;
      }

      if (
        historyBeforeDrag &&
        !areBoxListsEqual(historyBeforeDrag.boxes, cropBoxes)
      ) {
        recordHistory(historyBeforeDrag);
      }
      setCropBoxes((currentBoxes) => applyReadingOrderNames(currentBoxes));
    }

    dragHistoryRef.current = null;
    setDragState(null);
  }

  async function handleDownloadCrop() {
    if (!image || !selectedBox || !imageRef.current) {
      return;
    }

    const blob = await createCropBlob(imageRef.current, selectedBox);

    if (!blob) {
      setError("Could not generate the cropped PNG.");
      return;
    }

    downloadBlob(blob, toCropFileName(`${selectedBox.name}.png`));
  }

  async function handleDownloadZip() {
    if (!image || !imageRef.current || cropBoxes.length === 0) {
      return;
    }

    const sourceImage = imageRef.current;
    const usedNames = new Map<string, number>();
    const files: ZipSource[] = [];

    for (const [index, box] of getReadingOrder(cropBoxes).entries()) {
      const blob = await createCropBlob(sourceImage, box);

      if (!blob) {
        continue;
      }

      const data = new Uint8Array(await blob.arrayBuffer());
      const fallback = String(index + 1).padStart(2, "0");
      const baseName = sanitizeFilePart(box.name, fallback);
      const seenCount = usedNames.get(baseName) ?? 0;
      usedNames.set(baseName, seenCount + 1);
      const uniqueName =
        seenCount === 0 ? baseName : `${baseName}-${seenCount + 1}`;

      files.push({ data, name: `${uniqueName}.png` });
    }

    if (files.length === 0) {
      setError("No crops could be generated for the ZIP.");
      return;
    }

    downloadBlob(createZipBlob(files), toZipFileName(image.name));
  }

  return (
    <main className="min-h-dvh bg-[#0d0b08] px-5 py-7 text-[#f9f0d2] sm:px-8">
      <input
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <div className="mx-auto grid max-w-[1500px] gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="rounded-4xl border border-[#f8e26a]/15 bg-[#17120c] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] xl:sticky xl:top-7 xl:self-start">
          <p className="font-space text-xs uppercase tracking-[0.34em] text-[#f8e26a]/65">
            Sprite Slicer
          </p>
          <h1 className="mt-4 font-display text-5xl leading-[0.92] tracking-tighter text-[#fff6d9]">
            Find, name, and crop sprites.
          </h1>
          <p className="mt-5 text-sm leading-6 text-[#d4c6a5]">
            Upload a spritesheet to auto-detect object borders. Select a border
            to preview, rename, resize, delete, or download that crop.
          </p>

          <div className="mt-5 grid grid-cols-[1fr_auto] gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <label className="text-sm text-[#d8cab0]">
              <span className="font-space text-[10px] uppercase tracking-[0.22em] text-[#9fe8df]/75">
                Guide color
              </span>
              <input
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 p-1"
                onChange={(event) => setBorderColor(event.target.value)}
                type="color"
                value={borderColor}
              />
            </label>
            <label className="text-sm text-[#d8cab0]">
              <span className="font-space text-[10px] uppercase tracking-[0.22em] text-[#9fe8df]/75">
                Guide px
              </span>
              <input
                className="mt-2 h-11 w-24 rounded-xl border border-white/10 bg-black/30 px-3 font-space text-sm text-[#fff6d9] outline-none focus:border-[#f8e26a]/70"
                max={borderWidthLimit}
                min={1}
                onChange={(event) =>
                  setBorderWidth(
                    clamp(Number(event.target.value), 1, borderWidthLimit),
                  )
                }
                type="number"
                value={borderWidth}
              />
            </label>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 font-space text-xs leading-6 text-[#bfb198]">
            {image?.width ? (
              <>
                <button
                  className="text-left text-[#fff6d9] underline decoration-[#f8e26a]/30 underline-offset-4 transition hover:text-[#f8e26a]"
                  onClick={openFilePicker}
                  type="button"
                >
                  {image.name}
                </button>
                <p>
                  Source: {image.width} x {image.height}px
                </p>
                <p>Zoom: {zoom}x (= / -)</p>
                <p>
                  Notch: {formatConcavityDirection(concavityDirection)} (Shift)
                </p>
                <p>Split: S · Undo: Z · Redo: X</p>
                <p>Borders: {cropBoxes.length}</p>
                {selectedBox ? (
                  <p>
                    Name: {selectedBox.name} (
                    {boxNumberById.get(selectedBox.id) ?? "--"}), x{" "}
                    {selectedBox.x}, y {selectedBox.y}, {selectedBox.width} x{" "}
                    {selectedBox.height}px
                    {(selectedBox.concavities?.length ?? 0) > 0
                      ? `; notches: ${(selectedBox.concavities ?? [])
                          .map(formatConcavityPoint)
                          .join("; ")}`
                      : ""}
                  </p>
                ) : (
                  <p>Click a border, or drag to add one manually.</p>
                )}
              </>
            ) : (
              <button
                className="text-left text-[#fff6d9] underline decoration-[#f8e26a]/30 underline-offset-4 transition hover:text-[#f8e26a]"
                onClick={openFilePicker}
                type="button"
              >
                Waiting for an uploaded spritesheet.
              </button>
            )}
          </div>

          {detectionNote ? (
            <p className="mt-4 rounded-2xl border border-[#9fe8df]/20 bg-[#9fe8df]/10 px-4 py-3 text-sm text-[#c9fff8]">
              {detectionNote}
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-2xl border border-red-300/25 bg-red-950/35 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}
        </aside>

        <section className="min-h-[70vh] rounded-4xl border border-white/10 bg-[#15100a] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div>
              <p className="font-space text-xs uppercase tracking-[0.22em] text-[#d8cab0]">
                Preview zoom {zoom}x
              </p>
              <p className="mt-1 text-xs text-[#9f947e]">
                Borders and names are cached in this browser.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[#f8e26a]/20 bg-[#241b10] px-4 py-2.5 font-space text-xs font-bold uppercase tracking-[0.16em] text-[#f8e26a] transition hover:border-[#f8e26a]/45 hover:bg-[#2b2114] focus:outline-none focus:ring-2 focus:ring-[#f8e26a] focus:ring-offset-2 focus:ring-offset-[#15100a]"
                onClick={openFilePicker}
                type="button"
              >
                <Upload aria-hidden="true" size={16} strokeWidth={2.2} />
                Upload
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[#f8e26a]/20 bg-[#241b10] px-4 py-2.5 font-space text-xs font-bold uppercase tracking-[0.16em] text-[#f8e26a] transition hover:border-[#f8e26a]/45 hover:bg-[#2b2114] focus:outline-none focus:ring-2 focus:ring-[#f8e26a] focus:ring-offset-2 focus:ring-offset-[#15100a] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!image}
                onClick={handleSmartDraw}
                type="button"
              >
                <Sparkles aria-hidden="true" size={16} strokeWidth={2.2} />
                Draw
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[#9fe8df]/20 bg-[#15312d] px-4 py-2.5 font-space text-xs font-bold uppercase tracking-[0.16em] text-[#c9fff8] transition hover:border-[#9fe8df]/45 hover:bg-[#1d3d38] focus:outline-none focus:ring-2 focus:ring-[#9fe8df] focus:ring-offset-2 focus:ring-offset-[#15100a] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!image || cropBoxes.length === 0}
                onClick={handleDownloadZip}
                type="button"
              >
                <Package aria-hidden="true" size={16} strokeWidth={2.2} />
                ZIP
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-red-200/20 bg-red-950/35 px-4 py-2.5 font-space text-xs font-bold uppercase tracking-[0.16em] text-red-100 transition hover:border-red-200/45 hover:bg-red-900/45 focus:outline-none focus:ring-2 focus:ring-red-200 focus:ring-offset-2 focus:ring-offset-[#15100a] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={cropBoxes.length === 0}
                onClick={clearBorders}
                type="button"
              >
                <Trash2 aria-hidden="true" size={16} strokeWidth={2.2} />
                Clear
              </button>
              <button
                aria-label="Zoom out"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#f8e26a]/20 bg-[#241b10] text-[#f8e26a] transition hover:border-[#f8e26a]/45 hover:bg-[#2b2114] focus:outline-none focus:ring-2 focus:ring-[#f8e26a] focus:ring-offset-2 focus:ring-offset-[#15100a] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={zoom === ZOOM_LEVELS[0]}
                onClick={zoomOut}
                type="button"
              >
                <ZoomOut aria-hidden="true" size={18} strokeWidth={2.2} />
              </button>
              <button
                aria-label="Zoom in"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#f8e26a]/20 bg-[#241b10] text-[#f8e26a] transition hover:border-[#f8e26a]/45 hover:bg-[#2b2114] focus:outline-none focus:ring-2 focus:ring-[#f8e26a] focus:ring-offset-2 focus:ring-offset-[#15100a] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                onClick={zoomIn}
                type="button"
              >
                <ZoomIn aria-hidden="true" size={18} strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <div
            className="scrollbar-pill flex min-h-[calc(100dvh-11rem)] items-start justify-start overflow-auto rounded-3xl border border-[#f8e26a]/10 bg-[linear-gradient(45deg,#241f17_25%,transparent_25%),linear-gradient(-45deg,#241f17_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#241f17_75%),linear-gradient(-45deg,transparent_75%,#241f17_75%)] bg-size-[28px_28px] bg-position-[0_0,0_14px,14px_-14px,-14px_0] p-4"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedId(null);
                setTooltipStyle(undefined);
              }
            }}
          >
            {image ? (
              <div
                className="relative m-auto max-h-none max-w-none"
                style={scaledFrameStyle}
              >
                <div
                  className="absolute left-0 top-0 origin-top-left cursor-crosshair touch-none select-none"
                  onPointerCancel={finishPointer}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishPointer}
                  ref={previewRef}
                  style={nativeLayerStyle}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`Uploaded spritesheet ${image.name}`}
                    className="block h-full w-full max-w-none rounded-xl bg-black/30 [image-rendering:pixelated]"
                    draggable={false}
                    height={image.height || undefined}
                    onLoad={handleImageLoad}
                    ref={imageRef}
                    src={image.src}
                    width={image.width || undefined}
                  />

                {cropBoxes.map((box) => {
                  const isSelected = box.id === selectedId;

                  return (
                    <div
                      className="absolute"
                      key={box.id}
                      style={{
                        borderColor: isSelected ? "#9fe8df" : borderColor,
                        borderStyle: "solid",
                        borderWidth: `${Math.max(1 / zoom, borderWidth / zoom)}px`,
                        boxSizing: "border-box",
                        height: `${box.height}px`,
                        left: `${box.x}px`,
                        top: `${box.y}px`,
                        width: `${box.width}px`,
                      }}
                    >
                      <button
                        aria-label={`Select crop ${boxNumberById.get(box.id) ?? box.name}`}
                        className="absolute inset-0 cursor-move bg-transparent"
                        onPointerDown={(event) => startMove(event, box)}
                        type="button"
                      />
                      <span
                        className="pointer-events-none absolute rounded-full bg-black/80 font-space text-[#fff6d9]"
                        style={{
                          fontSize: `${10 / zoom}px`,
                          left: `${-4 / zoom}px`,
                          padding: `${4 / zoom}px ${8 / zoom}px`,
                          top: `${-24 / zoom}px`,
                        }}
                      >
                        {boxNumberById.get(box.id) ?? box.name}
                      </span>
                      {(box.concavities ?? []).map((point) => {
                        const rect = getConcavityRect(box, point);
                        const isHighlighted = point.id === selectedConcavityId;

                        return (
                          <div key={point.id}>
                            <div
                              className="pointer-events-none absolute bg-black/35"
                              style={{
                                height: `${rect.height}px`,
                                left: `${rect.x}px`,
                                outline: `${1 / zoom}px dashed rgba(248,226,106,0.72)`,
                                top: `${rect.y}px`,
                                width: `${rect.width}px`,
                              }}
                            />
                            <button
                              aria-label={`Select concavity ${formatConcavityDirection(
                                point.direction,
                              )}`}
                              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                setSelectedId(box.id);
                                setSelectedConcavityId(point.id);
                                setConcavityDirection(point.direction);
                                positionTooltip(box);
                              }}
                              style={{
                                background: isHighlighted
                                  ? "#f8e26a"
                                  : "#120d07",
                                border: `${1 / zoom}px solid ${
                                  isHighlighted ? "#120d07" : "#f8e26a"
                                }`,
                                height: `${10 / zoom}px`,
                                left: `${point.x}px`,
                                top: `${point.y}px`,
                                width: `${10 / zoom}px`,
                              }}
                              type="button"
                            />
                          </div>
                        );
                      })}
                      {isSelected
                        ? RESIZE_HANDLES.map((handle) => (
                            <button
                              aria-label={`Resize ${box.name} ${handle}`}
                              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#9fe8df] shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
                              key={handle}
                              onPointerDown={(event) =>
                                startResize(event, box, handle)
                              }
                              style={{
                                border: `${1 / zoom}px solid #000`,
                                cursor: `${handle}-resize`,
                                height: `${12 / zoom}px`,
                                left: handle.includes("w") ? "0%" : "100%",
                                top: handle.includes("n") ? "0%" : "100%",
                                width: `${12 / zoom}px`,
                              }}
                              type="button"
                            />
                          ))
                        : null}
                    </div>
                  );
                })}

                {draftSelection ? (
                  <div
                    className="pointer-events-none absolute border-solid shadow-[0_0_0_1px_rgba(0,0,0,0.72),0_0_28px_rgba(248,226,106,0.32)]"
                    style={{
                      borderColor,
                      borderWidth: `${Math.max(1 / zoom, borderWidth / zoom)}px`,
                      boxSizing: "border-box",
                      height: `${draftSelection.height}px`,
                      left: `${draftSelection.x}px`,
                      top: `${draftSelection.y}px`,
                      width: `${draftSelection.width}px`,
                    }}
                  />
                ) : null}
                </div>

                {selectedBox && tooltipStyle ? (
                  <div
                    className="fixed z-50 w-64 rounded-2xl border border-[#f8e26a]/35 bg-[#120d07]/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur"
                    onPointerDown={(event) => event.stopPropagation()}
                    style={tooltipStyle}
                  >
                    <p className="font-space text-[10px] uppercase tracking-[0.22em] text-[#f8e26a]/70">
                      Selected crop
                    </p>
                    <input
                      aria-label="Crop name"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-space text-sm text-[#fff6d9] outline-none focus:border-[#f8e26a]/70"
                      onChange={(event) =>
                        updateBoxName(selectedBox.id, event.target.value)
                      }
                      value={selectedBox.name}
                    />
                    <div className="mt-2 flex min-h-28 items-center justify-center rounded-xl border border-white/10 bg-[linear-gradient(45deg,#2b271f_25%,transparent_25%),linear-gradient(-45deg,#2b271f_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#2b271f_75%),linear-gradient(-45deg,transparent_75%,#2b271f_75%)] bg-size-[16px_16px] bg-position-[0_0,0_8px,8px_-8px,-8px_0] p-2">
                      {previewSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt="Cropped preview"
                          className="max-h-32 max-w-full [image-rendering:pixelated]"
                          src={previewSrc}
                        />
                      ) : (
                        <span className="text-xs text-[#d8cab0]">
                          Preview loading
                        </span>
                      )}
                    </div>
                    <p className="mt-2 font-space text-xs leading-5 text-[#d8cab0]">
                      {selectedBox.width} x {selectedBox.height}px at x{" "}
                      {selectedBox.x}, y {selectedBox.y}
                    </p>
                    <p className="mt-1 font-space text-xs leading-5 text-[#d8cab0]">
                      {(selectedBox.concavities?.length ?? 0) > 0 ? (
                        <>
                          {selectedConcavity
                            ? `Notch ${formatConcavityPoint(selectedConcavity)}.`
                            : `Notches: ${(selectedBox.concavities ?? [])
                                .map(formatConcavityPoint)
                                .join("; ")}.`}{" "}
                          Shift changes corner; Delete removes a highlighted
                          point.
                        </>
                      ) : (
                        <>
                          Click inside this crop to add a{" "}
                          {formatConcavityDirection(concavityDirection)} notch.
                          Shift changes corner; Delete removes a highlighted
                          point.
                        </>
                      )}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f8e26a] px-3 py-2.5 font-space text-[10px] font-bold uppercase tracking-[0.16em] text-[#17120c] transition hover:bg-[#ffe882] focus:outline-none focus:ring-2 focus:ring-[#f8e26a] focus:ring-offset-2 focus:ring-offset-[#120d07]"
                        onClick={handleDownloadCrop}
                        type="button"
                      >
                        <Download
                          aria-hidden="true"
                          size={14}
                          strokeWidth={2.2}
                        />
                        PNG
                      </button>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200/25 bg-red-950/45 px-3 py-2.5 font-space text-[10px] font-bold uppercase tracking-[0.16em] text-red-100 transition hover:bg-red-900/55 focus:outline-none focus:ring-2 focus:ring-red-200 focus:ring-offset-2 focus:ring-offset-[#120d07]"
                        onClick={() => deleteBox(selectedBox.id)}
                        type="button"
                      >
                        <Trash2
                          aria-hidden="true"
                          size={14}
                          strokeWidth={2.2}
                        />
                        Del
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                className="m-auto max-w-md rounded-3xl p-6 text-center transition hover:bg-black/15 focus:outline-none focus:ring-2 focus:ring-[#f8e26a] focus:ring-offset-2 focus:ring-offset-[#15100a]"
                onClick={openFilePicker}
                type="button"
              >
                <div className="mx-auto h-24 w-24 rounded-3xl border border-[#f8e26a]/20 bg-[#f8e26a]/8 shadow-[inset_0_0_0_8px_rgba(248,226,106,0.04)]" />
                <h2 className="mt-6 font-display text-4xl tracking-[-0.04em] text-[#fff6d9]">
                  Drop in a sprite sheet.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#cdbf9f]">
                  Transparent sprites are detected automatically. Existing
                  borders stay in place when you upload the next sheet.
                </p>
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
