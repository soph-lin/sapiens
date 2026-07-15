import { rowAnimations } from "../animation-data";
import type { CatalogOverride } from "../sprite-types";

export const BUTTERFLY_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /Animals[\\/]Butterfly[\\/]Butterfly\.png$/i.test(relativePath),
  frameWidth: 8,
  frameHeight: 8,
  preview: "animation",
  note: "Each row is one unique butterfly; its two 8×8 cells are the flap animation.",
  createAnimations: ({ columns }) => rowAnimations("butterfly", Array.from({ length: 8 }, (_, row) => `flap · color ${row + 1}`), columns),
};
