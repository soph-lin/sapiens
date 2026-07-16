import Image from "next/image";
import { PLAYER_SPEED, PLAYER_SPRITE_SCALE } from "@/lib/game/config";
import type { PlayerDirection, PlayerPosition } from "@/lib/game/movement";

const NPC_FRAME_KEYS: Record<PlayerDirection, string> = {
  up: "north",
  down: "south",
  left: "west",
  right: "east",
};

export default function Npc({
  cellSize,
  direction,
  isTarget = false,
  name,
  position,
  spriteFrames,
  spriteUrl,
}: {
  cellSize: number;
  direction: PlayerDirection;
  isTarget?: boolean;
  name: string;
  position: PlayerPosition;
  spriteFrames?: Record<string, string> | null;
  spriteUrl: string | null;
}) {
  const frameUrl = spriteFrames?.[NPC_FRAME_KEYS[direction]] ?? spriteUrl;

  return (
    <div
      aria-label={`${name}, non-player character`}
      className="pointer-events-none absolute z-40"
      data-direction={direction}
      style={{
        height: cellSize,
        left: position.x * cellSize,
        top: position.y * cellSize,
        transition: `left ${1000 / PLAYER_SPEED}ms linear, top ${1000 / PLAYER_SPEED}ms linear`,
        willChange: "left, top",
        width: cellSize,
      }}
    >
      {frameUrl ? (
        <Image
          alt=""
          aria-hidden
          className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain [image-rendering:pixelated]"
          draggable={false}
          height={88}
          src={frameUrl}
          style={{
            height: cellSize * PLAYER_SPRITE_SCALE,
            width: cellSize * PLAYER_SPRITE_SCALE,
          }}
          unoptimized
          width={88}
        />
      ) : (
        <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-100/80 bg-amber-400 text-sm font-bold text-[#301b09]">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      {isTarget ? (
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-amber-200/50 bg-[#24190d]/95 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-amber-100 shadow-lg">
          Z · talk
        </div>
      ) : null}
    </div>
  );
}
