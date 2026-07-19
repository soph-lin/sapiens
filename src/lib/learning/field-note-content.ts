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
  if (isPrivateNoteContent(content)) return privateNotePlainText(content.html);
  return "";
}

/**
 * Published class takeaway used for assigned voyage completion.
 * Private journal notes and visitor/coco notes do not count.
 */
export function isVoyageCompletionNote(note: {
  authorType?: string | null;
  status?: string | null;
  content: unknown;
}): boolean {
  if (note.status !== "published") return false;
  if (note.authorType && note.authorType !== "user") return false;
  return isTakeawayNoteContent(note.content);
}

/** Plain text body for Starstream posts / visitor facts. */
export function fieldNotePlainBody(content: unknown): string {
  if (isPrivateNoteContent(content)) {
    return privateNotePlainText(content.html);
  }
  return takeawayNoteBody(content).trim();
}

/** Normalize FieldNote.sources JSON into displayable URL strings. */
export function fieldNoteSources(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (source): source is string =>
      typeof source === "string" && Boolean(source.trim()),
  );
}

/** Compact host+path label for a source URL. */
export function fieldNoteSourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path =
      parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return path ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

/** Strip simple HTML from private-note bodies for read-only display. */
export function privateNotePlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
