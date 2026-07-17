import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, errorResponse, jsonInput, requireDemoUser, requireRole, requiredText } from "@/lib/learning/api";
import { assertAssignmentVisible, assignmentAccessInclude, toAssignmentView } from "@/lib/learning/access";
import { parseApprovedDomains, sourcePolicyFromClassroom } from "@/lib/orchestrator/agent/flourish";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDemoUser(request);
    const { id } = await params;
    const classroom = await prisma.classroom.findUnique({
      where: { id },
      include: {
        teacher: { select: { username: true, displayName: true } },
        memberships: { include: { user: { select: { username: true, displayName: true, role: true } } } },
        assignments: { orderBy: { createdAt: "asc" }, include: assignmentAccessInclude },
      },
    });
    if (!classroom) throw new ApiError(404, "Classroom not found.");
    const isTeacher = user.role === "teacher" && classroom.teacherId === user.id;
    const isMember = classroom.memberships.some((membership) => membership.userId === user.id);
    if (!isTeacher && !isMember) throw new ApiError(404, "Classroom not found.");
    return NextResponse.json({
      classroom: {
        ...classroom,
        assignments: isTeacher
          ? classroom.assignments
          : classroom.assignments.filter((assignment) => { try { assertAssignmentVisible(assignment, user); return true; } catch { return false; } }).map(toAssignmentView),
      },
    });
  } catch (error) {
    return errorResponse(error, "Could not load classroom.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const { id } = await params;
    const classroom = await prisma.classroom.findUnique({ where: { id }, select: { teacherId: true } });
    if (!classroom || classroom.teacherId !== user.id) throw new ApiError(404, "Classroom not found.");
    const body = (await request.json()) as { name?: unknown; sourceMode?: unknown; approvedDomains?: unknown };
    if (body.sourceMode !== undefined && body.sourceMode !== "free" && body.sourceMode !== "restricted") {
      throw new ApiError(400, "sourceMode must be free or restricted.");
    }
    const approvedDomains = body.approvedDomains === undefined
      ? undefined
      : Array.isArray(body.approvedDomains)
        ? parseApprovedDomains(body.approvedDomains)
        : (() => { throw new ApiError(400, "approvedDomains must be an array of host names."); })();

    // Settings rule: any domain => Restricted; empty list => Free.
    const nextSourceMode =
      approvedDomains !== undefined
        ? approvedDomains.length > 0
          ? "restricted" as const
          : "free" as const
        : body.sourceMode === "restricted" || body.sourceMode === "free"
          ? body.sourceMode
          : undefined;
    if (nextSourceMode === "restricted" && approvedDomains !== undefined && approvedDomains.length === 0) {
      throw new ApiError(400, "Restricted mode requires at least one approved domain.");
    }

    const updated = await prisma.classroom.update({
      where: { id },
      data: {
        name: body.name === undefined ? undefined : requiredText(body.name, "name"),
        sourceMode: nextSourceMode,
        approvedDomains:
          approvedDomains === undefined
            ? undefined
            : jsonInput(approvedDomains, "approvedDomains"),
      },
      select: { id: true, name: true, sourceMode: true, approvedDomains: true, updatedAt: true },
    });
    const policy = sourcePolicyFromClassroom(updated);
    return NextResponse.json({
      classroom: {
        ...updated,
        sourceMode: policy.sourceMode,
        approvedDomains: policy.approvedDomains,
      },
    });
  } catch (error) {
    return errorResponse(error, "Could not update classroom.");
  }
}
