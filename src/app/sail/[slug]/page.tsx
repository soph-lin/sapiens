import { notFound } from "next/navigation";
import { DialoguePanel } from "@/app/components/dialogue";
import { validateStoryPayload } from "@/lib/dialogue";
import { prisma } from "@/lib/prisma";

type StoryPageProps = {
  params: Promise<{ slug: string }>;
};

function dataUrl(asset: { mimeType: string; data: Uint8Array }): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString("base64")}`;
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { slug } = await params;
  const story = await prisma.story.findUnique({
    where: { slug },
    include: {
      characters: { include: { asset: true } },
      collectible: { include: { asset: true } },
    },
  });

  if (!story) notFound();
  const storyJson = validateStoryPayload(story.storyJson);

  return (
    <DialoguePanel
      scenarioId={`story-${story.slug}`}
      story={storyJson}
      theme="vanilla"
      title={story.topic}
      subtitle="A Sapiens voyage"
      characters={story.characters.map((character) => ({
        name: character.name,
        assetUrl: dataUrl(character.asset),
      }))}
      collectible={story.collectible ? {
        name: story.collectible.name,
        assetUrl: dataUrl(story.collectible.asset),
      } : undefined}
    />
  );
}
