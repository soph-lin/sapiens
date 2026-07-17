/**
 * Shared asset slug parsing for collapsing orientation/state variants
 * (stairs-side → stairs, lamp-lit → lamp, door-01-open → door-01, etc.).
 */

export type AssetOrientation = "front" | "side" | "back";

const ORIENTATION_ORDER: readonly AssetOrientation[] = [
  "front",
  "side",
  "back",
];

/** Longest-first so compound suffixes win. */
const STATE_SUFFIXES = [
  "hot-choco",
  "full-01",
  "full-02",
  "full-03",
  "coffee",
  "tea",
  "food",
  "water",
  "eggs",
  "meat",
  "veggies",
  "open",
  "lit",
  "on",
  "full",
] as const;

/**
 * Odd filename aliases where the back/side sprite lacks the color prefix.
 * `chair-back` is the white chair's back view.
 */
const BASE_SLUG_ALIASES: Readonly<Record<string, string>> = {
  "chair-back": "chair-white",
};

export type AssetSlugParts = {
  folder: string;
  file: string;
  slug: string;
  baseSlug: string;
  orientation: AssetOrientation;
  state: string;
};

export function parseAssetPath(assetPath: string): {
  folder: string;
  file: string;
  slug: string;
} {
  const normalized = assetPath.startsWith("/assets/")
    ? assetPath
    : assetPath.startsWith("assets/")
      ? `/${assetPath}`
      : `/assets/${assetPath.replace(/^\//, "")}`;
  const match = normalized.match(/^\/assets\/([^/]+)\/(.+)\.png$/);
  return {
    folder: match?.[1] ?? "",
    file: match?.[2] ? `${match[2]}.png` : "",
    slug: match?.[2] ?? "",
  };
}

export function parseAssetSlug(slug: string): Omit<
  AssetSlugParts,
  "folder" | "file" | "slug"
> {
  let rest = slug;
  let state = "default";
  let orientation: AssetOrientation = "front";

  for (const suffix of STATE_SUFFIXES) {
    if (rest === suffix) {
      state = suffix;
      rest = "";
      break;
    }
    if (rest.endsWith(`-${suffix}`)) {
      state = suffix;
      rest = rest.slice(0, -(suffix.length + 1));
      break;
    }
  }

  if (rest.endsWith("-side")) {
    orientation = "side";
    rest = rest.slice(0, -5);
  } else if (rest.endsWith("-back")) {
    orientation = "back";
    rest = rest.slice(0, -5);
  } else if (rest.endsWith("-down")) {
    orientation = "front";
    rest = rest.slice(0, -5);
  }

  const rawBase = rest || slug;
  return {
    baseSlug:
      BASE_SLUG_ALIASES[slug] ?? BASE_SLUG_ALIASES[rawBase] ?? rawBase,
    orientation,
    state,
  };
}

export function getAssetSlugParts(assetPath: string): AssetSlugParts {
  const {folder, file, slug} = parseAssetPath(assetPath);
  return {
    folder,
    file,
    slug,
    ...parseAssetSlug(slug),
  };
}

export function assetVariantKey(assetPath: string): string {
  const parts = getAssetSlugParts(assetPath);
  return `${parts.folder}:${parts.baseSlug}`;
}

/** Prefer front + default state as the catalog display sprite. */
export function assetDisplayRank(assetPath: string): number {
  const {orientation, state} = getAssetSlugParts(assetPath);
  const orientationRank = ORIENTATION_ORDER.indexOf(orientation);
  const stateRank = state === "default" ? 0 : 1;
  return stateRank * 10 + (orientationRank < 0 ? 9 : orientationRank);
}

export function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type CollapsibleAssetEntry = {
  folder: string;
  file: string;
  assetPath: string;
  name: string;
};

/**
 * Collapse orientation/state variants into one catalog row per base object.
 * Keeps the best display sprite (front, default state) and a clean name.
 */
export function collapseAssetEntries<T extends CollapsibleAssetEntry>(
  entries: readonly T[],
): T[] {
  const bestByKey = new Map<string, T>();

  for (const entry of entries) {
    const key = assetVariantKey(entry.assetPath);
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, entry);
      continue;
    }
    if (assetDisplayRank(entry.assetPath) < assetDisplayRank(existing.assetPath)) {
      bestByKey.set(key, entry);
    }
  }

  const seen = new Set<string>();
  const result: T[] = [];
  for (const entry of entries) {
    const key = assetVariantKey(entry.assetPath);
    if (seen.has(key)) continue;
    seen.add(key);
    const best = bestByKey.get(key) ?? entry;
    const parts = getAssetSlugParts(best.assetPath);
    const rawName = best.name.trim();
    const looksLikeFilename =
      !rawName ||
      rawName === best.file ||
      rawName.toLowerCase() === parts.slug ||
      rawName.toLowerCase() === `${parts.slug}.png`;
    result.push({
      ...best,
      name: looksLikeFilename ? titleCaseSlug(parts.baseSlug) : rawName,
    });
  }
  return result;
}

export function rotateAssetPathAmong(
  assetPath: string,
  direction: -1 | 1,
  catalogPaths: readonly string[],
): string {
  const current = getAssetSlugParts(assetPath);
  const uniquePaths = [...new Set(catalogPaths)];

  const sameState = uniquePaths.filter((path) => {
    const parts = getAssetSlugParts(path);
    return (
      parts.folder === current.folder &&
      parts.baseSlug === current.baseSlug &&
      parts.state === current.state
    );
  });

  const sameBase = uniquePaths.filter((path) => {
    const parts = getAssetSlugParts(path);
    return (
      parts.folder === current.folder && parts.baseSlug === current.baseSlug
    );
  });

  const pool = (sameState.length >= 2 ? sameState : sameBase).slice().sort(
    (a, b) => {
      const aParts = getAssetSlugParts(a);
      const bParts = getAssetSlugParts(b);
      const byOrientation =
        ORIENTATION_ORDER.indexOf(aParts.orientation) -
        ORIENTATION_ORDER.indexOf(bParts.orientation);
      if (byOrientation !== 0) return byOrientation;
      return a.localeCompare(b);
    },
  );

  if (pool.length < 2) return assetPath;

  // Exact path first so we step front → side → back without skipping.
  let index = pool.findIndex((path) => path === assetPath);
  if (index < 0) {
    index = pool.findIndex((path) => {
      const parts = getAssetSlugParts(path);
      return parts.orientation === current.orientation;
    });
  }
  if (index < 0) index = 0;

  const nextIndex = (index + direction + pool.length) % pool.length;
  return pool[nextIndex] ?? assetPath;
}
