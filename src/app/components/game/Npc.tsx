import Image from "next/image";
import { NPC_SPEED, npcSpriteScale } from "@/lib/game/config";
import type { PlayerDirection, PlayerPosition } from "@/lib/game/movement";

const NPC_FRAME_KEYS: Record<PlayerDirection, string> = {
  up: "north",
  down: "south",
  left: "west",
  right: "east",
};

export default function Npc({
  ageRange,
  cellSize,
  direction,
  name,
  position,
  spriteFrames,
  spriteUrl,
}: {
  ageRange?: string | null;
  cellSize: number;
  direction: PlayerDirection;
  name: string;
  position: PlayerPosition;
  spriteFrames?: Record<string, string> | null;
  spriteUrl: string | null;
}) {
  const frameUrl = spriteFrames?.[NPC_FRAME_KEYS[direction]] ?? spriteUrl;
  const spriteScale = npcSpriteScale(ageRange);

  return (
    <div
      aria-label={`${name}, non-player character`}
      className="pointer-events-none absolute z-40"
      data-direction={direction}
      style={{
        height: cellSize,
        left: position.x * cellSize,
        top: position.y * cellSize,
        transition: `left ${1000 / NPC_SPEED}ms linear, top ${1000 / NPC_SPEED}ms linear`,
        willChange: "left, top",
        width: cellSize,
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          height: cellSize * spriteScale,
          width: cellSize * spriteScale,
        }}
      >
        {frameUrl ? (
          <Image
            alt=""
            aria-hidden
            className="h-full w-full max-w-none object-contain [image-rendering:pixelated]"
            draggable={false}
            height={88}
            src={frameUrl}
            unoptimized
            width={88}
          />
        ) : (
          <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-100/80 bg-cyan-300 text-sm font-bold text-[#082b2d] shadow-[0_0_20px_rgba(103,232,249,0.35)]">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}
