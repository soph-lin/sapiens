import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, errorResponse, optionalText, parseJsonBody, publicationStatus, requireDemoUser, requireRole, requiredText } from "@/lib/learning/api";

export const runtime = "nodejs";

type JourneyBody = { title?: unknown; description?: unknown; status?: unknown; voyageIds?: unknown };

function orderedIds(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.some((id) => typeof id !== "string" || !id.trim())) {
    throw new ApiError(400, "voyageIds must be a non-empty ordered array of story IDs.");
  }
  const ids = value.map((id) => (id as string).trim());
  if (new Set(ids).size !== ids.length) throw new ApiError(400, "voyageIds cannot contain duplicates.");
  return ids;
}

async function publish(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: string, userId: string) {
  const journey = await tx.journey.findUnique({ where: { id }, include: { voyages: true } });
  if (!journey) throw new ApiError(404, "Journey not found.");
  if (!journey.voyages.length) throw new ApiError(400, "A journey must contain at least one voyage before publishing.");
  const publishedAt = new Date();
  await tx.story.updateMany({ where: { id: { in: journey.voyages.map((voyage) => voyage.storyId) } }, data: { status: "published", publishedAt, publishedById: userId } });
  return tx.journey.update({ where: { id }, data: { status: "published", publishedAt } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const { id } = await params;
    const existing = await prisma.journey.findUnique({ where: { id }, select: { createdById: true } });
    if (!existing || existing.createdById !== user.id) throw new ApiError(404, "Journey not found.");
    const body = parseJsonBody<JourneyBody>(await request.json());
    const ids = orderedIds(body.voyageIds);
    if (ids) {
      const count = await prisma.story.count({ where: { id: { in: ids } } });
      if (count !== ids.length) throw new ApiError(404, "One or more voyage story IDs were not found.");
    }
    const status = publicationStatus(body.status);
    const journey = await prisma.$transaction(async (tx) => {
      if (ids) {
        await tx.journeyVoyage.deleteMany({ where: { journeyId: id } });
        await tx.journeyVoyage.createMany({ data: ids.map((storyId, position) => ({ journeyId: id, storyId, position })) });
      }
      if (status === "published") return publish(tx, id, user.id);
      return tx.journey.update({
        where: { id },
        data: {
          title: body.title === undefined ? undefined : requiredText(body.title, "title"),
          description: body.description === undefined ? undefined : optionalText(body.description, "description"),
          status,
          ...(status === "draft" ? { publishedAt: null } : {}),
        },
      });
    });
    return NextResponse.json({ journey });
  } catch (error) {
    return errorResponse(error, "Could not update journey.");
  }
}
