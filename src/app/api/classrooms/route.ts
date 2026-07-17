import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, parseJsonBody, requireDemoUser, requireRole, requiredText } from "@/lib/learning/api";
import { generateClassroomCode } from "@/lib/learning/classroom-code";

export const runtime = "nodejs";

type ClassroomBody = { name?: unknown; memberUsernames?: unknown };

async function allocateClassroomCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateClassroomCode();
    const existing = await prisma.classroom.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Could not allocate a classroom code.");
}

export async function GET(request: Request) {
  try {
    const user = await requireDemoUser(request);
    const classrooms = await prisma.classroom.findMany({
      where: user.role === "teacher"
        ? { teacherId: user.id }
        : { memberships: { some: { userId: user.id } } },
      orderBy: { createdAt: "asc" },
      include: {
        teacher: { select: { username: true, displayName: true } },
        memberships: { include: { user: { select: { username: true, displayName: true, role: true } } } },
        assignments: { select: { id: true, title: true, status: true, storyId: true, journeyId: true, publishedAt: true } },
      },
    });
    return NextResponse.json({ classrooms });
  } catch (error) {
    return errorResponse(error, "Could not load classrooms.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const body = parseJsonBody<ClassroomBody>(await request.json());
    const name = requiredText(body.name, "name");
    const requestedMembers = body.memberUsernames === undefined
      ? ["galileo"]
      : body.memberUsernames;
    if (!Array.isArray(requestedMembers) || requestedMembers.some((value) => value !== "galileo")) {
      throw new Error("memberUsernames may only contain galileo in this MVP.");
    }
    const includesGalileo = requestedMembers.includes("galileo");
    const galileo = includesGalileo ? await prisma.user.findUnique({ where: { username: "galileo" }, select: { id: true } }) : null;
    if (includesGalileo && !galileo) throw new Error("Demo student is not initialized.");

    const code = await allocateClassroomCode();
    const classroom = await prisma.classroom.create({
      data: {
        name,
        code,
        teacherId: user.id,
        memberships: {
          create: [
            { userId: user.id },
            ...(galileo ? [{ userId: galileo.id }] : []),
          ],
        },
      },
      include: {
        memberships: { include: { user: { select: { username: true, displayName: true, role: true } } } },
      },
    });
    return NextResponse.json({ classroom }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not create classroom.");
  }
}
