import Image from "next/image";
import { DialoguePanel } from "@/app/components/dialogue/DialoguePanel";
import { PLAYER_SPEED, VIEW_HEIGHT, VIEW_WIDTH } from "@/lib/game/config";
import type { NpcDialogueView } from "@/lib/game/useNpcDialogue";
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

export type MapRendererNpc = {
  direction: PlayerDirection;
  id: string;
  isTarget?: boolean;
  name: string;
  position: PlayerPosition;
  spriteFrames?: Record<string, string> | null;
  spriteUrl: string | null;
};

export default function MapRenderer({
  cameraX,
  cameraY,
  document,
  dialogue,
  npcs = [],
  player,
  playerDirection = "down",
}: {
  cameraX: number;
  cameraY: number;
  document: MapDocument;
  dialogue?: NpcDialogueView | null;
  npcs?: MapRendererNpc[];
  player: PlayerPosition | null;
  playerDirection?: PlayerDirection;
}) {
  return (
    <div
      className="flex max-w-full flex-col gap-4"
      style={{ width: VIEW_WIDTH * MAP_CELL_SIZE }}
    >
      <div
        aria-label="Walk-through map"
        className="relative max-w-full overflow-hidden bg-[#101216] touch-none"
        role="application"
        style={{
          height: VIEW_HEIGHT * MAP_CELL_SIZE,
          width: VIEW_WIDTH * MAP_CELL_SIZE,
        }}
      >
        <div
          className="absolute grid"
          style={{
            gridTemplateColumns: `repeat(${document.width}, ${MAP_CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${document.height}, ${MAP_CELL_SIZE}px)`,
            height: document.height * MAP_CELL_SIZE,
            left: -cameraX * MAP_CELL_SIZE,
            top: -cameraY * MAP_CELL_SIZE,
            transition: `left ${1000 / PLAYER_SPEED}ms linear, top ${1000 / PLAYER_SPEED}ms linear`,
            width: document.width * MAP_CELL_SIZE,
            willChange: "left, top",
          }}
        >
          {Array.from(
            { length: document.width * document.height },
            (_, index) => {
              const label = visibleTileLabel(document, index);
              return (
                <div
                  className="relative bg-[#101216]"
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
            },
          )}
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
              cellSize={MAP_CELL_SIZE}
              direction={npc.direction}
              isTarget={npc.isTarget}
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
      </div>
      {dialogue ? (
        <div className="relative z-[100] -mt-[200px] w-full border border-white/20 bg-black px-6 py-7 text-white shadow-[0_18px_55px_rgba(0,0,0,0.45)] sm:px-10 sm:py-9">
          <button
            aria-label="Close conversation"
            className="absolute right-4 top-3 z-10 px-2 text-2xl text-white/50 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={dialogue.onClose}
            type="button"
          >
            ×
          </button>
          <p className="mb-7 font-space text-[10px] tracking-[0.24em] text-white/45">
            {dialogue.npcName}
          </p>
          <DialoguePanel
            view={dialogue.view}
            theme="space"
            typingGateRef={dialogue.typingGateRef}
            onAdvance={dialogue.onAdvance}
            onChoose={dialogue.onChoose}
            onRestart={dialogue.onRestart}
            revealKey={dialogue.key}
            size="md"
            className="flex min-h-[18rem] flex-col"
          />
          {dialogue.freeChat ? (
            <form
              className="mt-8 border-t border-white/15 pt-6"
              onSubmit={(event) => {
                event.preventDefault();
                dialogue.freeChat?.onSubmit();
              }}
            >
              <label
                className="font-space text-[10px] uppercase tracking-[0.2em] text-white/50"
                htmlFor="npc-free-question"
              >
                Ask {dialogue.npcName}
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  autoFocus
                  className="min-w-0 flex-1 border border-white/20 bg-white/5 px-4 py-3 font-space text-sm text-white outline-none placeholder:text-white/35 focus:border-white/60"
                  id="npc-free-question"
                  onChange={(event) =>
                    dialogue.freeChat?.onChange(event.target.value)
                  }
                  placeholder="What are you wondering about?"
                  value={dialogue.freeChat.value}
                />
                <button
                  className="border border-white/30 px-5 py-3 font-space text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={
                    dialogue.freeChat.isThinking ||
                    !dialogue.freeChat.value.trim()
                  }
                  type="submit"
                >
                  {dialogue.freeChat.isThinking ? "Thinking…" : "Ask"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
