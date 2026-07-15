export type SpriteFrame = { row: number; column: number };

export type SpriteAnimation = {
  key: string;
  label: string;
  frames: SpriteFrame[];
  playback?: { frameRate: number; repeat: number };
};

export type CatalogAssetKind = "animation" | "icon-atlas" | "tile-atlas" | "composite-object" | "layer";

export type CatalogAnimationContext = {
  relativePath: string;
  columns: number;
  rows: number;
  occupied?: Array<number[] | undefined>;
};

/** Curated metadata that is exceptional enough not to belong in catalog defaults. */
export type CatalogOverride = {
  matches: (relativePath: string) => boolean;
  frameWidth?: number;
  frameHeight?: number;
  kind?: CatalogAssetKind;
  createAnimations?: (context: CatalogAnimationContext) => SpriteAnimation[];
  preview?: "cells" | "animation";
  note?: string;
};

export type SpriteEntityKind = "being" | "object";
export type SpriteBeingKind = "player" | "animal" | "npc";
export type SpriteOrientation = "left" | "right";
