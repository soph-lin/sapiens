import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAssignmentVisible, assertPublishedTargetStory, assignmentAccessInclude, assignmentIncludesStory, findAssignmentForAccess } from "@/lib/learning/access";
import { ApiError, errorResponse, jsonInput, parseJsonBody, publicationStatus, requireDemoUser, requiredText } from "@/lib/learning/api";
import { isPrivateNoteContent } from "@/lib/learning/field-note-content";
import { checkToxicity } from "@/lib/moderation/toxicity";
import { starstreamLogBody, syncStarstreamLogFromFieldNote, TOXICITY_BLOCKED } from "@/lib/learning/starstream";

export const runtime = "nodejs";

type NoteBody = {
  assignmentId?: unknown;
  storyId?: unknown;
  title?: unknown;
  content?: unknown;
  body?: unknown;
  status?: unknown;
  sources?: unknown;
  allowReplies?: unknown;
  attachments?: unknown;
};

function noteContent(body: NoteBody) {
  if (body.content !== undefined) return jsonInput(body.content, "content");
  return { body: requiredText(body.body, "body") };
}

function noteView(note: {
  id: string; assignmentId: string | null; storyId: string; title: string | null; content: unknown; status: string;
  publishedAt: Date | null; createdAt: Date; updatedAt: Date; authorType: string; authorName: string | null; sources: unknown;
  author: { username: string; displayName: string }; story: { id: string; slug: string; topic: string };
  starstreamLog?: { id: string; type: string } | null;
}) {
  return {
    ...note,
    publishedToStarstream: Boolean(note.starstreamLog),
    starstreamLogType: note.starstreamLog?.type ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireDemoUser(request);
    const url = new URL(request.url);
    const assignmentId = url.searchParams.get("assignmentId");
    const storyId = url.searchParams.get("storyId");
    const assignments = assignmentId
      ? [await findAssignmentForAccess(assignmentId)]
      : await prisma.classroomAssignment.findMany({ where: user.role === "teacher" ? { classroom: { teacherId: user.id } } : { status: "published", classroom: { memberships: { some: { userId: user.id } } } }, include: assignmentAccessInclude });
    const visible = assignments.filter((assignment): assignment is NonNullable<typeof assignment> => Boolean(assignment));
    visible.forEach((assignment) => assertAssignmentVisible(assignment, user));
    // Only validate story ∈ assignment when a specific assignment is requested.
    // Solo voyage loads pass storyId alone (no assignmentId) and must not be
    // checked against unrelated classroom assignments.
    if (assignmentId && storyId) {
      visible.forEach((assignment) => assertPublishedTargetStory(assignment, storyId));
    } else if (storyId && !assignmentId && user.role === "student") {
      const ownsStory = await prisma.story.findFirst({
        where: { id: storyId, createdById: user.id },
        select: { id: true },
      });
      const inVisibleAssignment = visible.some((assignment) =>
        assignmentIncludesStory(assignment, storyId),
      );
      if (!ownsStory && !inVisibleAssignment) {
        throw new ApiError(404, "Voyage not found.");
      }
    } else if (storyId && !assignmentId && user.role === "teacher") {
      const published = await prisma.story.findFirst({
        where: { id: storyId, status: "published" },
        select: { id: true },
      });
      if (!published) throw new ApiError(404, "Voyage not found.");
    }
    const assignmentIds = visible.map((assignment) => assignment.id);
    const storyIds = storyId ? [storyId] : undefined;
    const notes = await prisma.fieldNote.findMany({
      where: {
        AND: [
          { OR: [
            { assignmentId: { in: assignmentIds } },
            { story: { createdById: user.id } },
            { authorId: user.id },
          ] },
          ...(storyIds ? [{ storyId: { in: storyIds } }] : []),
          // Teachers and students both need their own draft notes.
          // Published notes remain visible within assignment/story access above.
          { OR: [{ status: "published" as const }, { authorId: user.id }] },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { username: true, displayName: true } },
        story: { select: { id: true, slug: true, topic: true } },
        starstreamLog: { select: { id: true, type: true } },
      },
    });
    return NextResponse.json({ notes: notes.map(noteView) });
  } catch (error) {
    return errorResponse(error, "Could not load field notes.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDemoUser(request);
    const body = parseJsonBody<NoteBody>(await request.json());
    const assignmentId = body.assignmentId === undefined || body.assignmentId === null || body.assignmentId === "" ? undefined : requiredText(body.assignmentId, "assignmentId");
    const storyId = requiredText(body.storyId, "storyId");
    const assignment = assignmentId ? await findAssignmentForAccess(assignmentId) : null;
    if (assignmentId && !assignment) throw new ApiError(404, "Assignment not found.");
    if (assignment) {
      assertAssignmentVisible(assignment, user);
      assertPublishedTargetStory(assignment, storyId);
    } else {
      const contentPreview =
        body.content !== undefined ? jsonInput(body.content, "content") : null;
      const privateDraft =
        contentPreview !== null &&
        isPrivateNoteContent(contentPreview) &&
        (publicationStatus(body.status) ?? "draft") === "draft";
      if (privateDraft) {
        // Any signed-in user may keep private sail notes on a published voyage.
        const published = await prisma.story.findFirst({
          where: { id: storyId, status: "published" },
          select: { id: true },
        });
        if (!published) throw new ApiError(404, "Voyage not found.");
      } else {
        const soloStory = await prisma.story.findFirst({
          where: { id: storyId, createdById: user.id, status: "published" },
          select: { id: true },
        });
        if (!soloStory) throw new ApiError(404, "Solo voyage not found.");
      }
    }
    const status = publicationStatus(body.status) ?? "draft";
    const content = noteContent(body);
    if (status === "published") {
      const toxicity = await checkToxicity(starstreamLogBody(content));
      if (!toxicity.allowed) throw new ApiError(400, TOXICITY_BLOCKED);
    }
    const sources = body.sources === undefined ? undefined : jsonInput(body.sources, "sources");
    const title = body.title === undefined ? undefined : requiredText(body.title, "title");
    // Always create — updates go through PATCH /api/field-notes/[id].
    // Callers that need a single takeaway note load it first, then PATCH.
    const publishedAt = status === "published" ? new Date() : null;
    const note = await prisma.fieldNote.create({
      data: {
        assignmentId,
        storyId,
        authorId: user.id,
        title,
        content,
        sources,
        status,
        publishedAt,
        publishedById: status === "published" ? user.id : null,
      },
      include: {
        author: { select: { username: true, displayName: true } },
        story: { select: { id: true, slug: true, topic: true } },
        starstreamLog: { select: { id: true, type: true } },
      },
    });
    const synced = await syncStarstreamLogFromFieldNote(note, {
      allowReplies: typeof body.allowReplies === "boolean" ? body.allowReplies : undefined,
      attachments: body.attachments,
    });
    if (synced && "error" in synced) throw new ApiError(400, TOXICITY_BLOCKED);
    return NextResponse.json({ note: noteView(note) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not save field note.");
  }
}
