import type { SpriteAnimation, SpriteFrame } from "./sprite-types";

export type AnimationPlayback = {
  frameRate: number;
  repeat: number;
};

export const DEFAULT_ANIMATION_PLAYBACK: AnimationPlayback = { frameRate: 7, repeat: -1 };

/** Build row-based animations without copying the catalog's default playback into every row. */
export function rowAnimations(
  key: string,
  labels: readonly string[],
  columns: number,
  occupied?: Array<number[] | undefined>,
  playbackFor?: (label: string) => AnimationPlayback | undefined,
): SpriteAnimation[] {
  return labels.map((label, row) => ({
    key: `${key}-${row}`,
    label,
    playback: playbackFor?.(label),
    frames: (occupied?.[row] ?? Array.from({ length: columns }, (_, column) => column)).map((column): SpriteFrame => ({ row, column })),
  })).filter((animation) => animation.frames.length > 0);
}

export function filenameKey(relativePath: string): string {
  return relativePath.split(/[\\/]/).pop()?.replace(/\.png$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() ?? "sheet";
}
