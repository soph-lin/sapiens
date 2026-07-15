import type { CatalogOverride } from "../sprite-types";

export const BARRELS_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => relativePath === "Outdoor decoration/barrels.png",
  frameWidth: 16,
  frameHeight: 32,
  kind: "animation",
  preview: "cells",
  note: "Two barrels share each conventional 32px-wide cell; split at 16px.",
  createAnimations: ({ columns }) => [
    { key: "barrel", label: "barrel variants", frames: Array.from({ length: columns }, (_, column) => ({ row: 0, column })) },
    { key: "crate", label: "crate variants", frames: Array.from({ length: columns }, (_, column) => ({ row: 1, column })) },
  ],
};
