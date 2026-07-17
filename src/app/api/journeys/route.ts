import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, parseJsonBody, publicationStatus, requireDemoUser, requireRole, requiredText, optionalText, ApiError } from "@/lib/learning/api";

export const runtime = "nodejs";

type JourneyBody = {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  voyageIds?: unknown;
};

function voyageIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== "string" || !id.trim())) {
    throw new ApiError(400, "voyageIds must be a non-empty ordered array of story IDs.");
  }
  const ids = value.map((id) => (id as string).trim());
  if (new Set(ids).size !== ids.length) throw new ApiError(400, "voyageIds cannot contain duplicates.");
  return ids;
}

async function publishJourney(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], journeyId: string, userId: string) {
  const journey = await tx.journey.findUnique({ where: { id: journeyId }, include: { voyages: true } });
  if (!journey) throw new ApiError(404, "Journey not found.");
  if (!journey.voyages.length) throw new ApiError(400, "A journey must contain at least one voyage before publishing.");
  const publishedAt = new Date();
  await tx.story.updateMany({
    where: { id: { in: journey.voyages.map((voyage) => voyage.storyId) } },
    data: { status: "published", publishedAt, publishedById: userId },
  });
  return tx.journey.update({ where: { id: journeyId }, data: { status: "published", publishedAt } });
}

function view(journey: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdById: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  voyages: Array<{ id: string; position: number; story: { id: string; slug: string; topic: string; status: string } }>;
}) {
  return { ...journey, voyages: journey.voyages.map(({ story, ...voyage }) => ({ ...voyage, story })) };
}

export async function GET(request: Request) {
  try {
    const user = await requireDemoUser(request);
    const journeys = await prisma.journey.findMany({
      where: user.role === "teacher"
        ? { createdById: user.id }
        : {
            status: "published",
            voyages: { some: {}, every: { story: { status: "published" } } },
            assignments: {
              some: {
                status: "published",
                classroom: { memberships: { some: { userId: user.id } } },
              },
            },
          },
      orderBy: { createdAt: "asc" },
      include: {
        voyages: {
          orderBy: { position: "asc" },
          include: { story: { select: { id: true, slug: true, topic: true, status: true } } },
        },
      },
    });
    return NextResponse.json({ journeys: journeys.map(view) });
  } catch (error) {
    return errorResponse(error, "Could not load journeys.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDemoUser(request);
    requireRole(user, "teacher");
    const body = parseJsonBody<JourneyBody>(await request.json());
    const title = requiredText(body.title, "title");
    const description = optionalText(body.description, "description");
    const status = publicationStatus(body.status) ?? "draft";
    const ids = voyageIds(body.voyageIds);
    const stories = await prisma.story.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (stories.length !== ids.length) throw new ApiError(404, "One or more voyage story IDs were not found.");

    const journey = await prisma.$transaction(async (tx) => {
      const created = await tx.journey.create({
        data: {
          title,
          description,
          status: "draft",
          createdById: user.id,
          voyages: { create: ids.map((storyId, position) => ({ storyId, position })) },
        },
        include: { voyages: true },
      });
      return status === "published"
        ? publishJourney(tx, created.id, user.id)
        : created;
    });
    return NextResponse.json({ journey }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not create journey.");
  }
}
