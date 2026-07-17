export const AGE_RANGES = [
  "baby",
  "child",
  "teenager",
  "young adult",
  "adult",
  "elderly",
] as const;

export type AgeRange = (typeof AGE_RANGES)[number];
export type AgeRangeDb =
  | "BABY"
  | "CHILD"
  | "TEENAGER"
  | "YOUNG_ADULT"
  | "ADULT"
  | "ELDERLY";

export function isAgeRange(value: unknown): value is AgeRange {
  return (
    typeof value === "string" &&
    (AGE_RANGES as readonly string[]).includes(value)
  );
}

export function ageRangeFromDb(value: unknown): AgeRange | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replaceAll("_", " ");
  return isAgeRange(normalized) ? normalized : null;
}

export function ageRangeToDb(value: AgeRange): AgeRangeDb {
  return value.toUpperCase().replaceAll(" ", "_") as AgeRangeDb;
}

export function normalizeCharacterName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
