import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireDemoUser } from "@/lib/learning/api";
import { sourcePolicyFromClassroom } from "@/lib/orchestrator/agent/flourish";

export const runtime = "nodejs";

/** Return the classroom policy that applies to the signed-in user's Home. */
export async function GET(request: Request) {
  try {
    const user = await requireDemoUser(request);
    const classroom = await prisma.classroom.findFirst({
      where:
        user.role === "teacher"
          ? { teacherId: user.id }
          : { memberships: { some: { userId: user.id } } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        sourceMode: true,
        approvedDomains: true,
      },
    });

    return NextResponse.json({
      classroom: classroom
        ? {
            id: classroom.id,
            name: classroom.name,
            dbSourceMode: classroom.sourceMode,
            ...sourcePolicyFromClassroom(classroom),
          }
        : null,
    });
  } catch (error) {
    return errorResponse(error, "Could not load the current classroom.");
  }
}
