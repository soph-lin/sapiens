import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAssignmentVisible, assertPublishedTargetStory, assignmentAccessInclude, assignmentIncludesStory, findAssignmentForAccess } from "@/lib/learning/access";
import { ApiError, errorResponse, jsonInput, parseJsonBody, requireDemoUser, requiredText } from "@/lib/learning/api";
import { isVoyageCompletionNote } from "@/lib/learning/field-note-content";

export const runtime = "nodejs";

type ProgressBody = { assignmentId?: unknown; storyId?: unknown; progress?: unknown; currentNodeId?: unknown; completed?: unknown };

export async function GET(request: Request) {
  try {
    const user = await requireDemoUser(request);
    if (user.role !== "student") throw new ApiError(403, "Only cadets have voyage progress.");
    const url = new URL(request.url);
    const storyId = url.searchParams.get("storyId");
    const progress = await prisma.voyageProgress.findMany({ where: { studentId: user.id, ...(storyId ? { storyId } : {}) }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ progress });
  } catch (error) {
    return errorResponse(error, "Could not load progress.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDemoUser(request);
    if (user.role !== "student") throw new ApiError(403, "Only cadets can update voyage progress.");
    const body = parseJsonBody<ProgressBody>(await request.json());
    const assignmentId = body.assignmentId === undefined || body.assignmentId === null || body.assignmentId === "" ? undefined : requiredText(body.assignmentId, "assignmentId");
    const storyId = requiredText(body.storyId, "storyId");
    let assignment = assignmentId ? await findAssignmentForAccess(assignmentId) : null;
    if (assignment) {
      assertAssignmentVisible(assignment, user);
      // The story is authoritative for progress. If the client supplied a stale
      // or mismatched assignment id, resolve the current classroom assignment
      // for this story instead of rejecting an otherwise valid completion.
      if (!assignmentIncludesStory(assignment, storyId)) assignment = null;
    }
    if (!assignment) {
      assignment = await prisma.classroomAssignment.findFirst({
        where: {
          status: "published",
          classroom: { memberships: { some: { userId: user.id } } },
          OR: [
            { storyId },
            { journey: { voyages: { some: { storyId } } } },
          ],
        },
        include: assignmentAccessInclude,
        orderBy: { updatedAt: "desc" },
      });
    }
    if (assignment) {
      assertAssignmentVisible(assignment, user);
      assertPublishedTargetStory(assignment, storyId);
    } else {
      const soloStory = await prisma.story.findFirst({ where: { id: storyId, createdById: user.id, status: "published" }, select: { id: true } });
      if (!soloStory) throw new ApiError(404, "Solo voyage not found.");
    }
    if (body.completed === true) {
      if (assignment) {
        const notes = await prisma.fieldNote.findMany({
          where: {
            assignmentId: assignment.id,
            storyId,
            authorId: user.id,
            status: "published",
            authorType: "user",
          },
          select: { content: true, status: true, authorType: true },
        });
        if (!notes.some((note) => isVoyageCompletionNote(note))) {
          throw new ApiError(400, "Publish a field note before completing this voyage.");
        }
      }
    }
    if (body.progress === undefined) throw new ApiError(400, "progress is required.");
    const completed = body.completed === true;
    const updated = await prisma.voyageProgress.upsert({
      where: { studentId_storyId: { studentId: user.id, storyId } },
      create: { studentId: user.id, storyId, assignmentId: assignment?.id, progress: jsonInput(body.progress, "progress"), currentNodeId: typeof body.currentNodeId === "string" ? body.currentNodeId : undefined, completed, completedAt: completed ? new Date() : null },
      update: { assignmentId: assignment?.id, progress: jsonInput(body.progress, "progress"), currentNodeId: typeof body.currentNodeId === "string" ? body.currentNodeId : undefined, completed, completedAt: completed ? new Date() : null },
    });
    return NextResponse.json({ progress: updated });
  } catch (error) {
    return errorResponse(error, "Could not save progress.");
  }
}
