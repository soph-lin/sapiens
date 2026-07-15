import { rowAnimations } from "../animation-data";
import type { CatalogOverride } from "../sprite-types";

const LUMBERJACK_OCCUPIED = [[0], undefined, [0], undefined, [0], undefined] as Array<number[] | undefined>;
const LUMBERJACK_ANIMATION_ROWS = ["idle · down", "walk · down", "idle · up", "walk · up", "idle · side", "walk · side", "work · setup", "work · up", "work · front", "work · back"] as const;

export const LUMBERJACK_OVERRIDE: CatalogOverride = {
  matches: (relativePath) => /NPCs \(Premade\)[\\/]Lumberjack/i.test(relativePath),
  createAnimations: ({ columns }) => rowAnimations("lumberjack", LUMBERJACK_ANIMATION_ROWS, columns, LUMBERJACK_OCCUPIED),
};
