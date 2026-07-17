/** Every furniture asset is an obstacle in the walk-through view. */
/** Player movement speed, measured in map tiles per second. */
export const PLAYER_SPEED = 5;
export const PLAYER_SPRITE_SCALE = 3;

export const NPC_SPEED = 4;

/** Sprite render scale by character asset `ageRange`. */
export const NPC_SPRITE_SCALE_BY_AGE_RANGE = {
  baby: 1,
  child: 3,
  teenager: 4,
  "young adult": 5,
  adult: 5,
  elderly: 5,
} as const;

export type NpcSpriteAgeRange = keyof typeof NPC_SPRITE_SCALE_BY_AGE_RANGE;

/** Default / fallback scale when age range is missing or unknown. */
export const NPC_SPRITE_SCALE = NPC_SPRITE_SCALE_BY_AGE_RANGE.adult;

export function npcSpriteScale(ageRange?: string | null): number {
  if (typeof ageRange !== "string" || !ageRange.trim()) {
    return NPC_SPRITE_SCALE;
  }
  const normalized = ageRange.trim().toLowerCase().replaceAll("_", " ");
  if (normalized in NPC_SPRITE_SCALE_BY_AGE_RANGE) {
    return NPC_SPRITE_SCALE_BY_AGE_RANGE[
      normalized as NpcSpriteAgeRange
    ];
  }
  return NPC_SPRITE_SCALE;
}

export const STAND_TIME = { min: 6_000, max: 10_000 };
/** Pixels down from the top of the scaled NPC sprite box to the tooltip anchor. */
export const NPC_TOOLTIP_OFFSET = 50;

export const COLLIDABLE_FURNITURE_ASSET_PATHS = [
  "/furniture1/bamboo-pot.png",
  "/furniture1/bathtub.png",
  "/furniture1/bookshelf-lg-01-side.png",
  "/furniture1/bookshelf-lg-01.png",
  "/furniture1/bookshelf-lg-02-side.png",
  "/furniture1/bookshelf-lg-02.png",
  "/furniture1/bookshelf-sm.png",
  "/furniture1/chair-back.png",
  "/furniture1/chair-brown-back.png",
  "/furniture1/chair-brown-side.png",
  "/furniture1/chair-brown.png",
  "/furniture1/chair-white-side.png",
  "/furniture1/chair-white.png",
  "/furniture1/cook-rack.png",
  "/furniture1/dresser-lg-side.png",
  "/furniture1/dresser-lg.png",
  "/furniture1/dresser-side.png",
  "/furniture1/dresser-small-side.png",
  "/furniture1/dresser-small.png",
  "/furniture1/dresser.png",
  "/furniture1/fireplace.png",
  "/furniture1/fridge.png",
  "/furniture1/grandfather-clock.png",
  "/furniture1/ironing-board.png",
  "/furniture1/kitchen-counter.png",
  "/furniture1/lamp-sm.png",
  "/furniture1/lamp.png",
  "/furniture1/mirror.png",
  "/furniture1/pet-bed.png",
  "/furniture1/rack.png",
  "/furniture1/radio.png",
  "/furniture1/rug-diamond-down.png",
  "/furniture1/rug-diamond-side.png",
  "/furniture1/rug-down.png",
  "/furniture1/rug-purple.png",
  "/furniture1/rug-side.png",
  "/furniture1/shelf.png",
  "/furniture1/sink.png",
  "/furniture1/sofa-lg-back.png",
  "/furniture1/sofa-lg-side.png",
  "/furniture1/sofa-lg.png",
  "/furniture1/sofa-sm-back.png",
  "/furniture1/sofa-sm-side.png",
  "/furniture1/sofa-sm.png",
  "/furniture1/stool.png",
  "/furniture1/stove.png",
  "/furniture1/table-lg-side.png",
  "/furniture1/table-lg.png",
  "/furniture1/table-md.png",
  "/furniture1/table-sm.png",
  "/furniture1/toilet-side.png",
  "/furniture1/toilet.png",
  "/furniture2/bathtub-full.png",
  "/furniture2/bookshelf-lg-01-side.png",
  "/furniture2/bookshelf-lg-01.png",
  "/furniture2/bookshelf-lg-02-side.png",
  "/furniture2/bookshelf-lg-02.png",
  "/furniture2/bookshelf-sm.png",
  "/furniture2/chair-dark-brown-back.png",
  "/furniture2/chair-dark-brown-side.png",
  "/furniture2/chair-dark-brown.png",
  "/furniture2/chair-orange-back.png",
  "/furniture2/chair-orange-side.png",
  "/furniture2/chair-orange.png",
  "/furniture2/cook-rack.png",
  "/furniture2/dresser-lg-side.png",
  "/furniture2/dresser-lg.png",
  "/furniture2/dresser-side.png",
  "/furniture2/dresser-small-side.png",
  "/furniture2/dresser-small.png",
  "/furniture2/dresser.png",
  "/furniture2/fireplace-lit.png",
  "/furniture2/flower-pot.png",
  "/furniture2/fridge-open.png",
  "/furniture2/grandfather-clock.png",
  "/furniture2/ironing-board-full.png",
  "/furniture2/kitchen-counter-on.png",
  "/furniture2/lamp-lit.png",
  "/furniture2/lamp-sm-lit.png",
  "/furniture2/mirror.png",
  "/furniture2/pet-bed-green.png",
  "/furniture2/rack-full.png",
  "/furniture2/radio.png",
  "/furniture2/rug-down.png",
  "/furniture2/rug-green-down.png",
  "/furniture2/rug-green-side.png",
  "/furniture2/rug-green.png",
  "/furniture2/rug-side.png",
  "/furniture2/shelf.png",
  "/furniture2/sink-on.png",
  "/furniture2/sofa-lg-back.png",
  "/furniture2/sofa-lg-side.png",
  "/furniture2/sofa-lg.png",
  "/furniture2/sofa-sm-back.png",
  "/furniture2/sofa-sm-side.png",
  "/furniture2/sofa-sm.png",
  "/furniture2/stool.png",
  "/furniture2/stove-on.png",
  "/furniture2/table-lg-side.png",
  "/furniture2/table-lg.png",
  "/furniture2/table-md.png",
  "/furniture2/table-sm.png",
  "/furniture2/toilet-full.png",
  "/furniture2/toilet-side-full.png",
] as const;

export const COLLIDABLE_FURNITURE_ASSET_SET = new Set<string>([
  ...COLLIDABLE_FURNITURE_ASSET_PATHS,
  ...COLLIDABLE_FURNITURE_ASSET_PATHS.map((assetPath) => `/assets${assetPath}`),
]);
