import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAssignmentVisible, assertPublishedTargetStory, assignmentAccessInclude, assignmentIncludesStory, findAssignmentForAccess } from "@/lib/learning/access";
import { ApiError, errorResponse, jsonInput, parseJsonBody, publicationStatus, requireDemoUser, requiredText } from "@/lib/learning/api";
import { syncStarstreamLogFromFieldNote } from "@/lib/learning/starstream";

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
    }
    const assignmentIds = visible.map((assignment) => assignment.id);
    const storyIds = storyId ? [storyId] : undefined;
    const notes = await prisma.fieldNote.findMany({
      where: {
        AND: [
          { OR: [
            { assignmentId: { in: assignmentIds } },
            { story: { createdById: user.id } },
            { authorId: user.id, authorType: "bot" },
          ] },
          ...(storyIds ? [{ storyId: { in: storyIds } }] : []),
          // Teachers and students both need their own draft bot notes (actor citations).
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
    if (user.role !== "student") throw new ApiError(403, "Only cadets can publish field notes.");
    const body = parseJsonBody<NoteBody>(await request.json());
    const assignmentId = body.assignmentId === undefined || body.assignmentId === null || body.assignmentId === "" ? undefined : requiredText(body.assignmentId, "assignmentId");
    const storyId = requiredText(body.storyId, "storyId");
    const assignment = assignmentId ? await findAssignmentForAccess(assignmentId) : null;
    if (assignmentId && !assignment) throw new ApiError(404, "Assignment not found.");
    if (assignment) {
      assertAssignmentVisible(assignment, user);
      assertPublishedTargetStory(assignment, storyId);
    } else {
      const soloStory = await prisma.story.findFirst({ where: { id: storyId, createdById: user.id, status: "published" }, select: { id: true } });
      if (!soloStory) throw new ApiError(404, "Solo voyage not found.");
    }
    const status = publicationStatus(body.status) ?? "draft";
    const content = noteContent(body);
    const sources = body.sources === undefined ? undefined : jsonInput(body.sources, "sources");
    const title = body.title === undefined ? undefined : requiredText(body.title, "title");
    const existing = await prisma.fieldNote.findFirst({ where: { assignmentId: assignmentId ?? null, storyId, authorId: user.id, authorType: "user" }, orderBy: { updatedAt: "desc" } });
    const publishedAt =
      status === "published"
        ? existing?.status === "published" && existing.publishedAt
          ? existing.publishedAt
          : new Date()
        : null;
    const note = existing
      ? await prisma.fieldNote.update({
          where: { id: existing.id },
          data: {
            title,
            content,
            ...(sources === undefined ? {} : { sources }),
            status,
            publishedAt,
            publishedById: status === "published" ? (existing.publishedById ?? user.id) : null,
          },
          include: { author: { select: { username: true, displayName: true } }, story: { select: { id: true, slug: true, topic: true } } },
        })
      : await prisma.fieldNote.create({
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
          include: { author: { select: { username: true, displayName: true } }, story: { select: { id: true, slug: true, topic: true } } },
        });
    await syncStarstreamLogFromFieldNote(note, {
      allowReplies: typeof body.allowReplies === "boolean" ? body.allowReplies : undefined,
      attachments: body.attachments,
    });
    return NextResponse.json({ note: noteView(note) }, { status: existing ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, "Could not save field note.");
  }
}
