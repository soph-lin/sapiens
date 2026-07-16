import Image from "next/image";
import { PLAYER_SPEED, PLAYER_SPRITE_SCALE } from "@/lib/game/config";
import type { PlayerPosition } from "@/lib/game/movement";
import type { PlayerDirection } from "@/lib/game/movement";

const PLAYER_SPRITES: Record<PlayerDirection, string> = {
  up: "north",
  down: "south",
  left: "west",
  right: "east",
};

export default function Player({
  cellSize,
  direction,
  position,
}: {
  cellSize: number;
  direction: PlayerDirection;
  position: PlayerPosition;
}) {
  return (
    <div
      aria-label="Player"
      className="pointer-events-none absolute z-50"
      style={{
        height: cellSize,
        left: position.x * cellSize,
        top: position.y * cellSize,
        transition: `left ${1000 / PLAYER_SPEED}ms linear, top ${1000 / PLAYER_SPEED}ms linear`,
        willChange: "left, top",
        width: cellSize,
      }}
    >
      <Image
        alt=""
        aria-hidden
        className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain [image-rendering:pixelated]"
        draggable={false}
        height={88}
        src={`/player/${PLAYER_SPRITES[direction]}.png`}
        style={{ height: cellSize * PLAYER_SPRITE_SCALE, width: cellSize * PLAYER_SPRITE_SCALE }}
        unoptimized
        width={88}
      />
    </div>
  );
}
