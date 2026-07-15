import { rowAnimations, type AnimationPlayback } from "../animation-data";
import type { CatalogOverride } from "../sprite-types";

export const PLAYER_ANIMATION_ROWS = [
  "idle-down", "idle-right", "idle-up", "walk-down", "walk-right", "walk-up", "tool-sword", "tool-down-2", "tool-down-3", "tool-right",
  "R11", "R12", "R13", "R14", "R15", "fall", "R17", "roll-down", "roll-right", "roll-up", "stand", "stand-right", "stand-up", "R24",
  "walk-slow-up", "jump", "jump-right", "jump-up", "R29", "R30", "R31", "R32", "R33", "R34", "R35", "R36", "R37", "R38", "R39", "R40",
  "R41", "R42", "R43", "R44", "R45", "R46", "R47", "R48", "R49", "R50", "horse-idle-down", "horse-idle-right", "horse-idle-up", "horse-walk-down", "horse-walk-right", "horse-walk-up",
] as const;

export const HORSE_MOUNT_PLAYER_ROWS = PLAYER_ANIMATION_ROWS.slice(50);
export const HORSE_ANIMATION_ROWS = ["idle-left", "idle-down", "idle-up", "walk-left", "walk-down", "walk-up", "chomp", "chew", "sit-down", "stand-up", "fall-asleep", "hurt-left", "hurt-down", "hurt-up"] as const;

const PLAYER_IDLE_PLAYBACK: AnimationPlayback = { frameRate: 5, repeat: -1 };
const PLAYER_WALK_PLAYBACK: AnimationPlayback = { frameRate: 9, repeat: -1 };
const catalogPlayerPlayback = (label: string) => label.startsWith("walk") ? PLAYER_WALK_PLAYBACK : undefined;

export const PLAYER_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /Player[\\/]/i.test(relativePath),
  createAnimations: ({ columns, occupied }) => rowAnimations("player", PLAYER_ANIMATION_ROWS, columns, occupied, catalogPlayerPlayback).map((animation) => ({ ...animation, key: `player-${animation.label}` })),
};

export function playerWorldAnimations(animations: ReturnType<typeof rowAnimations>) {
  return animations.slice(0, 6).map((animation) => ({
    ...animation,
    playback: animation.label.startsWith("walk") ? PLAYER_WALK_PLAYBACK : PLAYER_IDLE_PLAYBACK,
  }));
}
