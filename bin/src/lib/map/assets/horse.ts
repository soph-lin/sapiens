import { rowAnimations } from "../animation-data";
import type { CatalogOverride } from "../sprite-types";

const HORSE_ANIMATION_ROWS = ["idle-left", "idle-down", "idle-up", "walk-left", "walk-down", "walk-up", "chomp", "chew", "sit-down", "stand-up", "fall-asleep", "hurt-left", "hurt-down", "hurt-up"] as const;

export const HORSE_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /Animals[\\/]Horse[\\/]/i.test(relativePath),
  createAnimations: ({ columns, occupied }) => rowAnimations("horse", HORSE_ANIMATION_ROWS, columns, occupied),
};
