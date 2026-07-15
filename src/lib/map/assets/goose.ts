import { rowAnimations } from "../animation-data";
import type { CatalogOverride } from "../sprite-types";

const GOOSE_FRAMES = [[0, 1], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [0, 1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3], [0, 1], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [0, 1, 2], [0, 1, 2], [0, 1, 2], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3]];

export const GOOSE_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /Animals[\\/]Goose[\\/]/i.test(relativePath),
  createAnimations: ({ columns }) => rowAnimations("goose", Array.from({ length: 16 }, (_, row) => `action · row ${row}`), columns, GOOSE_FRAMES),
};
