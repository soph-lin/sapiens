import { NextResponse } from "next/server";
import { actor, type ActorDialogueContext } from "@/lib/orchestrator/actor";
import { prisma } from "@/lib/prisma";

type ClientActorContext = Pick<ActorDialogueContext, "firstGreeting" | "conversation">;

function isContext(value: unknown): value is ClientActorContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return (
    (context.firstGreeting === undefined || typeof context.firstGreeting === "boolean") &&
    (context.conversation === undefined || (
      Array.isArray(context.conversation) &&
      context.conversation.length <= 20 &&
      context.conversation.every((entry) => (
        entry && typeof entry === "object" &&
        (((entry as Record<string, unknown>).role === "learner") ||
          ((entry as Record<string, unknown>).role === "character")) &&
        typeof (entry as Record<string, unknown>).content === "string" &&
        ((entry as Record<string, unknown>).content as string).length <= 2000
      ))
    ))
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.characterId !== "string" ||
      !body.characterId.trim() ||
      body.characterId.length > 200
    ) {
      return NextResponse.json({ error: "characterId is required" }, { status: 400 });
    }
    if (
      typeof body.question !== "string" ||
      !body.question.trim() ||
      body.question.length > 2000
    ) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }
    if (!isContext(body.context)) {
      return NextResponse.json({ error: "context is invalid" }, { status: 400 });
    }

    const character = await prisma.character.findUnique({
      where: { id: body.characterId },
      select: {
        name: true,
        description: true,
        story: { select: { topic: true, synopsis: true } },
      },
    });
    if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });

    const result = await actor(body.question, {
      topic: character.story.topic,
      synopsis: character.story.synopsis ?? undefined,
      characterName: character.name,
      characterDescription: character.description,
      firstGreeting: body.context.firstGreeting,
      conversation: body.context.conversation,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The character could not answer",
    }, { status: 500 });
  }
}
