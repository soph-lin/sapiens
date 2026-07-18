/** Content shapes stored on FieldNote.content JSON. */

export const PRIVATE_NOTE_KIND = "private" as const;

export type PrivateNoteContent = {
  kind: typeof PRIVATE_NOTE_KIND;
  html: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Sail companion private journal notes (rich HTML). */
export function isPrivateNoteContent(
  content: unknown,
): content is PrivateNoteContent {
  return (
    isRecord(content) &&
    content.kind === PRIVATE_NOTE_KIND &&
    typeof content.html === "string"
  );
}

/** End-of-voyage / Discoveries takeaway notes (`{ body }`). */
export function isTakeawayNoteContent(content: unknown): boolean {
  if (isPrivateNoteContent(content)) return false;
  if (isRecord(content) && typeof content.body === "string") return true;
  return typeof content === "string";
}

export function privateNoteContent(html: string): PrivateNoteContent {
  return { kind: PRIVATE_NOTE_KIND, html };
}

export function takeawayNoteBody(content: unknown): string {
  if (typeof content === "string") return content;
  if (isRecord(content) && typeof content.body === "string") return content.body;
  if (isPrivateNoteContent(content)) return content.html;
  return "";
}
