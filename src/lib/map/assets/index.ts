import { BARRELS_OVERRIDE } from "./barrels";
import { BUTTERFLY_OVERRIDE } from "./butterfly";
import { CHICKEN_OVERRIDE } from "./chicken";
import { COW_OVERRIDE } from "./cow";
import { FLOWER_ANIMATION_OVERRIDE, FLOWER_GRASS_OVERRIDE, STATIC_FLOWERS_OVERRIDE } from "./flowers";
import { GOOSE_OVERRIDE } from "./goose";
import { HORSE_OVERRIDE } from "./horse";
import { LUMBERJACK_OVERRIDE } from "./lumberjack";
import { PLAYER_OVERRIDE } from "./player";

/** Only exceptional family/file metadata belongs in this directory. */
export const CATALOG_OVERRIDES = [
  BARRELS_OVERRIDE,
  STATIC_FLOWERS_OVERRIDE,
  BUTTERFLY_OVERRIDE,
  FLOWER_ANIMATION_OVERRIDE,
  FLOWER_GRASS_OVERRIDE,
  GOOSE_OVERRIDE,
  COW_OVERRIDE,
  CHICKEN_OVERRIDE,
  HORSE_OVERRIDE,
  LUMBERJACK_OVERRIDE,
  PLAYER_OVERRIDE,
];
