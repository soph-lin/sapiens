import { filenameKey, rowAnimations } from "../animation-data";
import type { CatalogOverride } from "../sprite-types";

export const STATIC_FLOWERS_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => relativePath === "Outdoor decoration/Flowers.png",
  frameWidth: 16,
  frameHeight: 16,
  kind: "icon-atlas",
  preview: "cells",
  note: "Static 10×10 flower variant atlas; these cells are not animation frames.",
};

export const FLOWER_ANIMATION_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /Outdoor decoration[\\/]Outdoor_Decor_Animations[\\/]Flower_Animations[\\/]/i.test(relativePath),
  createAnimations: ({ relativePath, columns }) => rowAnimations(`flower-${filenameKey(relativePath)}`, Array.from({ length: 10 }, (_, row) => `flower · row ${row + 1}`), columns),
};

export const FLOWER_GRASS_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /Outdoor decoration[\\/]Outdoor_Decor_Animations[\\/]Grass_Animations[\\/]/i.test(relativePath),
  createAnimations: ({ relativePath, columns }) => rowAnimations(`grass-${filenameKey(relativePath)}`, ["grass sway"], columns),
};
