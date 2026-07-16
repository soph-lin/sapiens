import { NextResponse } from "next/server";
import type { DialogueHistoryEntry } from "@/lib/dialogue";
import { coco, type CocoDialogueContext } from "@/lib/orchestrator/coco";

type ClientCocoContext = Pick<
  CocoDialogueContext,
  "topic" | "currentDialogue" | "dialogueHistory" | "speaker" | "history"
>;

function isDialogueHistory(value: unknown): value is DialogueHistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= 40 &&
    value.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const entry = item as Record<string, unknown>;
      return (
        typeof entry.nodeId === "string" &&
        typeof entry.kind === "string" &&
        typeof entry.text === "string" &&
        entry.text.length <= 4000
      );
    })
  );
}

function isContext(value: unknown): value is ClientCocoContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return (
    typeof context.topic === "string" &&
    Boolean(context.topic.trim()) &&
    context.topic.length <= 1000 &&
    typeof context.currentDialogue === "string" &&
    Boolean(context.currentDialogue.trim()) &&
    context.currentDialogue.length <= 4000 &&
    (context.speaker === undefined || typeof context.speaker === "string") &&
    (context.dialogueHistory === undefined || isDialogueHistory(context.dialogueHistory)) &&
    (context.history === undefined || (
      Array.isArray(context.history) &&
      context.history.length <= 12 &&
      context.history.every((item) => (
        item && typeof item === "object" &&
        ((item as Record<string, unknown>).role === "user" ||
          (item as Record<string, unknown>).role === "assistant") &&
        typeof (item as Record<string, unknown>).content === "string" &&
        ((item as Record<string, unknown>).content as string).length <= 4000
      ))
    ))
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
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

    const result = await coco(body.question, body.context);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Coco could not answer",
    }, { status: 500 });
  }
}
