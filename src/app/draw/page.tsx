"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eraser,
  CloudUpload,
  CircleOff,
  Database,
  Download,
  Eye,
  FileJson,
  FilePlus2,
  Fence,
  Grid3x3,
  Layers3,
  Magnet,
  Minus,
  Paintbrush,
  Palette,
  Redo2,
  Search,
  Save,
  Square,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SparklingStars } from "@/app/components/effects";
import {
  applyWoodBorder,
  buildAtlasGrid,
  clearWoodBorder,
  createEmptyMapDocument,
  createEmptyMapLayer,
  createRandomLayoutMap,
  fileNameForSheetLabel,
  gridSizeForAsset,
  itemRenderSize,
  normalizeMapDocument,
  normalizeAssetPath,
  paintRegionRectangle,
  regionRectangleTiles,
  TILE_SOURCE_SIZE,
  type AtlasTile,
  type MapDocument,
  type MapItem,
  type MapRegion,
  type TileRole,
} from "@/lib/game/map";
import {
  getShopDisplayItem,
  getShopItemByAssetPath,
  isShopSmallItem,
  isSurfaceFurniture,
  rotateShopItemAssetPath,
} from "@/lib/game/items/shop";
import {
  collapseAssetEntries,
  rotateAssetPathAmong,
} from "@/lib/game/items/asset-variants";

const STORAGE_KEY = "sapiens.draw.map.v1";
const PUBLISHED_MAP_KEY = "sapiens.draw.published-map.v1";
const CELL_SIZE = 34;
const PALETTE_CELL_SIZE = 42;

type DrawTool = "brush" | "erase" | "line" | "rectangle";
type Point = { x: number; y: number };
type DragState = { start: Point; pointerId: number };
type PreviewCell = { point: Point; label?: number };
type RectangleSelection = { region: MapRegion; role: TileRole };
type RectangleSource = "tile" | "region";
type PaletteTab = "tile" | "items";
type AssetEntry = {
  folder: string;
  file: string;
  assetPath: string;
  name: string;
};
type SavedMapSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};
type PublishedMapState = { id: string; name: string };
type Selection =
  | { type: "item"; layerId: string; itemId: string }
  | { type: "tile"; layerId: string; index: number }
  | null;
type DocumentUpdater = (current: MapDocument) => MapDocument;
type HistoryState = { past: MapDocument[]; future: MapDocument[] };

const MAX_HISTORY = 60;

function collapsePaletteAssetEntries(entries: AssetEntry[]): AssetEntry[] {
  // Shop-aware names first, then general slug collapse for stairs/doors/etc.
  const withShopNames = entries.map((entry) => {
    const shopItem = getShopItemByAssetPath(entry.assetPath);
    if (!shopItem) return entry;
    const displayItem = getShopDisplayItem(shopItem);
    const parts = displayItem.assetPath.split("/");
    return {
      ...entry,
      assetPath: displayItem.assetPath,
      file: parts[parts.length - 1] ?? entry.file,
      folder: parts[parts.length - 2] ?? entry.folder,
      name: displayItem.name,
    };
  });
  return collapseAssetEntries(withShopNames);
}

const RECTANGLE_SELECTIONS: Array<RectangleSelection & { label: string }> = [
  { label: "1 wall", region: 1, role: "wall" },
  { label: "2 wall", region: 2, role: "wall" },
  { label: "3 wall", region: 3, role: "wall" },
  { label: "4 wall", region: 4, role: "wall" },
  { label: "1 floor", region: 1, role: "floor" },
  { label: "2 floor", region: 2, role: "floor" },
  { label: "3 floor", region: 3, role: "floor" },
  { label: "4 floor", region: 4, role: "floor" },
];

const TOOLS: Array<{
  id: DrawTool;
  label: string;
  shortcut: string;
  Icon: LucideIcon;
}> = [
  { id: "brush", label: "Brush", shortcut: "1", Icon: Paintbrush },
  { id: "erase", label: "Erase", shortcut: "2", Icon: Eraser },
  { id: "line", label: "Line", shortcut: "3", Icon: Minus },
  { id: "rectangle", label: "Rectangle", shortcut: "4", Icon: Square },
];

export default function DrawPage() {
  const atlasTiles = useMemo(() => buildAtlasGrid().flat(), []);
  const [document, setDocument] = useState<MapDocument>(() =>
    createEmptyMapDocument(),
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(96);
  const [selectedLayerId, setSelectedLayerId] = useState("00");
  const [activeTab, setActiveTab] = useState<PaletteTab>("tile");
  const [assetEntries, setAssetEntries] = useState<AssetEntry[]>([]);
  const [assetFolders, setAssetFolders] = useState<string[]>([]);
  const [assetFolder, setAssetFolder] = useState("all");
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AssetEntry | null>(null);
  const [assetDimensions, setAssetDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [selection, setSelection] = useState<Selection>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [rectangleSource, setRectangleSource] =
    useState<RectangleSource>("region");
  const [rectangleSelection, setRectangleSelection] =
    useState<RectangleSelection>({ region: 1, role: "wall" });
  const [mapName, setMapName] = useState("Untitled map");
  const [publishedMapId, setPublishedMapId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isRestorePanelOpen, setIsRestorePanelOpen] = useState(false);
  const [savedMaps, setSavedMaps] = useState<SavedMapSummary[]>([]);
  const [restoreMapId, setRestoreMapId] = useState("");
  const [restorePanelState, setRestorePanelState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [restorePanelMessage, setRestorePanelMessage] = useState("");
  const [tool, setTool] = useState<DrawTool>("brush");
  const [showGrid, setShowGrid] = useState(true);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<PreviewCell[]>([]);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    future: [],
  });
  const canvasRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef(document);
  const historyRef = useRef<HistoryState>({ past: [], future: [] });
  const gestureStartRef = useRef<MapDocument | null>(null);
  const moveSelectionRef = useRef<(key: string) => void>(() => undefined);
  const rotateSelectionRef = useRef<(direction: -1 | 1) => void>(
    () => undefined,
  );
  const mapFileInputRef = useRef<HTMLInputElement>(null);

  const commitDocument = useCallback((updater: DocumentUpdater) => {
    const current = documentRef.current;
    const next = updater(current);
    const nextHistory = {
      past: [...historyRef.current.past, current].slice(-MAX_HISTORY),
      future: [],
    };
    documentRef.current = next;
    historyRef.current = nextHistory;
    setDocument(next);
    setHistory(nextHistory);
  }, []);

  const mutateDocument = useCallback((updater: DocumentUpdater) => {
    const next = updater(documentRef.current);
    documentRef.current = next;
    setDocument(next);
  }, []);

  const beginGesture = useCallback(() => {
    gestureStartRef.current = documentRef.current;
  }, []);

  const finishGesture = useCallback(() => {
    const start = gestureStartRef.current;
    if (!start) {
      return;
    }

    if (start !== documentRef.current) {
      const nextHistory = {
        past: [...historyRef.current.past, start].slice(-MAX_HISTORY),
        future: [],
      };
      historyRef.current = nextHistory;
      setHistory(nextHistory);
    }
    gestureStartRef.current = null;
  }, []);

  const undo = useCallback(() => {
    finishGesture();
    const { past, future } = historyRef.current;
    const previous = past[past.length - 1];
    if (!previous) {
      return;
    }

    const nextHistory = {
      past: past.slice(0, -1),
      future: [documentRef.current, ...future].slice(0, MAX_HISTORY),
    };
    documentRef.current = previous;
    historyRef.current = nextHistory;
    setDocument(previous);
    setHistory(nextHistory);
    setPreview([]);
  }, [finishGesture]);

  const redo = useCallback(() => {
    finishGesture();
    const { past, future } = historyRef.current;
    const next = future[0];
    if (!next) {
      return;
    }

    const nextHistory = {
      past: [...past, documentRef.current].slice(-MAX_HISTORY),
      future: future.slice(1),
    };
    documentRef.current = next;
    historyRef.current = nextHistory;
    setDocument(next);
    setHistory(nextHistory);
    setPreview([]);
  }, [finishGesture]);

  const clearMap = useCallback(() => {
    commitDocument((current) => ({
      ...current,
      layers: current.layers.map((layer) =>
        createEmptyMapLayer(layer.id, current.width, current.height),
      ),
    }));
    setPreview([]);
  }, [commitDocument]);

  function downloadMap() {
    const payload = JSON.stringify(
      {
        width: document.width,
        height: document.height,
        layers: document.layers,
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    const safeName =
      mapName
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "map";
    anchor.href = url;
    anchor.download = `${safeName}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openGameView() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    window.open("/draw/view", "_blank", "noopener,noreferrer");
  }

  function rememberPublishedMap(id: string, name: string) {
    setPublishedMapId(id);
    window.localStorage.setItem(
      PUBLISHED_MAP_KEY,
      JSON.stringify({ id, name } satisfies PublishedMapState),
    );
  }

  function forgetPublishedMap() {
    setPublishedMapId(null);
    window.localStorage.removeItem(PUBLISHED_MAP_KEY);
  }

  function restoreDocument(next: MapDocument, name?: string) {
    documentRef.current = next;
    historyRef.current = { past: [], future: [] };
    setDocument(next);
    setHistory({ past: [], future: [] });
    setSelectedLayerId(next.layers[0]?.id ?? "00");
    setSelection(null);
    setPreview([]);
    if (name) setMapName(name);
  }

  async function openRestorePanel() {
    setIsRestorePanelOpen(true);
    setRestoreMapId("");
    setRestorePanelState("loading");
    setRestorePanelMessage("");
    try {
      const response = await fetch("/api/maps");
      const result = (await response.json()) as {
        error?: string;
        maps?: SavedMapSummary[];
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Could not load saved maps.");
      }
      setSavedMaps(result.maps ?? []);
      setRestorePanelState("idle");
    } catch (error) {
      setRestorePanelState("error");
      setRestorePanelMessage(
        error instanceof Error ? error.message : "Could not load saved maps.",
      );
    }
  }

  async function restoreSavedMap() {
    if (!restoreMapId) return;
    setRestorePanelState("loading");
    setRestorePanelMessage("");
    try {
      const response = await fetch(
        `/api/maps/${encodeURIComponent(restoreMapId)}`,
      );
      const result = (await response.json()) as {
        error?: string;
        data?: unknown;
        id?: string;
        name?: string;
      };
      if (!response.ok || result.data === undefined) {
        throw new Error(result.error ?? "Could not restore saved map.");
      }
      restoreDocument(normalizeMapDocument(result.data), result.name);
      if (result.id && result.name)
        rememberPublishedMap(result.id, result.name);
      setIsRestorePanelOpen(false);
      setUploadState("success");
      setUploadMessage("Map restored");
    } catch (error) {
      setRestorePanelState("error");
      setRestorePanelMessage(
        error instanceof Error ? error.message : "Could not restore saved map.",
      );
    }
  }

  async function restoreDownloadedMap(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const next = normalizeMapDocument(JSON.parse(await file.text()));
      restoreDocument(next);
      forgetPublishedMap();
      setIsRestorePanelOpen(false);
      setUploadState("success");
      setUploadMessage("Map restored");
    } catch {
      setUploadState("error");
      setUploadMessage("Could not restore that map file.");
    }
  }

  async function publishMap() {
    const name = mapName.trim();
    if (!name) {
      setUploadState("error");
      setUploadMessage("Give this map a name before publishing.");
      return;
    }

    setUploadState("uploading");
    setUploadMessage("");

    try {
      const response = await fetch(
        publishedMapId
          ? `/api/maps/${encodeURIComponent(publishedMapId)}`
          : "/api/maps",
        {
          method: publishedMapId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            data: {
              width: document.width,
              height: document.height,
              layers: document.layers,
            },
          }),
        },
      );
      const result = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) {
        throw new Error(
          result.error ??
            `Could not ${publishedMapId ? "save" : "publish"} map.`,
        );
      }

      const savedId = result.id ?? publishedMapId;
      if (savedId) rememberPublishedMap(savedId, name);
      setUploadState("success");
      setUploadMessage(
        publishedMapId ? "Saved" : `Published${savedId ? ` · ${savedId}` : ""}`,
      );
    } catch (error) {
      setUploadState("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Could not publish map.",
      );
    }
  }

  function createNewMap() {
    restoreDocument(createEmptyMapDocument(), "Untitled map");
    forgetPublishedMap();
    setUploadState("idle");
    setUploadMessage("");
  }

  useEffect(() => {
    const loadDraft = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const next = normalizeMapDocument(JSON.parse(saved));
          documentRef.current = next;
          setDocument(next);
          setSelectedLayerId(next.layers[0]?.id ?? "00");
          const emptyHistory = { past: [], future: [] };
          historyRef.current = emptyHistory;
          setHistory(emptyHistory);
        }
        const published = window.localStorage.getItem(PUBLISHED_MAP_KEY);
        if (published) {
          const metadata = JSON.parse(published) as Partial<PublishedMapState>;
          if (typeof metadata.id === "string" && metadata.id) {
            setPublishedMapId(metadata.id);
            if (typeof metadata.name === "string" && metadata.name) {
              setMapName(metadata.name);
            }
          }
        }
      } catch {
        // A malformed local draft should not prevent the editor from opening.
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => {
      window.clearTimeout(loadDraft);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/maps/assets")
      .then((response) => response.json())
      .then((result: { folders?: string[]; assets?: AssetEntry[] }) => {
        if (!cancelled) {
          setAssetFolders(result.folders ?? []);
          setAssetEntries(result.assets ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetFolders([]);
          setAssetEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Preload natural sizes for every asset (including collapsed orientation /
  // state variants) so A/D rotation can resize placed items correctly.
  useEffect(() => {
    let cancelled = false;
    for (const entry of assetEntries) {
      const image = new window.Image();
      image.onload = () => {
        if (cancelled) return;
        setAssetDimensions((current) => {
          if (current[entry.assetPath]) return current;
          return {
            ...current,
            [entry.assetPath]: {
              width: image.naturalWidth,
              height: image.naturalHeight,
            },
          };
        });
      };
      image.src = entry.assetPath;
    }
    return () => {
      cancelled = true;
    };
  }, [assetEntries]);

  useEffect(() => {
    if (!isRestorePanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsRestorePanelOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRestorePanelOpen]);

  useEffect(() => {
    const shortcutTools: Record<string, DrawTool> = {
      "1": "brush",
      "2": "erase",
      "3": "line",
      "4": "rectangle",
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      // Tab is navigation only. Never let the editor shortcuts activate while
      // the browser is moving focus through controls.
      if (event.key === "Tab") {
        return;
      }
      if (isRestorePanelOpen) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape" && selection) {
        event.preventDefault();
        setSelection(null);
        setPreview([]);
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selection
      ) {
        event.preventDefault();
        if (selection.type === "tile") {
          const selectedTile = selection;
          commitDocument((current) => ({
            ...current,
            layers: current.layers.map((layer) => {
              if (layer.id !== selectedTile.layerId) return layer;
              const tiles = [...layer.tiles];
              const border = [...layer.border];
              tiles[selectedTile.index] = null;
              border[selectedTile.index] = null;
              return { ...layer, tiles, border };
            }),
          }));
        } else {
          const selectedItem = selection;
          commitDocument((current) => ({
            ...current,
            layers: current.layers.map((layer) => {
              if (layer.id !== selectedItem.layerId) return layer;
              return {
                ...layer,
                items: layer.items.filter(
                  (item) => item.id !== selectedItem.itemId,
                ),
              };
            }),
          }));
        }
        setSelection(null);
        setPreview([]);
        return;
      }

      const nextTool = shortcutTools[event.key];
      const command = event.key.toLowerCase();
      if (command === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (command === "x") {
        event.preventDefault();
        redo();
        return;
      }
      if (command === "c") {
        event.preventDefault();
        clearMap();
        return;
      }
      if (command === "g") {
        event.preventDefault();
        setShowGrid((current) => !current);
        setPreview([]);
        return;
      }
      if (command === "h") {
        event.preventDefault();
        setSnapToGrid((current) => !current);
        return;
      }

      if (
        (command === "a" || command === "d") &&
        selection?.type === "item"
      ) {
        event.preventDefault();
        rotateSelectionRef.current(command === "a" ? -1 : 1);
        return;
      }

      if (event.key.startsWith("Arrow")) {
        if (selection) {
          event.preventDefault();
          moveSelectionRef.current(event.key);
        }
        return;
      }

      if (!nextTool) {
        return;
      }

      event.preventDefault();
      setTool(nextTool);
      setPreview([]);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clearMap,
    commitDocument,
    isRestorePanelOpen,
    redo,
    selection,
    snapToGrid,
    undo,
  ]);

  useEffect(() => {
    if (isLoaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    }
  }, [document, isLoaded]);

  const currentLayer =
    document.layers.find((layer) => layer.id === selectedLayerId) ??
    document.layers[0];
  const tileCount = document.layers.reduce<number>(
    (count, layer) =>
      count + layer.tiles.filter((label) => label !== null).length,
    0,
  );
  const previewKeys = useMemo(
    () => new Set(preview.map(({ point }) => pointKey(point))),
    [preview],
  );
  const previewLabels = useMemo(
    () => new Map(preview.map(({ point, label }) => [pointKey(point), label])),
    [preview],
  );

  function updateSelectedLayer(points: Point[], label: number | null) {
    mutateDocument((current) =>
      paintPoints(current, points, label, selectedLayerId),
    );
  }

  function pointFromPointer(
    event: React.PointerEvent<HTMLDivElement>,
    precise = false,
  ) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();
    const rawX = (event.clientX - bounds.left) / CELL_SIZE;
    const rawY = (event.clientY - bounds.top) / CELL_SIZE;
    const x = precise && !snapToGrid ? rawX : Math.floor(rawX);
    const y = precise && !snapToGrid ? rawY : Math.floor(rawY);
    return x >= 0 && x < document.width && y >= 0 && y < document.height
      ? { x, y }
      : null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const point = pointFromPointer(
      event,
      Boolean(selectedAsset && tool === "brush"),
    );
    if (!point || !canvasRef.current) {
      return;
    }

    const hitItem = findItemAt(point);
    const canStackSmallItemOnSurface =
      Boolean(selectedAsset) &&
      tool === "brush" &&
      selectedAsset !== null &&
      isShopSmallItem(selectedAsset.assetPath) &&
      hitItem !== null &&
      isSurfaceFurniture(hitItem.item.assetPath);

    if (hitItem && !canStackSmallItemOnSurface) {
      setSelection({
        type: "item",
        layerId: hitItem.layerId,
        itemId: hitItem.item.id,
      });
      return;
    }
    if (selectedAsset && tool === "brush") {
      const dimensions = assetDimensions[selectedAsset.assetPath] ?? {
        width: CELL_SIZE,
        height: CELL_SIZE,
      };
      const rawSize = gridSizeForAsset(
        dimensions.width,
        dimensions.height,
        TILE_SOURCE_SIZE,
      );
      const size = {
        width: Math.min(document.width, rawSize.width),
        height: Math.min(document.height, rawSize.height),
      };
      // Stack cups/plates/etc. on the same layer as the table/counter so they
      // paint above it (items append after existing furniture on that layer).
      const targetLayerId = canStackSmallItemOnSurface
        ? hitItem!.layerId
        : selectedLayerId;
      const item: MapItem = {
        id: crypto.randomUUID(),
        assetPath: selectedAsset.assetPath,
        x: Math.max(
          0,
          Math.min(
            document.width - size.width,
            snapToGrid ? Math.floor(point.x) : point.x,
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            document.height - size.height,
            snapToGrid ? Math.floor(point.y) : point.y,
          ),
        ),
        width: size.width,
        height: size.height,
        sourceWidth: dimensions.width,
        sourceHeight: dimensions.height,
      };
      commitDocument((current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === targetLayerId
            ? { ...layer, items: [...layer.items, item] }
            : layer,
        ),
      }));
      setSelection({ type: "item", layerId: targetLayerId, itemId: item.id });
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ start: point, pointerId: event.pointerId });
    beginGesture();
    setSelection({
      type: "tile",
      layerId: selectedLayerId,
      index: point.y * document.width + point.x,
    });

    if (tool === "brush" || tool === "erase") {
      updateSelectedLayer([point], tool === "erase" ? null : selectedLabel);
    } else if (tool === "rectangle") {
      setPreview(rectanglePreview(point, point));
    } else {
      setPreview([{ point }]);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) {
      return;
    }

    const point = pointFromPointer(event);
    if (!point) {
      return;
    }

    if (tool === "brush" || tool === "erase") {
      updateSelectedLayer([point], tool === "erase" ? null : selectedLabel);
      return;
    }

    setPreview(
      tool === "rectangle"
        ? rectanglePreview(drag.start, point)
        : pointsForTool(tool, drag.start, point).map((previewPoint) => ({
            point: previewPoint,
          })),
    );
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const point = pointFromPointer(event) ?? drag.start;
    if (tool === "rectangle") {
      if (rectangleSource === "tile") {
        updateSelectedLayer(
          pointsForTool(tool, drag.start, point),
          selectedLabel,
        );
      } else {
        mutateDocument((current) =>
          paintRegionRectangle(
            current,
            drag.start,
            point,
            rectangleSelection.region,
            rectangleSelection.role,
            selectedLayerId,
          ),
        );
      }
    } else if (tool === "line") {
      updateSelectedLayer(
        pointsForTool(tool, drag.start, point),
        selectedLabel,
      );
    }

    finishGesture();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
    setPreview([]);
  }

  function rectanglePreview(start: Point, end: Point): PreviewCell[] {
    if (rectangleSource === "tile") {
      return pointsForTool("rectangle", start, end).map((point) => ({ point }));
    }

    return regionRectangleTiles(
      start,
      end,
      rectangleSelection.region,
      rectangleSelection.role,
    ).map(({ point, label }) => ({ point, label }));
  }

  function findItemAt(point: Point) {
    for (
      let layerIndex = document.layers.length - 1;
      layerIndex >= 0;
      layerIndex -= 1
    ) {
      const layer = document.layers[layerIndex];
      for (
        let itemIndex = layer.items.length - 1;
        itemIndex >= 0;
        itemIndex -= 1
      ) {
        const item = layer.items[itemIndex];
        if (
          point.x >= item.x &&
          point.x < item.x + item.width &&
          point.y >= item.y &&
          point.y < item.y + item.height
        ) {
          return { layerId: layer.id, item };
        }
      }
    }
    return null;
  }

  function moveSelection(key: string) {
    if (!selection) return;
    const step = snapToGrid ? 1 : 0.25;
    const delta =
      key === "ArrowLeft"
        ? { x: -step, y: 0 }
        : key === "ArrowRight"
          ? { x: step, y: 0 }
          : key === "ArrowUp"
            ? { x: 0, y: -step }
            : { x: 0, y: step };
    if (selection.type === "item") {
      commitDocument((current) => ({
        ...current,
        layers: current.layers.map((layer) => {
          if (layer.id !== selection.layerId) return layer;
          return {
            ...layer,
            items: layer.items.map((item) =>
              item.id !== selection.itemId
                ? item
                : {
                    ...item,
                    x: Math.max(
                      0,
                      Math.min(
                        current.width - item.width,
                        (snapToGrid ? Math.round(item.x) : item.x) + delta.x,
                      ),
                    ),
                    y: Math.max(
                      0,
                      Math.min(
                        current.height - item.height,
                        (snapToGrid ? Math.round(item.y) : item.y) + delta.y,
                      ),
                    ),
                  },
            ),
          };
        }),
      }));
    } else {
      const layer = currentLayer;
      if (!layer) return;
      const point = {
        x: selection.index % document.width,
        y: Math.floor(selection.index / document.width),
      };
      const nextPoint = { x: point.x + delta.x, y: point.y + delta.y };
      if (
        !Number.isInteger(nextPoint.x) ||
        !Number.isInteger(nextPoint.y) ||
        nextPoint.x < 0 ||
        nextPoint.y < 0 ||
        nextPoint.x >= document.width ||
        nextPoint.y >= document.height
      )
        return;
      const nextIndex = nextPoint.y * document.width + nextPoint.x;
      commitDocument((current) => ({
        ...current,
        layers: current.layers.map((candidate) => {
          if (candidate.id !== selection.layerId) return candidate;
          const tiles = [...candidate.tiles];
          tiles[nextIndex] = tiles[selection.index];
          tiles[selection.index] = null;
          return {
            ...candidate,
            tiles,
            border: candidate.border.map((label, index) =>
              index === selection.index || index === nextIndex ? null : label,
            ),
          };
        }),
      }));
      setSelection({ ...selection, index: nextIndex });
    }
  }

  function rotateSelection(direction: -1 | 1) {
    if (selection?.type !== "item") return;
    const currentDocument = documentRef.current;
    const layer = currentDocument.layers.find(
      (candidate) => candidate.id === selection.layerId,
    );
    const selectedItem = layer?.items.find(
      (item) => item.id === selection.itemId,
    );
    if (!selectedItem) return;
    const shopRotated = rotateShopItemAssetPath(
      selectedItem.assetPath,
      direction,
    );
    const nextAssetPath =
      shopRotated !== selectedItem.assetPath
        ? shopRotated
        : rotateAssetPathAmong(
            selectedItem.assetPath,
            direction,
            assetEntries.map((entry) => entry.assetPath),
          );
    if (nextAssetPath === selectedItem.assetPath) return;

    const dimensions = assetDimensions[nextAssetPath];
    const nextSize = dimensions
      ? gridSizeForAsset(
          dimensions.width,
          dimensions.height,
          TILE_SOURCE_SIZE,
        )
      : {width: selectedItem.width, height: selectedItem.height};

    commitDocument((current) => ({
      ...current,
      layers: current.layers.map((candidate) =>
        candidate.id !== selection.layerId
          ? candidate
          : {
              ...candidate,
              items: candidate.items.map((item) => {
                if (item.id !== selection.itemId) return item;
                const width = Math.min(current.width, nextSize.width);
                const height = Math.min(current.height, nextSize.height);
                return {
                  ...item,
                  assetPath: nextAssetPath,
                  width,
                  height,
                  sourceWidth: dimensions?.width ?? item.sourceWidth,
                  sourceHeight: dimensions?.height ?? item.sourceHeight,
                  x: Math.max(0, Math.min(current.width - width, item.x)),
                  y: Math.max(0, Math.min(current.height - height, item.y)),
                };
              }),
            },
      ),
    }));
  }

  useEffect(() => {
    moveSelectionRef.current = moveSelection;
    rotateSelectionRef.current = rotateSelection;
  });

  function addLayer() {
    const used = new Set(document.layers.map((layer) => layer.id));
    let index = document.layers.length;
    let id = String(index).padStart(2, "0");
    while (used.has(id)) {
      index += 1;
      id = String(index).padStart(2, "0");
    }
    commitDocument((current) => ({
      ...current,
      layers: [
        ...current.layers,
        createEmptyMapLayer(id, current.width, current.height),
      ],
    }));
    setSelectedLayerId(id);
  }

  return (
    <main className="map-editor-page min-h-dvh text-[#f5ead9]">
      <SparklingStars />
      <header className="relative z-10 border-b border-white/10 bg-[#0b0e12]/18 px-5 py-7 backdrop-blur-sm sm:px-8 sm:py-9">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-space text-[10px] uppercase tracking-[0.34em] text-cyan-100/55">
              Sapiens / draw
            </p>
            <h1 className="mt-2 font-display text-5xl tracking-[-0.045em] text-[#f7f0e6] sm:text-6xl">
              Paint your world
            </h1>
          </div>
          <div className="flex items-center gap-3 font-space text-[10px] uppercase tracking-[0.16em] text-[#9caead]">
            <span className="rounded-full border border-cyan-200/20 bg-cyan-200/[0.06] px-3 py-2 text-cyan-100/80 shadow-[0_0_24px_rgba(103,232,249,0.08)]">
              {isLoaded
                ? publishedMapId
                  ? "published map"
                  : "saved locally"
                : "loading draft"}
            </span>
            <span>
              {document.width} × {document.height}
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid max-w-[1500px] gap-5 px-5 py-5 sm:px-8 sm:py-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 rounded-[1.75rem] border border-white/10 bg-[#11161a]/85 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-md sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="map-name">
                Map name
              </label>
              <input
                className="w-44 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-[#f5ead9] outline-none placeholder:text-[#778084] transition focus:border-cyan-100/45 focus:ring-2 focus:ring-cyan-100/15"
                id="map-name"
                maxLength={120}
                onChange={(event) => {
                  setMapName(event.target.value);
                  if (uploadState !== "idle") {
                    setUploadState("idle");
                    setUploadMessage("");
                  }
                }}
                placeholder="Map name"
                value={mapName}
              />
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-1.5 shadow-[0_0_24px_rgba(0,0,0,0.18)]">
                {document.layers.map((layer) => (
                  <button
                    aria-pressed={selectedLayerId === layer.id}
                    className={`rounded-xl px-4 py-2 font-space text-[10px] font-bold uppercase tracking-[0.17em] transition ${selectedLayerId === layer.id ? "bg-[#f4eadc] text-[#17130f] shadow-[0_0_18px_rgba(244,234,220,0.14)]" : "text-[#aeb6b7] hover:bg-white/8 hover:text-white"}`}
                    key={layer.id}
                    onClick={() => {
                      setSelectedLayerId(layer.id);
                      setSelection(null);
                    }}
                    type="button"
                  >
                    {layer.name}
                  </button>
                ))}
                <button
                  aria-label="Add layer"
                  className="rounded-xl px-3 py-2 text-cyan-100/65 transition hover:bg-white/8 hover:text-white"
                  onClick={addLayer}
                  title="Add layer"
                  type="button"
                >
                  <Layers3 aria-hidden size={17} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <EditorActionButton
                  Icon={Eye}
                  label="View map"
                  onClick={openGameView}
                />
                <EditorActionButton
                  Icon={Download}
                  label="Download map"
                  onClick={downloadMap}
                />
                <EditorActionButton
                  Icon={Upload}
                  label="Restore map"
                  onClick={openRestorePanel}
                />
                <EditorActionButton
                  disabled={uploadState === "uploading"}
                  Icon={publishedMapId ? Save : CloudUpload}
                  label={publishedMapId ? "Save map" : "Publish map"}
                  onClick={publishMap}
                />
                <EditorActionButton
                  Icon={FilePlus2}
                  label="New map"
                  onClick={createNewMap}
                />
                <input
                  accept="application/json,.json"
                  className="hidden"
                  onChange={restoreDownloadedMap}
                  ref={mapFileInputRef}
                  type="file"
                />
              </div>
            </div>
            <p className="font-space text-[10px] uppercase tracking-[0.17em] text-[#aab2b4]">
              {tileCount} tiles /{" "}
              {document.layers.reduce(
                (count, layer) => count + layer.items.length,
                0,
              )}{" "}
              items
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-[#0a0e11]/90 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
            {TOOLS.map((entry) => (
              <button
                aria-label={`${entry.label} tool. Press ${entry.shortcut}.`}
                aria-pressed={tool === entry.id}
                className={`group relative flex h-12 w-12 items-center justify-center rounded-xl outline-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e11] ${
                  tool === entry.id
                    ? "bg-amber-100 text-[#17130f]"
                    : "text-[#c9c0b5] hover:bg-white/8 hover:text-white"
                }`}
                key={entry.id}
                onClick={() => {
                  setTool(entry.id);
                  setPreview([]);
                }}
                type="button"
              >
                <entry.Icon aria-hidden size={20} strokeWidth={1.8} />
                <kbd className="absolute left-1 top-0.5 font-mono text-[9px] font-bold opacity-70">
                  {entry.shortcut}
                </kbd>
                <span className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded bg-black px-2 py-1 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {entry.label}
                </span>
              </button>
            ))}
            <div className="ml-auto flex flex-wrap gap-2">
              <EditorActionButton
                disabled={!history.past.length}
                Icon={Undo2}
                label="Undo"
                onClick={undo}
                shortcut="Z"
              />
              <EditorActionButton
                disabled={!history.future.length}
                Icon={Redo2}
                label="Redo"
                onClick={redo}
                shortcut="X"
              />
              <EditorActionButton
                Icon={Trash2}
                label="Clear map"
                onClick={clearMap}
                shortcut="C"
              />
              <EditorActionButton
                active={showGrid}
                Icon={Grid3x3}
                label={`${showGrid ? "Hide" : "Show"} grid`}
                onClick={() => setShowGrid((current) => !current)}
                shortcut="G"
              />
              <EditorActionButton
                active={snapToGrid}
                Icon={Magnet}
                label={`${snapToGrid ? "Disable" : "Enable"} snap to grid`}
                onClick={() => setSnapToGrid((current) => !current)}
                shortcut="H"
              />
              <EditorActionButton
                Icon={Fence}
                label="Border"
                onClick={() =>
                  commitDocument((current) =>
                    applyWoodBorder(current, selectedLayerId),
                  )
                }
              />
              <EditorActionButton
                Icon={CircleOff}
                label="Clear border"
                onClick={() =>
                  commitDocument((current) =>
                    clearWoodBorder(current, selectedLayerId),
                  )
                }
              />
            </div>
          </div>

          <div className="mt-5 overflow-auto rounded-2xl border border-cyan-100/10 bg-[#070a0c] p-4 scrollbar-pill shadow-[0_0_0_4px_rgba(0,0,0,0.16)_inset]">
            <div
              aria-label={`Layer ${selectedLayerId} tilemap`}
              className="relative grid touch-none select-none"
              onPointerCancel={handlePointerUp}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              ref={canvasRef}
              role="grid"
              style={{
                gridTemplateColumns: `repeat(${document.width}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${document.height}, ${CELL_SIZE}px)`,
                height: document.height * CELL_SIZE,
                width: document.width * CELL_SIZE,
              }}
            >
              {Array.from(
                { length: document.width * document.height },
                (_, index) => {
                  const point = {
                    x: index % document.width,
                    y: Math.floor(index / document.width),
                  };
                  const cellKey = pointKey(point);
                  const isPreview = previewKeys.has(cellKey);
                  const layerLabel = document.layers.reduce<number | null>(
                    (visible, layer) => {
                      const label = layer.border[index] ?? layer.tiles[index];
                      return label ?? visible;
                    },
                    null,
                  );
                  const visibleLabel = isPreview
                    ? tool === "erase"
                      ? null
                      : (previewLabels.get(cellKey) ?? selectedLabel)
                    : layerLabel;

                  return (
                    <div
                      aria-label={`cell ${point.x + 1}, ${point.y + 1}`}
                      className={`relative bg-[#101216] ${
                        showGrid ? "border-r border-b border-white/12" : ""
                      } ${isPreview ? "bg-amber-100/20" : ""}`}
                      key={`${point.x}-${point.y}`}
                      role="gridcell"
                      style={{ height: CELL_SIZE, width: CELL_SIZE }}
                    >
                      {visibleLabel !== null ? (
                        <Image
                          alt=""
                          aria-hidden
                          className="h-full w-full [image-rendering:pixelated]"
                          draggable={false}
                          height={TILE_SOURCE_SIZE}
                          src={`/assets/floorsandwalls/${fileNameForSheetLabel(visibleLabel)}`}
                          unoptimized
                          width={TILE_SOURCE_SIZE}
                        />
                      ) : null}
                      {isPreview ? (
                        <span className="pointer-events-none absolute inset-0 border-2 border-amber-100/80" />
                      ) : null}
                    </div>
                  );
                },
              )}
              {document.layers.map((layer, layerIndex) =>
                layer.items.map((item) =>
                  (() => {
                    const renderSize = itemRenderSize(
                      item,
                      CELL_SIZE,
                      TILE_SOURCE_SIZE,
                    );
                    return (
                      <div
                        aria-label={`Item ${item.assetPath}`}
                        className={`pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-md ${selection?.type === "item" && selection.layerId === layer.id && selection.itemId === item.id ? "ring-2 ring-amber-100" : ""}`}
                        key={`${layer.id}-${item.id}`}
                        style={{
                          left: item.x * CELL_SIZE,
                          top: item.y * CELL_SIZE,
                          width: item.width * CELL_SIZE,
                          height: item.height * CELL_SIZE,
                          zIndex: 20 + layerIndex,
                        }}
                      >
                        <Image
                          alt=""
                          aria-hidden
                          className="object-contain [image-rendering:pixelated]"
                          draggable={false}
                          height={item.sourceHeight}
                          key={item.assetPath}
                          src={normalizeAssetPath(item.assetPath)}
                          style={{
                            height: renderSize.height,
                            width: renderSize.width,
                          }}
                          unoptimized
                          width={item.sourceWidth}
                        />
                      </div>
                    );
                  })(),
                ),
              )}
            </div>
          </div>

          <div className="mt-4 text-xs text-[#a8a09a]">
            <p>
              {tool === "line"
                ? "Line snaps to the dominant axis for clean horizontal or vertical runs."
                : tool === "rectangle"
                  ? "Rectangle fills every cell between the drag start and end."
                  : "Click or drag across cells to paint the selected tile."}
            </p>
          </div>
        </section>

        <aside className="min-w-0 rounded-[1.75rem] border border-white/10 bg-[#10171a]/90 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-md sm:p-5 xl:sticky xl:top-6 xl:self-start">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Palette
              aria-label="Tile and item palette"
              className="text-cyan-100/70"
              size={22}
            />
            <button
              aria-label="Generate random layout"
              className="rounded-xl bg-[#e9dbc8] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#1a1510] transition hover:bg-white"
              onClick={() => {
                commitDocument((current) => {
                  const generated = createRandomLayoutMap(
                    current.width,
                    current.height,
                  );
                  const generatedLayer = generated.layers[0];
                  const targetLayerId =
                    current.layers.find((layer) => layer.id === "00")?.id ??
                    current.layers[0]?.id;
                  return {
                    ...current,
                    layers: current.layers.map((layer) =>
                      layer.id === targetLayerId && generatedLayer
                        ? {
                            ...layer,
                            tiles: generatedLayer.tiles,
                            border: generatedLayer.border,
                          }
                        : layer,
                    ),
                  };
                });
                setSelectedLayerId("00");
                setSelection(null);
              }}
              title="Generate random layout"
              type="button"
            >
              <Sparkles aria-hidden size={16} />
            </button>
          </div>

          {uploadMessage ? (
            <p aria-live="polite" className="sr-only">
              {uploadMessage}
            </p>
          ) : null}

          <div className="mt-4 flex rounded-2xl border border-white/8 bg-white/4 p-1">
            {(["tile", "items"] as const).map((tab) => (
              <button
                aria-pressed={activeTab === tab}
                className={`flex-1 rounded-xl px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] ${activeTab === tab ? "bg-[#f4eadc] text-[#17130f]" : "text-[#aeb6b7] hover:bg-white/8"}`}
                key={tab}
                onClick={() => setActiveTab(tab)}
                tabIndex={activeTab === tab ? 0 : -1}
                type="button"
              >
                {tab === "tile" ? "Tile" : "Item search"}
              </button>
            ))}
          </div>

          {activeTab === "tile" ? (
            <div className="mt-4 overflow-auto rounded-2xl border border-amber-100/12 bg-[#0b0d0f] p-2 scrollbar-pill">
              <div
                className="grid w-max"
                style={{
                  gridTemplateColumns: `repeat(18, ${PALETTE_CELL_SIZE}px)`,
                  gridTemplateRows: `repeat(9, ${PALETTE_CELL_SIZE}px)`,
                }}
              >
                {atlasTiles.map((tile) => (
                  <PaletteTile
                    isSelected={
                      selectedAsset === null && selectedLabel === tile.label
                    }
                    key={tile.label}
                    onSelect={() => {
                      setSelectedLabel(tile.label);
                      setSelectedAsset(null);
                      setTool("brush");
                    }}
                    tile={tile}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-amber-100/12 bg-[#0b0d0f] p-3">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-2.5 text-[#778084]"
                    size={15}
                  />
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-200/50"
                    onChange={(event) => setAssetSearch(event.target.value)}
                    placeholder="Search items"
                    value={assetSearch}
                  />
                </div>
                <select
                  className="max-w-[120px] rounded-xl border border-white/10 bg-black/20 px-2 text-xs outline-none"
                  onChange={(event) => setAssetFolder(event.target.value)}
                  value={assetFolder}
                >
                  <option value="all">All folders</option>
                  {assetFolders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 grid max-h-80 grid-cols-3 gap-2 overflow-auto pr-1 scrollbar-translucent">
                {collapsePaletteAssetEntries(assetEntries)
                  .filter(
                    (asset) =>
                      (assetFolder === "all" || asset.folder === assetFolder) &&
                      asset.name
                        .toLowerCase()
                        .includes(assetSearch.toLowerCase()),
                  )
                  .map((asset) => (
                    <button
                      aria-pressed={
                        selectedAsset?.assetPath === asset.assetPath
                      }
                      className={`overflow-hidden rounded-xl border p-1 text-left outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 ${selectedAsset?.assetPath === asset.assetPath ? "border-amber-100 bg-amber-100/15" : "border-white/10 hover:border-white/30"}`}
                      key={asset.assetPath}
                      onClick={() => {
                        setSelectedAsset(asset);
                        setSelection(null);
                        setTool("brush");
                      }}
                      type="button"
                    >
                      <div className="relative h-16 w-full">
                        <Image
                          alt={asset.name}
                          className="object-contain"
                          fill
                          src={asset.assetPath}
                          unoptimized
                          onLoad={(event) =>
                            setAssetDimensions((current) => ({
                              ...current,
                              [asset.assetPath]: {
                                width: event.currentTarget.naturalWidth,
                                height: event.currentTarget.naturalHeight,
                              },
                            }))
                          }
                        />
                      </div>
                      <span className="block truncate px-1 pb-1 pt-1 font-mono text-[9px] text-[#c9c0b5]">
                        {asset.name}
                      </span>
                    </button>
                  ))}
              </div>
              <p className="mt-2 font-mono text-[10px] leading-4 text-[#778084]">
                Select an item, then click the map to place it. Small items can
                be placed on tables and kitchen counters. Arrow keys move the
                selected item; A/D rotate front, side, and back; Delete removes
                the selection; Esc deselects; H toggles snap-to-grid.
              </p>
            </div>
          )}

          {activeTab === "tile" ? (
            <div className="mt-4 rounded-2xl border border-white/8 bg-white/4 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#aeb6b7]">
                  Rectangle tiles
                </p>
                <span
                  aria-label="Rectangle tool"
                  className="text-[#778084]"
                  title="Rectangle tool"
                >
                  <Square aria-hidden size={15} strokeWidth={1.8} />
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["tile", "region"] as const).map((source) => (
                  <button
                    aria-pressed={rectangleSource === source}
                    className={`rounded-lg border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.08em] outline-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 ${
                      rectangleSource === source
                        ? "border-amber-200/40 bg-amber-100 text-[#17130f]"
                        : "border-white/10 text-[#b7ae9f] hover:bg-white/8 hover:text-white"
                    }`}
                    key={source}
                    onClick={() => setRectangleSource(source)}
                    tabIndex={rectangleSource === source ? 0 : -1}
                    type="button"
                  >
                    {source === "tile" ? "Individual tile" : "Region"}
                  </button>
                ))}
              </div>
              {rectangleSource === "region" ? (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {RECTANGLE_SELECTIONS.map((selection) => {
                    const isSelected =
                      rectangleSelection.region === selection.region &&
                      rectangleSelection.role === selection.role;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`rounded-lg border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.08em] outline-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 ${
                          isSelected
                            ? "border-amber-200/40 bg-amber-100 text-[#17130f]"
                            : "border-white/10 text-[#b7ae9f] hover:bg-white/8 hover:text-white"
                        }`}
                        key={selection.label}
                        onClick={() =>
                          setRectangleSelection({
                            region: selection.region,
                            role: selection.role,
                          })
                        }
                        type="button"
                      >
                        {selection.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 font-mono text-[10px] leading-4 text-[#778084]">
                  Rectangle fills with the selected atlas tile.
                </p>
              )}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 text-xs leading-5 text-[#b2aaa1]">
            <div className="rounded-2xl border border-white/8 p-4">
              <p className="font-mono uppercase tracking-[0.16em] text-[#e7d4bc]">
                Map shape
              </p>
              <p className="mt-2">
                Rooms and corridors are an occupancy mask first. Tile labels are
                then chosen from one coherent region per footprint so generated
                walls do not become striped material bands.
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 p-4">
              <p className="font-mono uppercase tracking-[0.16em] text-[#e7d4bc]">
                Saved shape
              </p>
              <p className="mt-2">
                Every layer is user-controlled and stores its own tiles,
                optional generated border overlay, and positioned items.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {isRestorePanelOpen ? (
        <div
          aria-label="Restore map panel"
          className="fixed inset-0 z-100 grid place-items-center bg-[#020608]/80 px-4 py-6 backdrop-blur-md"
          data-map-overlay
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setIsRestorePanelOpen(false);
          }}
          role="presentation"
        >
          <section
            aria-labelledby="restore-map-title"
            aria-modal="true"
            className="max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-cyan-100/15 bg-[#0c171c]/95 p-5 text-[#f7f0e6] shadow-[0_30px_100px_rgba(0,0,0,0.6),0_0_50px_rgba(46,180,176,0.07)] backdrop-blur-md scrollbar-pill sm:p-7"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-space text-[10px] uppercase tracking-[0.28em] text-cyan-100/55">
                  Restore map
                </p>
                <h2
                  className="mt-2 font-display text-3xl tracking-[-0.03em] text-[#f7f0e6] sm:text-4xl"
                  id="restore-map-title"
                >
                  Choose a map source
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-white/40">
                  Load a published map or bring back a JSON file from this
                  editor.
                </p>
              </div>
              <button
                aria-label="Close restore map panel"
                className="group relative -mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center text-white/45 outline-none transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                onClick={() => setIsRestorePanelOpen(false)}
                type="button"
              >
                <X aria-hidden size={18} />
                <span className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded bg-black/90 px-2 py-1 font-space text-[10px] uppercase tracking-[0.08em] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Close
                </span>
              </button>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="flex flex-col rounded-2xl border border-cyan-100/12 bg-black/25 p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full border border-cyan-100/25 bg-cyan-200/[0.06] text-cyan-100 shadow-[0_0_24px_rgba(103,232,249,0.1)]">
                    <Database aria-hidden size={18} />
                  </span>
                  <div>
                    <h3 className="text-base text-[#f7f0e6]">Existing map</h3>
                    <p className="mt-0.5 font-space text-[9px] uppercase tracking-[0.16em] text-cyan-100/50">
                      Published
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/40">
                  Load a published map from the database.
                </p>
                <label className="sr-only" htmlFor="saved-map-select">
                  Existing maps
                </label>
                <select
                  aria-busy={restorePanelState === "loading"}
                  className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-[#f7f0e6] outline-none transition focus:border-cyan-100/45 focus:ring-2 focus:ring-cyan-100/15 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={
                    restorePanelState === "loading" || !savedMaps.length
                  }
                  id="saved-map-select"
                  onChange={(event) => setRestoreMapId(event.target.value)}
                  value={restoreMapId}
                >
                  <option value="">
                    {restorePanelState === "loading"
                      ? "Loading maps..."
                      : savedMaps.length
                        ? "Select a map"
                        : "No saved maps"}
                  </option>
                  {savedMaps.map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.name}
                    </option>
                  ))}
                </select>
                {restorePanelState === "loading" ? (
                  <p
                    aria-live="polite"
                    className="mt-2 font-space text-[10px] uppercase tracking-[0.14em] text-cyan-100/50"
                  >
                    Fetching published maps
                  </p>
                ) : null}
                {restorePanelState !== "loading" && !savedMaps.length ? (
                  <p className="mt-2 text-sm leading-5 text-white/35">
                    No published maps yet. Publish one from this editor, or use
                    a downloaded file.
                  </p>
                ) : null}
                <button
                  className="mt-4 w-full rounded-xl bg-[#f4eadc] px-3 py-2.5 font-space text-[10px] font-bold uppercase tracking-[0.14em] text-[#17130f] shadow-[0_0_18px_rgba(244,234,220,0.12)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none sm:mt-auto"
                  disabled={!restoreMapId || restorePanelState === "loading"}
                  onClick={restoreSavedMap}
                  type="button"
                >
                  {restorePanelState === "loading" && restoreMapId
                    ? "Restoring..."
                    : "Restore selected map"}
                </button>
              </div>

              <div className="flex flex-col rounded-2xl border border-cyan-100/12 bg-black/25 p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full border border-cyan-100/25 bg-cyan-200/[0.06] text-cyan-100 shadow-[0_0_24px_rgba(103,232,249,0.1)]">
                    <FileJson aria-hidden size={18} />
                  </span>
                  <div>
                    <h3 className="text-base text-[#f7f0e6]">Downloaded map</h3>
                    <p className="mt-0.5 font-space text-[9px] uppercase tracking-[0.16em] text-cyan-100/50">
                      Local file
                    </p>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm leading-6 text-white/40">
                  Restore a JSON map downloaded from this editor.
                </p>
                <button
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-100/25 bg-black/25 px-3 py-2.5 font-space text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-50 transition hover:border-cyan-100/50 hover:bg-cyan-200/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 sm:mt-auto"
                  onClick={() => mapFileInputRef.current?.click()}
                  type="button"
                >
                  <Upload aria-hidden size={15} />
                  Choose JSON file
                </button>
              </div>
            </div>

            {restorePanelMessage ? (
              <p
                aria-live="polite"
                className="mt-4 rounded-xl border border-red-300/25 bg-red-950/35 px-3 py-2.5 text-sm leading-5 text-red-100"
                role="alert"
              >
                {restorePanelMessage}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function EditorActionButton({
  active,
  disabled = false,
  Icon,
  label,
  onClick,
  shortcut,
}: {
  active?: boolean;
  disabled?: boolean;
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      aria-label={shortcut ? `${label}. Press ${shortcut}.` : label}
      aria-pressed={active === undefined ? undefined : active}
      className={`group relative flex h-12 w-12 items-center justify-center rounded-xl border outline-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e11] disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "border-amber-200/30 bg-amber-100/10 text-amber-100"
          : "border-white/10 text-[#8e989b] hover:bg-white/8 hover:text-white"
      }`}
      disabled={disabled}
      onClick={onClick}
      title={shortcut ? `${label} · press ${shortcut}` : label}
      type="button"
    >
      <Icon aria-hidden size={19} strokeWidth={1.8} />
      {shortcut ? (
        <kbd className="absolute left-1 top-0.5 font-mono text-[9px] font-bold opacity-70">
          {shortcut}
        </kbd>
      ) : null}
      <span className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded bg-black px-2 py-1 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

function PaletteTile({
  isSelected,
  onSelect,
  tile,
}: {
  isSelected: boolean;
  onSelect: () => void;
  tile: AtlasTile;
}) {
  return (
    <button
      aria-label={`Select tile ${tile.label}, ${tile.role}, region ${tile.region}`}
      aria-pressed={isSelected}
      className={`relative overflow-hidden border-r border-b border-white/20 bg-[#25272a] outline-none transition focus:outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-amber-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d0f] hover:z-10 hover:scale-[1.12] hover:ring-2 hover:ring-amber-100/80 ${
        isSelected ? "z-20 ring-2 ring-amber-100" : ""
      }`}
      onClick={onSelect}
      title={`tile ${tile.label} · ${tile.role} · region ${tile.region}`}
      type="button"
    >
      <Image
        alt=""
        aria-hidden
        className="h-full w-full [image-rendering:pixelated]"
        draggable={false}
        height={TILE_SOURCE_SIZE}
        src={`/assets/floorsandwalls/${tile.fileName}`}
        unoptimized
        width={TILE_SOURCE_SIZE}
      />
      <span className="absolute left-0.5 top-0.5 rounded bg-black/75 px-1 font-mono text-[9px] leading-3 text-white">
        {tile.label}
      </span>
    </button>
  );
}

function paintPoints(
  document: MapDocument,
  points: Point[],
  label: number | null,
  layerId: string,
): MapDocument {
  const layer =
    document.layers.find((candidate) => candidate.id === layerId) ??
    document.layers[0];
  if (!layer) return document;
  const tiles = [...layer.tiles];
  const border = [...layer.border];
  for (const point of points) {
    if (
      point.x >= 0 &&
      point.x < document.width &&
      point.y >= 0 &&
      point.y < document.height
    ) {
      const index = point.y * document.width + point.x;
      tiles[index] = label;
      border[index] = null;
    }
  }
  return {
    ...document,
    layers: document.layers.map((candidate) =>
      candidate.id === layer.id ? { ...candidate, tiles, border } : candidate,
    ),
  };
}

function pointsForTool(tool: DrawTool, start: Point, end: Point): Point[] {
  if (tool === "line") {
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    const points: Point[] = [];
    if (horizontal) {
      const min = Math.min(start.x, end.x);
      const max = Math.max(start.x, end.x);
      for (let x = min; x <= max; x += 1) {
        points.push({ x, y: start.y });
      }
    } else {
      const min = Math.min(start.y, end.y);
      const max = Math.max(start.y, end.y);
      for (let y = min; y <= max; y += 1) {
        points.push({ x: start.x, y });
      }
    }
    return points;
  }

  const points: Point[] = [];
  for (
    let y = Math.min(start.y, end.y);
    y <= Math.max(start.y, end.y);
    y += 1
  ) {
    for (
      let x = Math.min(start.x, end.x);
      x <= Math.max(start.x, end.x);
      x += 1
    ) {
      points.push({ x, y });
    }
  }
  return points;
}

function pointKey(point: Point) {
  return `${point.x}:${point.y}`;
}
