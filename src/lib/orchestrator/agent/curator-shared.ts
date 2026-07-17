export const CURATOR_GENRES = [
  "amazing",
  "cool",
  "lighthearted",
  "mysterious",
  "short",
  "innovative",
] as const;

export type CuratorGenre = (typeof CURATOR_GENRES)[number];

/** Free-text request that may contain a genre, location, and/or period. */
export type CuratorInput = string;

export type CuratorIdea = {
  name: string;
  historicalEvent: string;
  era: string;
  region: string;
  whyItFits: string;
  plotDirection: string;
  sourceSearchTerms: string;
  lessonPlan?: string;
  sourceUrls?: string[];
};

/** Optional classroom-facing draft fields; solo exploration does not require them. */
export type CuratorVoyageDraft = {
  title: string | null;
  topic: string | null;
  period: string | null;
  scene: string | null;
  lessonPlan: string | null;
};

export type CuratorOutput = {
  genre: CuratorGenre | null;
  location: string | null;
  period: string | null;
  idea: CuratorIdea;
  voyage?: CuratorVoyageDraft | null;
};

export function isCuratorGenre(value: unknown): value is CuratorGenre {
  return (
    typeof value === "string" &&
    (CURATOR_GENRES as readonly string[]).includes(value)
  );
}

/** Placeholder eras the model sometimes emits when no period was named. */
const PLACEHOLDER_PERIOD =
  /^(unspecified(\s+period)?|unknown|n\/?a|none|not\s+specified|historical\s+era)$/i;

/** True when the value is a usable historical era (not an empty/placeholder label). */
export function isConcreteHistoricalPeriod(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && !PLACEHOLDER_PERIOD.test(trimmed);
}

/** Require a concrete historical era for story/voyage metadata. */
export function requireHistoricalPeriod(value: unknown, label: string): string {
  if (typeof value !== "string" || !isConcreteHistoricalPeriod(value)) {
    throw new Error(
      `${label} must be a concrete historical era such as "5th century BCE" or "the Middle Ages"`,
    );
  }
  return value.trim();
}

/** Parse the public Curator request contract at an untrusted boundary. */
export function parseCuratorInput(value: unknown): CuratorInput {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Curator input must be non-empty text");
  }
  return value.trim();
}
