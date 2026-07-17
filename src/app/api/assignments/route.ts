import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assignmentAccessInclude, toAssignmentView } from "@/lib/learning/access";
import { ApiError, errorResponse, jsonInput, parseJsonBody, publicationStatus, requireDemoUser, requireRole, requiredText } from "@/lib/learning/api";

export const runtime = "nodejs";

type AssignmentBody = {
  classroomId?: unknown;
  storyId?: unknown;
  journeyId?: unknown;
  title?: unknown;
  status?: unknown;
  learningGuide?: unknown;
  lessonPlan?: unknown;
  sources?: unknown;
};

async function publishAssignment(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: string, teacherId: string) {
  const assignment = await tx.classroomAssignment.findUnique({
    where: { id },
    include: { story: true, journey: { include: { voyages: true } } },
  });
  if (!assignment) throw new ApiError(404, "Assignment not found.");
  const publishedAt = new Date();
  if (assignment.story) {
    await tx.story.update({ where: { id: assignment.story.id }, data: { status: "published", publishedAt, publishedById: teacherId } });
  } else if (assignment.journey) {
    if (!assignment.journey.voyages.length) throw new ApiError(400, "A journey must contain at least one voyage before publishing.");
    await tx.story.updateMany({ where: { id: { in: assignment.journey.voyages.map((voyage) => voyage.storyId) } }, data: { status: "published", publishedAt, publishedById: teacherId } });
    await tx.journey.update({ where: { id: assignment.journey.id }, data: { status: "published", publishedAt } });
  } else {
    throw new ApiError(400, "Assignment must target one story or one journey.");
  }
  return tx.classroomAssignment.update({ where: { id }, data: { status: "published", publishedAt } });
}

function targetInput(body: AssignmentBody) {
  const storyId = typeof body.storyId === "string" && body.storyId.trim() ? body.storyId.trim() : undefined;
  const journeyId = typeof body.journeyId === "string" && body.journeyId.trim() ? body.journeyId.trim() : undefined;
  if (Boolean(storyId) === Boolean(journeyId)) {
    throw new ApiError(400, "Provide exactly one of storyId or journeyId.");
  }
  return { storyId, journeyId };
}

export async function GET(request: Request) {
  try {
    const user = await requireDemoUser(request);
    const assignments = await prisma.classroomAssignment.findMany({
      where: user.role === "teacher"
        ? { classroom: { teacherId: user.id } }
        : {
            status: "published",
            classroom: { memberships: { some: { userId: user.id } } },
            OR: [
              { story: { status: "published" } },
              { journey: { status: "published", voyages: { some: {}, every: { story: { status: "published" } } } } },
            ],
          },
      orderBy: { createdAt: "asc" },
      include: assignmentAccessInclude,
    });
    return NextResponse.json({ assignments: assignments.map(toAssignmentView) });
  } catch (error) {
    return errorResponse(error, "Could not load assignments.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const body = parseJsonBody<AssignmentBody>(await request.json());
    const classroomId = requiredText(body.classroomId, "classroomId");
    const { storyId, journeyId } = targetInput(body);
    const classroom = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { teacherId: true } });
    if (!classroom || classroom.teacherId !== user.id) throw new ApiError(404, "Classroom not found.");
    if (storyId) {
      const story = await prisma.story.findUnique({ where: { id: storyId }, select: { id: true } });
      if (!story) throw new ApiError(404, "Voyage not found.");
    } else {
      const journey = await prisma.journey.findUnique({ where: { id: journeyId }, select: { id: true, createdById: true } });
      if (!journey || journey.createdById !== user.id) throw new ApiError(404, "Journey not found.");
    }
    const status = publicationStatus(body.status) ?? "draft";
    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.classroomAssignment.create({
        data: {
          classroomId,
          createdById: user.id,
          storyId,
          journeyId,
          title: body.title === undefined ? (storyId ? "Voyage assignment" : "Journey assignment") : requiredText(body.title, "title"),
          status: "draft",
          learningGuide: body.learningGuide === undefined ? undefined : jsonInput(body.learningGuide, "learningGuide"),
          lessonPlan: body.lessonPlan === undefined ? undefined : jsonInput(body.lessonPlan, "lessonPlan"),
          sources: body.sources === undefined ? undefined : jsonInput(body.sources, "sources"),
        },
      });
      return status === "published" ? publishAssignment(tx, created.id, user.id) : created;
    });
    const result = await prisma.classroomAssignment.findUnique({ where: { id: assignment.id }, include: assignmentAccessInclude });
    return NextResponse.json({ assignment: result ? toAssignmentView(result) : assignment }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not create assignment.");
  }
}
