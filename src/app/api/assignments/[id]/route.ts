import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertAssignmentVisible, assignmentAccessInclude, toAssignmentView } from "@/lib/learning/access";
import { ApiError, errorResponse, jsonInput, parseJsonBody, publicationStatus, requireDemoUser, requireRole, requiredText } from "@/lib/learning/api";

export const runtime = "nodejs";

type AssignmentBody = { title?: unknown; status?: unknown; learningGuide?: unknown; lessonPlan?: unknown; sources?: unknown };

async function publish(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: string, teacherId: string) {
  const assignment = await tx.classroomAssignment.findUnique({ where: { id }, include: { story: true, journey: { include: { voyages: true } } } });
  if (!assignment) throw new ApiError(404, "Assignment not found.");
  const publishedAt = new Date();
  if (assignment.story) {
    await tx.story.update({ where: { id: assignment.story.id }, data: { status: "published", publishedAt, publishedById: teacherId } });
  } else if (assignment.journey && assignment.journey.voyages.length) {
    await tx.story.updateMany({ where: { id: { in: assignment.journey.voyages.map((voyage) => voyage.storyId) } }, data: { status: "published", publishedAt, publishedById: teacherId } });
    await tx.journey.update({ where: { id: assignment.journey.id }, data: { status: "published", publishedAt } });
  } else {
    throw new ApiError(400, "A journey assignment must contain at least one voyage before publishing.");
  }
  return tx.classroomAssignment.update({ where: { id }, data: { status: "published", publishedAt } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDemoUser(request);
    const { id } = await params;
    const assignment = await prisma.classroomAssignment.findUnique({ where: { id }, include: assignmentAccessInclude });
    if (!assignment) throw new ApiError(404, "Assignment not found.");
    assertAssignmentVisible(assignment, user);
    return NextResponse.json({ assignment: toAssignmentView(assignment) });
  } catch (error) {
    return errorResponse(error, "Could not load assignment.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const { id } = await params;
    const existing = await prisma.classroomAssignment.findUnique({ where: { id }, select: { classroom: { select: { teacherId: true } } } });
    if (!existing || existing.classroom.teacherId !== user.id) throw new ApiError(404, "Assignment not found.");
    const body = parseJsonBody<AssignmentBody>(await request.json());
    const status = publicationStatus(body.status);
    const assignment = await prisma.$transaction(async (tx) => {
      if (status === "published") await publish(tx, id, user.id);
      return tx.classroomAssignment.update({
        where: { id },
        data: {
          title: body.title === undefined ? undefined : requiredText(body.title, "title"),
          ...(status === undefined ? {} : status === "published" ? { status: "published" as const } : { status, publishedAt: null }),
          learningGuide: body.learningGuide === undefined ? undefined : jsonInput(body.learningGuide, "learningGuide"),
          lessonPlan: body.lessonPlan === undefined ? undefined : jsonInput(body.lessonPlan, "lessonPlan"),
          sources: body.sources === undefined ? undefined : jsonInput(body.sources, "sources"),
        },
      });
    });
    const result = await prisma.classroomAssignment.findUnique({ where: { id: assignment.id }, include: assignmentAccessInclude });
    return NextResponse.json({ assignment: result ? toAssignmentView(result) : assignment });
  } catch (error) {
    return errorResponse(error, "Could not update assignment.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const { id } = await params;
    const existing = await prisma.classroomAssignment.findUnique({ where: { id }, select: { classroom: { select: { teacherId: true } } } });
    if (!existing || existing.classroom.teacherId !== user.id) throw new ApiError(404, "Assignment not found.");
    await prisma.classroomAssignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete assignment.");
  }
}
