import { rowAnimations } from "../animation-data";
import type { CatalogOverride } from "../sprite-types";

export const COW_ANIMATION_ROWS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12", "R13", "R14", "R15"] as const;
const COW_FRAMES = [[0, 1], [0, 1], [0, 1], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]];

export const COW_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /Animals[\\/]Cow[\\/]/i.test(relativePath),
  createAnimations: ({ columns }) => rowAnimations("cow", COW_ANIMATION_ROWS, columns, COW_FRAMES),
};
