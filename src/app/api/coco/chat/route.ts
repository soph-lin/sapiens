import { NextResponse } from "next/server";
import type { DialogueHistoryEntry } from "@/lib/dialogue";
import { coco, type CocoDialogueContext } from "@/lib/orchestrator/agent/coco";
import { prisma } from "@/lib/prisma";
import { requireDemoUser } from "@/lib/learning/api";
import {
  assertAssignmentVisible,
  assertPublishedTargetStory,
  findAssignmentForAccess,
} from "@/lib/learning/access";
import {
  normalizeFlourishConfig,
  sourcePolicyFromClassroom,
} from "@/lib/orchestrator/agent/flourish";

type ClientCocoContext = Pick<
  CocoDialogueContext,
  "topic" | "currentDialogue" | "dialogueHistory" | "speaker" | "history" | "storyId" | "assignmentId" | "prefilledOption"
>;

const COCO_PREFILLED_OPTIONS = new Set([
  "What caused this historical event?",
  "Who were the key people involved?",
  "How did this moment change what came next?",
]);

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
    (context.storyId === undefined || (typeof context.storyId === "string" && context.storyId.length <= 200)) &&
    (context.assignmentId === undefined || (typeof context.assignmentId === "string" && context.assignmentId.length <= 200)) &&
    (context.prefilledOption === undefined || (typeof context.prefilledOption === "string" && context.prefilledOption.length <= 200)) &&
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function savePrivateCocoNote({
  request,
  context,
  noteTitle,
  prefilledOption,
  summary,
  sources,
}: {
  request: Request;
  context: ClientCocoContext;
  noteTitle: string;
  prefilledOption?: string;
  summary: string;
  sources: string[];
}) {
  if (!context.storyId || sources.length === 0) return undefined;

  let user;
  try {
    user = await requireDemoUser(request);
  } catch {
    return undefined;
  }

  if (context.assignmentId) {
    const assignment = await findAssignmentForAccess(context.assignmentId);
    if (!assignment) return undefined;
    assertAssignmentVisible(assignment, user);
    assertPublishedTargetStory(assignment, context.storyId);
  } else {
    const story = await prisma.story.findFirst({
      where: { id: context.storyId, status: "published" },
      select: { id: true },
    });
    if (!story) return undefined;
  }

  const note = await prisma.fieldNote.create({
    data: {
      assignmentId: context.assignmentId,
      storyId: context.storyId,
      authorId: user.id,
      authorType: "coco",
      title: (prefilledOption && COCO_PREFILLED_OPTIONS.has(prefilledOption.trim())
        ? prefilledOption.trim()
        : noteTitle.trim()).slice(0, 120),
      sources,
      content: {
        kind: "private",
        html: `<p>${escapeHtml(summary.trim())}</p>`,
      },
      status: "draft",
    },
    select: { id: true },
  });
  return note.id;
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

    let user: Awaited<ReturnType<typeof requireDemoUser>> | null = null;
    try {
      user = await requireDemoUser(request);
    } catch {
      // Public dialogue remains available without note persistence.
    }
    const classroom = user
      ? await prisma.classroom.findFirst({
          where: user.role === "teacher"
            ? { teacherId: user.id }
            : { memberships: { some: { userId: user.id } } },
          select: { sourceMode: true, approvedDomains: true },
        })
      : null;
    const flourish = normalizeFlourishConfig(sourcePolicyFromClassroom(classroom));
    const result = await coco(body.question, body.context, { flourish });
    const fieldNoteId = user
      ? await savePrivateCocoNote({
          request,
          context: body.context,
          noteTitle: result.noteTitle,
          prefilledOption: body.context.prefilledOption,
          summary: result.summary,
          sources: result.sources,
        })
      : undefined;
    return NextResponse.json({ ...result, fieldNoteId });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Coco could not answer",
    }, { status: 500 });
  }
}
