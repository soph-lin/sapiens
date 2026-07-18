import { notFound } from "next/navigation";
import { StoryDialogue } from "@/app/components/dialogue";
import { validateStoryPayload } from "@/lib/dialogue";
import { getCurrentDemoUser } from "@/lib/demo-auth";
import { prisma } from "@/lib/prisma";
import type { StoryReport } from "@/lib/orchestrator/agent/flourish";

type StoryPageProps = {
  params: Promise<{ slug: string }>;
};

function dataUrl(asset: { mimeType: string; data: Uint8Array }): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString("base64")}`;
}

function reportValue(value: unknown): StoryReport | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const report = value as Record<string, unknown>;
  if (typeof report.reportText !== "string" || !Array.isArray(report.sources)) return undefined;
  const sources = report.sources.flatMap((source) => source && typeof source === "object" && typeof (source as Record<string, unknown>).url === "string" && typeof (source as Record<string, unknown>).title === "string" ? [source as StoryReport["sources"][number]] : []);
  const furtherReading = Array.isArray(report.furtherReading) ? report.furtherReading.flatMap((source) => source && typeof source === "object" && typeof (source as Record<string, unknown>).url === "string" && typeof (source as Record<string, unknown>).title === "string" ? [source as StoryReport["furtherReading"][number]] : []) : [];
  return { reportText: report.reportText, sources, furtherReading };
}

async function classShareForStudent(
  story: { id: string; createdById: string | null },
  studentId: string,
) {
  const assignment = await prisma.classroomAssignment.findFirst({
    where: {
      status: "published",
      classroom: { memberships: { some: { userId: studentId } } },
      OR: [
        { storyId: story.id },
        { journey: { voyages: { some: { storyId: story.id } } } },
      ],
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (assignment) {
    return {
      storyId: story.id,
      assignmentId: assignment.id,
      required: true as const,
      showNote: true as const,
    };
  }

  // Solo voyages: optional class note when the cadet owns the voyage and belongs
  // to a classroom. Same VoyageTakeawayNote UI; publishing is not required.
  if (story.createdById !== studentId) return undefined;
  const membership = await prisma.classroomMembership.findFirst({
    where: { userId: studentId },
    select: { id: true },
  });
  return { storyId: story.id, required: false as const, showNote: Boolean(membership) };
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { slug } = await params;
  const [story, user] = await Promise.all([
    prisma.story.findUnique({
      where: { slug },
      include: {
        characters: { include: { asset: true } },
        collectible: { include: { asset: true } },
      },
    }),
    getCurrentDemoUser(),
  ]);

  if (!story) notFound();
  const storyJson = validateStoryPayload(story.storyJson);
  const classShare =
    user?.role === "student"
      ? await classShareForStudent(story, user.id)
      : undefined;

  return (
    <StoryDialogue
      scenarioId={`story-${story.slug}`}
      story={storyJson}
      theme="vanilla"
      title={story.topic}
      subtitle="A Sapiens voyage"
      storyId={story.id}
      characters={story.characters.map((character) => ({
        name: character.name,
        assetUrl: dataUrl(character.asset),
      }))}
      collectible={story.collectible ? {
        name: story.collectible.name,
        assetUrl: dataUrl(story.collectible.asset),
      } : undefined}
      report={reportValue(story.report)}
      classShare={classShare}
    />
  );
}
