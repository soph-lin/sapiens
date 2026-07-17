"use client";

import Image from "next/image";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { dialogueContinueHint } from "@/app/components/dialogue/DialogueBox";
import { DialoguePanel } from "@/app/components/dialogue/DialoguePanel";
import { THEMES } from "@/app/components/dialogue/theme";
import {
  NPC_TOOLTIP_OFFSET,
  PLAYER_SPEED,
  npcSpriteScale,
} from "@/lib/game/config";
import type { NpcDialogueView } from "@/lib/game/npc/useNpcDialogue";
import type { ItemDialogueView } from "@/lib/game/items/useItemDialogue";
import type { ItemInteractionTarget } from "@/lib/game/interactions";
import {
  fileNameForSheetLabel,
  itemRenderSize,
  normalizeAssetPath,
  TILE_SOURCE_SIZE,
  type MapDocument,
} from "@/lib/game/map";
import {
  visibleTileLabel,
  type PlayerDirection,
  type PlayerPosition,
} from "@/lib/game/movement";
import Npc from "./Npc";
import Player from "./Player";

export const MAP_CELL_SIZE = 48;

export type ViewTiles = {
  width: number;
  height: number;
};

export function pixelsToViewTiles(
  width: number,
  height: number,
  mapWidth?: number,
  mapHeight?: number,
): ViewTiles {
  const tiles = {
    width: Math.max(1, Math.floor(width / MAP_CELL_SIZE)),
    height: Math.max(1, Math.floor(height / MAP_CELL_SIZE)),
  };
  return {
    width: mapWidth ? Math.min(tiles.width, mapWidth) : tiles.width,
    height: mapHeight ? Math.min(tiles.height, mapHeight) : tiles.height,
  };
}

export type MapRendererNpc = {
  ageRange?: string | null;
  direction: PlayerDirection;
  id: string;
  isTarget?: boolean;
  name: string;
  position: PlayerPosition;
  spriteFrames?: Record<string, string> | null;
  spriteUrl: string | null;
};

function InteractTooltip({
  left,
  top,
  transition,
}: {
  left: number;
  top: number;
  transition?: string;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-50 whitespace-nowrap rounded-full border border-black/10 bg-white px-2 py-1 font-space text-[9px] uppercase tracking-[0.12em] text-black shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
      style={{
        left,
        top,
        transform: "translate(-50%, -100%)",
        transition,
        willChange: "left, top",
      }}
    >
      Z
    </div>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export default function MapRenderer({
  cameraX,
  cameraY,
  document,
  dialogue,
  fieldNotes,
  npcs = [],
  onReadyChange,
  onViewTilesChange,
  player,
  playerDirection = "down",
  targetItem,
}: {
  cameraX: number;
  cameraY: number;
  document: MapDocument;
  dialogue?: NpcDialogueView | ItemDialogueView | null;
  fieldNotes?: ReactNode;
  npcs?: MapRendererNpc[];
  onReadyChange?: (ready: boolean) => void;
  onViewTilesChange?: (tiles: ViewTiles) => void;
  player: PlayerPosition | null;
  playerDirection?: PlayerDirection;
  targetItem?: ItemInteractionTarget;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const viewTilesRef = useRef<ViewTiles>({ width: 1, height: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportSize, setViewportSize] = useState({
    width: MAP_CELL_SIZE,
    height: MAP_CELL_SIZE,
  });
  const [fullscreenScale, setFullscreenScale] = useState(1);
  /** False until the first measured layout + camera have painted without motion. */
  const [layoutReady, setLayoutReady] = useState(false);
  const [typingDone, setTypingDone] = useState(false);
  const dialogueIdentity = `${dialogue?.key ?? ""}:${dialogue?.view ?? ""}`;
  const [typingIdentity, setTypingIdentity] = useState(dialogueIdentity);
  if (typingIdentity !== dialogueIdentity) {
    setTypingIdentity(dialogueIdentity);
    setTypingDone(false);
  }
  const onReadyChangeRef = useRef(onReadyChange);
  const onViewTilesChangeRef = useRef(onViewTilesChange);
  const cameraMotion =
    layoutReady
      ? (`left ${1000 / PLAYER_SPEED}ms linear, top ${1000 / PLAYER_SPEED}ms linear` as const)
      : undefined;

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    onViewTilesChangeRef.current = onViewTilesChange;
  }, [onViewTilesChange]);

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (globalThis.document.fullscreenElement === root) {
        await globalThis.document.exitFullscreen();
      } else if (globalThis.document.fullscreenElement) {
        await globalThis.document.exitFullscreen();
        await root.requestFullscreen();
      } else {
        await root.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by the browser or unsupported on the device.
    }
  }

  const onFullscreenShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "f") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    void toggleFullscreen();
  });

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(globalThis.document.fullscreenElement === rootRef.current);
    };
    globalThis.document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      globalThis.document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const container = viewportContainerRef.current;
    if (!container) return;
    setLayoutReady(false);
    onReadyChangeRef.current?.(false);

    const updateViewTiles = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const next = pixelsToViewTiles(
        width,
        height,
        document.width,
        document.height,
      );
      const nextSize = {
        width: next.width * MAP_CELL_SIZE,
        height: next.height * MAP_CELL_SIZE,
      };
      setViewportSize((prev) =>
        prev.width === nextSize.width && prev.height === nextSize.height
          ? prev
          : nextSize,
      );
      if (isFullscreen) {
        const scale = Math.max(
          width / nextSize.width,
          height / nextSize.height,
        );
        setFullscreenScale(
          Number.isFinite(scale) && scale > 0 ? scale : 1,
        );
      } else {
        setFullscreenScale(1);
      }
      const prev = viewTilesRef.current;
      if (prev.width === next.width && prev.height === next.height) return;
      viewTilesRef.current = next;
      onViewTilesChangeRef.current?.(next);
    };

    updateViewTiles();
    const observer = new ResizeObserver(updateViewTiles);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [document.height, document.width, isFullscreen]);

  // Wait until measured viewport + parent camera have committed, then reveal.
  // Camera CSS transitions stay off during this settle so the map does not
  // slide into place as the loading overlay lifts.
  useEffect(() => {
    if (layoutReady) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;

    let cancelled = false;
    let outerFrame = 0;
    let innerFrame = 0;
    outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        setLayoutReady(true);
        onReadyChangeRef.current?.(true);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [
    layoutReady,
    viewportSize.width,
    viewportSize.height,
    cameraX,
    cameraY,
    isFullscreen,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      onFullscreenShortcut(event);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const targetNpc = npcs.find((npc) => npc.isTarget);

  const interactTooltip = targetItem ? (
    <InteractTooltip
      left={(targetItem.item.x + targetItem.item.width / 2) * MAP_CELL_SIZE}
      top={targetItem.item.y * MAP_CELL_SIZE}
    />
  ) : targetNpc ? (
    <InteractTooltip
      left={targetNpc.position.x * MAP_CELL_SIZE + MAP_CELL_SIZE / 2}
      top={
        targetNpc.position.y * MAP_CELL_SIZE +
        MAP_CELL_SIZE / 2 -
        (MAP_CELL_SIZE * npcSpriteScale(targetNpc.ageRange)) / 2 +
        NPC_TOOLTIP_OFFSET
      }
      transition={cameraMotion}
    />
  ) : null;

  const interactTooltipLayer = interactTooltip ? (
    <div
      className="pointer-events-none absolute"
      style={{
        height: document.height * MAP_CELL_SIZE,
        left: -cameraX * MAP_CELL_SIZE,
        top: -cameraY * MAP_CELL_SIZE,
        transition: cameraMotion,
        width: document.width * MAP_CELL_SIZE,
        willChange: layoutReady ? "left, top" : undefined,
      }}
    >
      {interactTooltip}
    </div>
  ) : null;

  const fullscreenButton = (
    <div className="group pointer-events-auto absolute bottom-3 right-3 z-40">
      <button
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        aria-keyshortcuts="F"
        aria-pressed={isFullscreen}
        className="flex size-10 items-center justify-center rounded-full border border-cyan-100/20 bg-slate-950/90 text-cyan-100 shadow-[0_0_20px_rgba(103,232,249,0.12)] backdrop-blur transition hover:border-cyan-100/50 hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
        onClick={() => {
          void toggleFullscreen();
        }}
        type="button"
      >
        {isFullscreen ? (
          <Minimize2 aria-hidden size={16} />
        ) : (
          <Maximize2 aria-hidden size={16} />
        )}
      </button>
      <span className="pointer-events-none absolute right-0 bottom-[calc(100%+0.45rem)] rounded-md border border-cyan-100/15 bg-slate-950/95 px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-cyan-100/80 opacity-0 shadow-[0_0_20px_rgba(103,232,249,0.12)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {isFullscreen ? "Exit · F" : "Fullscreen · F"}
      </span>
    </div>
  );

  const mapScene = (
    <div
      className="absolute grid"
      style={{
        gridTemplateColumns: `repeat(${document.width}, ${MAP_CELL_SIZE}px)`,
        gridTemplateRows: `repeat(${document.height}, ${MAP_CELL_SIZE}px)`,
        height: document.height * MAP_CELL_SIZE,
        left: -cameraX * MAP_CELL_SIZE,
        top: -cameraY * MAP_CELL_SIZE,
        transition: cameraMotion,
        width: document.width * MAP_CELL_SIZE,
        willChange: layoutReady ? "left, top" : undefined,
      }}
    >
      {Array.from({ length: document.width * document.height }, (_, index) => {
        const label = visibleTileLabel(document, index);
        return (
          <div
            className="relative bg-[#0d1114]"
            key={index}
            style={{ height: MAP_CELL_SIZE, width: MAP_CELL_SIZE }}
          >
            {label !== null ? (
              <Image
                alt=""
                aria-hidden
                className="h-full w-full [image-rendering:pixelated]"
                draggable={false}
                height={TILE_SOURCE_SIZE}
                src={`/assets/floorsandwalls/${fileNameForSheetLabel(label)}`}
                unoptimized
                width={TILE_SOURCE_SIZE}
              />
            ) : null}
          </div>
        );
      })}
      {document.layers.map((layer, layerIndex) =>
        layer.items.map((item) => {
          const renderSize = itemRenderSize(
            item,
            MAP_CELL_SIZE,
            TILE_SOURCE_SIZE,
          );
          return (
            <div
              className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden"
              key={`${layer.id}-${item.id}`}
              style={{
                height: item.height * MAP_CELL_SIZE,
                left: item.x * MAP_CELL_SIZE,
                top: item.y * MAP_CELL_SIZE,
                width: item.width * MAP_CELL_SIZE,
                zIndex: 20 + layerIndex,
              }}
            >
              <Image
                alt=""
                aria-hidden
                className="object-contain [image-rendering:pixelated]"
                draggable={false}
                height={item.sourceHeight}
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
        }),
      )}
      {npcs.map((npc) => (
        <Npc
          ageRange={npc.ageRange}
          cellSize={MAP_CELL_SIZE}
          direction={npc.direction}
          key={npc.id}
          name={npc.name}
          position={npc.position}
          spriteFrames={npc.spriteFrames}
          spriteUrl={npc.spriteUrl}
        />
      ))}
      {player ? (
        <Player
          cellSize={MAP_CELL_SIZE}
          direction={playerDirection}
          position={player}
        />
      ) : null}
    </div>
  );

  return (
    <div
      className={`map-renderer relative flex min-h-0 w-full flex-1 flex-col${isFullscreen ? " map-renderer--fullscreen" : ""}${dialogue ? " map-renderer--dialogue-open" : ""}`}
      ref={rootRef}
    >
      <div
        className="map-renderer-stage relative min-h-0 w-full flex-1"
        ref={viewportContainerRef}
      >
        <div
          aria-hidden={!layoutReady}
          className="absolute left-1/2 top-1/2"
          style={{
            height: viewportSize.height,
            opacity: layoutReady ? 1 : 0,
            width: viewportSize.width,
            transform: isFullscreen
              ? `translate(-50%, -50%) scale(${fullscreenScale})`
              : "translate(-50%, -50%)",
            transformOrigin: "center center",
          }}
        >
          <div
            aria-label="Walk-through map"
            className={`map-renderer-viewport absolute inset-0 overflow-hidden bg-[#101216] touch-none${isFullscreen ? "" : " rounded-2xl"}`}
            role="application"
          >
            {mapScene}
          </div>
          <div className="pointer-events-none absolute inset-0 z-50 overflow-visible">
            {interactTooltipLayer}
          </div>
          <div className="pointer-events-none absolute inset-0 z-40">
            {fullscreenButton}
          </div>
        </div>
      </div>
      {fieldNotes ? (
        <div className="pointer-events-none absolute inset-0 z-[120]">
          {fieldNotes}
        </div>
      ) : null}
      {dialogue ? (
        <div
          className="map-dialogue-stack pointer-events-none absolute inset-x-0 bottom-0 z-100 flex justify-center px-5 sm:px-8"
          data-map-overlay
        >
          <div className="pointer-events-auto flex w-full max-w-2xl flex-col">
            {dialogue.characterPortrait?.assetUrl ? (
              <div className="map-dialogue-portrait flex justify-start">
                <Image
                  src={dialogue.characterPortrait.assetUrl}
                  alt={`${dialogue.characterPortrait.name} portrait`}
                  width={256}
                  height={256}
                  unoptimized
                  className="block object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            ) : null}
            <div className="map-dialogue relative overflow-y-auto rounded-2xl border px-5 py-6 text-white sm:px-8 sm:py-8">
              <button
                aria-label="Close conversation"
                className="absolute right-3 top-3 z-10 rounded-full p-2 text-white/45 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100"
                onClick={dialogue.onClose}
                type="button"
              >
                <X aria-hidden size={18} />
              </button>
              <p className="mb-6 font-space text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">
                {dialogue.npcName}
              </p>
              <DialoguePanel
                view={dialogue.view}
                theme="space"
                typingGateRef={dialogue.typingGateRef}
                onAdvance={dialogue.onAdvance}
                onChoose={dialogue.onChoose}
                onRestart={dialogue.onRestart}
                onTypingChange={setTypingDone}
                showHint={false}
                editableChoice={
                  dialogue.freeChat
                    ? {
                        label: dialogue.freeChat.label,
                        value: dialogue.freeChat.value,
                        placeholder: dialogue.freeChat.placeholder,
                        onChange: dialogue.freeChat.onChange,
                        onSubmit: dialogue.freeChat.onSubmit,
                      }
                    : undefined
                }
                revealKey={dialogue.key}
                size="md"
                className="flex flex-col"
              />
            </div>
            {(() => {
              const continueHint = dialogueContinueHint(
                dialogue.view,
                typingDone,
              );
              return continueHint ? (
                <p className={`${THEMES.space.hint} mt-3`}>{continueHint}</p>
              ) : null;
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
