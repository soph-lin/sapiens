import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, errorResponse, jsonInput, parseJsonBody, publicationStatus, requireDemoUser, requiredText } from "@/lib/learning/api";
import { publishVisitorNoteToStarstream, syncStarstreamLogFromFieldNote } from "@/lib/learning/starstream";

export const runtime = "nodejs";

type NoteBody = {
  action?: unknown;
  title?: unknown;
  content?: unknown;
  body?: unknown;
  status?: unknown;
  sources?: unknown;
  allowReplies?: unknown;
  attachments?: unknown;
  commentary?: unknown;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDemoUser(request);
    const { id } = await params;
    const note = await prisma.fieldNote.findUnique({
      where: { id },
      include: {
        story: { select: { id: true, slug: true, topic: true } },
        author: { select: { username: true, displayName: true } },
        starstreamLog: { select: { id: true, type: true } },
      },
    });
    if (!note) throw new ApiError(404, "Field note not found.");
    if (note.authorId !== user.id) throw new ApiError(403, "Only the note author can edit it.");

    const body = parseJsonBody<NoteBody>(await request.json());

    if (body.action === "publish-visitor-note") {
      if (note.authorType !== "bot") throw new ApiError(400, "Only visitor notes can be shared this way.");
      const commentary =
        body.commentary === undefined || body.commentary === null
          ? undefined
          : requiredText(body.commentary, "commentary");
      const result = await publishVisitorNoteToStarstream({
        note,
        publisher: { id: user.id, displayName: user.displayName },
        commentary,
        voyageTopic: note.story.topic,
      });
      if ("error" in result) {
        if (result.error === "empty_fact") throw new ApiError(400, "This visitor note has no fact to share.");
        if (result.error === "forbidden") throw new ApiError(403, "Only the note owner can publish it.");
        throw new ApiError(400, "Could not publish visitor note.");
      }
      const refreshed = await prisma.fieldNote.findUnique({
        where: { id },
        include: {
          author: { select: { username: true, displayName: true } },
          story: { select: { id: true, slug: true, topic: true } },
          starstreamLog: { select: { id: true, type: true } },
        },
      });
      return NextResponse.json({
        note: refreshed,
        starstreamLogId: result.log.id,
      });
    }

    const status = publicationStatus(body.status) ?? note.status;
    const content = body.content !== undefined ? jsonInput(body.content, "content") : body.body === undefined ? undefined : { body: requiredText(body.body, "body") };
    const sources = body.sources === undefined ? undefined : jsonInput(body.sources, "sources");
    const publishedAt =
      status === "published"
        ? note.status === "published" && note.publishedAt
          ? note.publishedAt
          : new Date()
        : null;
    const updated = await prisma.fieldNote.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title === null ? null : requiredText(body.title, "title") } : {}),
        ...(content === undefined ? {} : { content }),
        ...(sources === undefined ? {} : { sources }),
        status,
        publishedAt,
        publishedById: status === "published" ? (note.publishedById ?? user.id) : null,
      },
      include: {
        author: { select: { username: true, displayName: true } },
        story: { select: { id: true, slug: true, topic: true } },
        starstreamLog: { select: { id: true, type: true } },
      },
    });
    await syncStarstreamLogFromFieldNote(updated, {
      allowReplies: typeof body.allowReplies === "boolean" ? body.allowReplies : undefined,
      attachments: body.attachments,
    });
    return NextResponse.json({ note: updated });
  } catch (error) {
    return errorResponse(error, "Could not update field note.");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireDemoUser(request);
    const { id } = await params;
    const note = await prisma.fieldNote.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!note) throw new ApiError(404, "Field note not found.");
    if (note.authorId !== user.id) {
      throw new ApiError(403, "Only the note author can delete it.");
    }
    await prisma.starstreamLog.deleteMany({ where: { fieldNoteId: id } });
    await prisma.fieldNote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete field note.");
  }
}
