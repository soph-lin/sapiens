import { rowAnimations } from "../animation-data";
import type { CatalogOverride } from "../sprite-types";

export const CHICKEN_ANIMATION_ROWS = ["sit-idle", "walk", "peck", "sit-down", "stand-up", "fall-asleep", "sleep", "R8", "R9", "R10", "R11", "R12", "R13", "R14", "R15", "R16"] as const;

export const CHICKEN_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /Animals[\\/]Chicken[\\/]/i.test(relativePath),
  createAnimations: ({ columns, occupied }) => rowAnimations("chicken", CHICKEN_ANIMATION_ROWS, columns, occupied),
};
