import type { FieldNote, FieldNoteAuthorType, Prisma } from "@/generated/prisma/client";
import { checkToxicity } from "@/lib/moderation/toxicity";
import {
  TOXICITY_BLOCKED,
  VISITOR_NOTE_HEADER,
} from "@/lib/learning/starstream-constants";
import { prisma } from "@/lib/prisma";

export { TOXICITY_BLOCKED } from "@/lib/learning/starstream-constants";

export type StarstreamAttachment = {
  url: string;
  kind?: "link" | "video";
  label?: string;
};

export type VisitorNoteContent = {
  visitor: {
    characterName: string;
    voyageTopic: string;
    fact: string;
    sources: string[];
  };
  commentary?: string;
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function inferAttachmentKind(url: string): "link" | "video" {
  return /(youtube\.com|youtu\.be|vimeo\.com|\/\S+\.(mp4|webm|mov)(\?|$))/i.test(url)
    ? "video"
    : "link";
}

/** Normalize attachment payloads; invalid URLs are dropped. */
export function normalizeAttachments(input: unknown): StarstreamAttachment[] | undefined {
  if (input === undefined) return undefined;
  if (input === null) return [];
  if (!Array.isArray(input)) return [];
  const attachments: StarstreamAttachment[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      const url = item.trim();
      if (!isHttpUrl(url)) continue;
      attachments.push({ url, kind: inferAttachmentKind(url) });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as { url?: unknown; kind?: unknown; label?: unknown };
    if (typeof record.url !== "string") continue;
    const url = record.url.trim();
    if (!isHttpUrl(url)) continue;
    const kind =
      record.kind === "video" || record.kind === "link"
        ? record.kind
        : inferAttachmentKind(url);
    const label =
      typeof record.label === "string" && record.label.trim()
        ? record.label.trim()
        : undefined;
    attachments.push(label ? { url, kind, label } : { url, kind });
  }
  return attachments;
}

function attachmentsFromSources(sources: unknown): StarstreamAttachment[] | undefined {
  if (!Array.isArray(sources)) return undefined;
  return normalizeAttachments(sources);
}

function noteFact(content: unknown): string {
  if (typeof content === "object" && content && "body" in content) {
    return String((content as { body?: unknown }).body ?? "").trim();
  }
  return typeof content === "string" ? content.trim() : "";
}

function noteSourcesList(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];
  return sources.filter((source): source is string => typeof source === "string" && Boolean(source.trim()));
}

type PublishableNote = Pick<
  FieldNote,
  | "id"
  | "assignmentId"
  | "storyId"
  | "authorId"
  | "authorType"
  | "authorName"
  | "title"
  | "content"
  | "sources"
  | "status"
  | "publishedAt"
  | "publishedById"
  | "createdAt"
  | "updatedAt"
>;

/** Upsert a root StarstreamLog from a published user FieldNote, or remove it when unpublished. */
export async function syncStarstreamLogFromFieldNote(
  note: PublishableNote,
  options?: {
    allowReplies?: boolean;
    attachments?: unknown;
  },
) {
  if (note.authorType === "bot") {
    // Bot visitor notes publish through publishVisitorNoteToStarstream.
    return null;
  }
  if (note.status !== "published") {
    await prisma.starstreamLog.deleteMany({
      where: { fieldNoteId: note.id, parentId: null, type: "post" },
    });
    return null;
  }

  const existing = await prisma.starstreamLog.findUnique({ where: { fieldNoteId: note.id } });
  const normalizedAttachments = normalizeAttachments(options?.attachments);
  const attachments =
    normalizedAttachments ??
    (existing?.attachments != null
      ? (existing.attachments as StarstreamAttachment[])
      : attachmentsFromSources(note.sources) ?? []);
  const allowReplies = options?.allowReplies ?? existing?.allowReplies ?? true;

  const toxicity = await checkToxicity(starstreamLogBody(note.content));
  if (!toxicity.allowed) return { error: TOXICITY_BLOCKED };

  const data = {
    parentId: null as string | null,
    allowReplies,
    type: "post" as const,
    assignmentId: note.assignmentId,
    storyId: note.storyId,
    authorId: note.authorId,
    authorType: note.authorType,
    authorName: note.authorName,
    title: note.title,
    content: note.content as Prisma.InputJsonValue,
    attachments: attachments as Prisma.InputJsonValue,
  };

  return prisma.starstreamLog.upsert({
    where: { fieldNoteId: note.id },
    create: { ...data, fieldNoteId: note.id },
    update: data,
  });
}

/** Publish a bot visitor FieldNote to Starstream as type visitorNote. */
export async function publishVisitorNoteToStarstream(input: {
  note: PublishableNote;
  publisher: { id: string; displayName: string };
  commentary?: string | null;
  voyageTopic?: string;
}) {
  const { note, publisher } = input;
  if (note.authorType !== "bot") return { error: "not_visitor_note" as const };
  if (note.authorId !== publisher.id) return { error: "forbidden" as const };

  const fact = noteFact(note.content);
  if (!fact) return { error: "empty_fact" as const };

  const commentary =
    typeof input.commentary === "string" && input.commentary.trim()
      ? input.commentary.trim()
      : undefined;
  const sources = noteSourcesList(note.sources);
  const content: VisitorNoteContent = {
    visitor: {
      characterName: note.authorName?.trim() || "A companion",
      voyageTopic: input.voyageTopic?.trim() || "Historical voyage",
      fact,
      sources,
    },
    ...(commentary ? { commentary } : {}),
  };

  const toxicity = await checkToxicity(
    [commentary, fact].filter((part): part is string => Boolean(part)).join("\n"),
  );
  if (!toxicity.allowed) return { error: TOXICITY_BLOCKED };

  const attachments = normalizeAttachments(sources) ?? [];
  let assignmentId = note.assignmentId;
  if (!assignmentId) {
    const linked = await prisma.classroomAssignment.findFirst({
      where: {
        status: "published",
        classroom: { memberships: { some: { userId: publisher.id } } },
        OR: [
          { storyId: note.storyId },
          { journey: { voyages: { some: { storyId: note.storyId } } } },
        ],
      },
      select: { id: true },
    });
    assignmentId = linked?.id ?? null;
  }
  const data = {
    parentId: null as string | null,
    allowReplies: true,
    type: "visitorNote" as const,
    assignmentId,
    storyId: note.storyId,
    authorId: publisher.id,
    authorType: "user" as const,
    authorName: publisher.displayName,
    title: VISITOR_NOTE_HEADER,
    content: content as unknown as Prisma.InputJsonValue,
    attachments: attachments as Prisma.InputJsonValue,
  };

  const log = await prisma.starstreamLog.upsert({
    where: { fieldNoteId: note.id },
    create: { ...data, fieldNoteId: note.id },
    update: data,
  });

  await prisma.fieldNote.update({
    where: { id: note.id },
    data: {
      status: "published",
      publishedAt: note.publishedAt ?? new Date(),
      publishedById: note.publishedById ?? publisher.id,
    },
  });

  return { log };
}

export type CreateStarstreamReplyInput = {
  parentId: string;
  authorId: string;
  authorType?: FieldNoteAuthorType;
  authorName?: string | null;
  title?: string | null;
  content: Prisma.InputJsonValue;
  attachments?: unknown;
};

/** Create a reply under a root StarstreamLog when allowReplies is true. */
export async function createStarstreamReply(input: CreateStarstreamReplyInput) {
  const parent = await prisma.starstreamLog.findUnique({ where: { id: input.parentId } });
  if (!parent) return { error: "not_found" as const };
  if (parent.parentId) return { error: "not_root" as const };
  if (!parent.allowReplies) return { error: "replies_disabled" as const };

  const toxicity = await checkToxicity(starstreamLogBody(input.content));
  if (!toxicity.allowed) return { error: TOXICITY_BLOCKED };

  const attachments = normalizeAttachments(input.attachments) ?? [];
  const reply = await prisma.starstreamLog.create({
    data: {
      parentId: parent.id,
      allowReplies: false,
      type: "post",
      assignmentId: parent.assignmentId,
      storyId: parent.storyId,
      authorId: input.authorId,
      authorType: input.authorType ?? "user",
      authorName: input.authorName ?? null,
      title: input.title ?? null,
      content: input.content,
      attachments: attachments as Prisma.InputJsonValue,
    },
  });
  return { reply };
}

/** Toggle a like on a StarstreamLog. Returns the updated counts. */
export async function toggleStarstreamLike(logId: string, userId: string) {
  const log = await prisma.starstreamLog.findUnique({
    where: { id: logId },
    select: { id: true },
  });
  if (!log) return { error: "not_found" as const };

  const existing = await prisma.starstreamLike.findUnique({
    where: { logId_userId: { logId, userId } },
  });
  if (existing) {
    await prisma.starstreamLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.starstreamLike.create({ data: { logId, userId } });
  }
  const likeCount = await prisma.starstreamLike.count({ where: { logId } });
  return { likedByMe: !existing, likeCount };
}

export function parseVisitorNoteContent(content: unknown): VisitorNoteContent | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const record = content as Record<string, unknown>;
  const visitor = record.visitor;
  if (!visitor || typeof visitor !== "object" || Array.isArray(visitor)) return null;
  const visitorRecord = visitor as Record<string, unknown>;
  if (typeof visitorRecord.fact !== "string" || !visitorRecord.fact.trim()) return null;
  return {
    visitor: {
      characterName:
        typeof visitorRecord.characterName === "string" && visitorRecord.characterName.trim()
          ? visitorRecord.characterName.trim()
          : "A companion",
      voyageTopic:
        typeof visitorRecord.voyageTopic === "string" && visitorRecord.voyageTopic.trim()
          ? visitorRecord.voyageTopic.trim()
          : "Historical voyage",
      fact: visitorRecord.fact.trim(),
      sources: noteSourcesList(visitorRecord.sources),
    },
    commentary:
      typeof record.commentary === "string" && record.commentary.trim()
        ? record.commentary.trim()
        : undefined,
  };
}

export function starstreamLogBody(content: unknown): string {
  const visitor = parseVisitorNoteContent(content);
  if (visitor) {
    return visitor.commentary?.trim() || visitor.visitor.fact;
  }
  if (typeof content === "object" && content && "body" in content) {
    return String((content as { body?: unknown }).body ?? "");
  }
  return typeof content === "string" ? content : JSON.stringify(content);
}

export function starstreamAttachmentsView(value: unknown) {
  const normalized = normalizeAttachments(value) ?? [];
  return normalized;
}
