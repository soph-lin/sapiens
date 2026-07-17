import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, errorResponse, parseJsonBody, requireDemoUser, requireRole, requiredText } from "@/lib/learning/api";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const { id: classroomId } = await params;
    const classroom = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { teacherId: true } });
    if (!classroom || classroom.teacherId !== user.id) throw new ApiError(404, "Classroom not found.");
    const body = parseJsonBody<{ username?: unknown }>(await request.json());
    const username = requiredText(body.username, "username").toLowerCase();
    if (username !== "galileo") throw new ApiError(400, "Only galileo is available as a student in this MVP.");
    const member = await prisma.user.findUnique({ where: { username } });
    if (!member || member.role !== "student") throw new ApiError(400, "Student user not found.");
    const membership = await prisma.classroomMembership.upsert({
      where: { classroomId_userId: { classroomId, userId: member.id } },
      create: { classroomId, userId: member.id },
      update: {},
      include: { user: { select: { username: true, displayName: true, role: true } } },
    });
    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not add classroom member.");
  }
}
