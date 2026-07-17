import { actor, type ActorDialogueContext } from "@/lib/orchestrator/agent/actor";
import { isFirstGreetingMode } from "@/lib/orchestrator/agent/actor-greeting";
import { prisma } from "@/lib/prisma";
import { requireDemoUser } from "@/lib/learning/api";
import {
  normalizeFlourishConfig,
  sourcePolicyFromClassroom,
  type FlourishConfig,
} from "@/lib/orchestrator/agent/flourish";
import type { AgentProgressEvent } from "@/lib/orchestrator/types";

export const runtime = "nodejs";

type ClientActorContext = Pick<
  ActorDialogueContext,
  | "firstGreeting"
  | "greetingMode"
  | "timeOfDay"
  | "conversation"
  | "followUpQuestions"
  | "storyId"
  | "assignmentId"
>;

function isTimeOfDay(value: unknown): value is NonNullable<ActorDialogueContext["timeOfDay"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const time = value as Record<string, unknown>;
  return (
    typeof time.hour === "number" &&
    Number.isInteger(time.hour) &&
    time.hour >= 0 &&
    time.hour <= 23 &&
    (time.period === "morning" ||
      time.period === "afternoon" ||
      time.period === "evening" ||
      time.period === "night") &&
    (time.meal === "breakfast" ||
      time.meal === "lunch" ||
      time.meal === "dinner" ||
      time.meal === "snack")
  );
}

function isContext(value: unknown): value is ClientActorContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return (
    (context.firstGreeting === undefined || typeof context.firstGreeting === "boolean") &&
    (context.greetingMode === undefined || isFirstGreetingMode(context.greetingMode)) &&
    (context.timeOfDay === undefined || isTimeOfDay(context.timeOfDay)) &&
    (context.followUpQuestions === undefined ||
      typeof context.followUpQuestions === "boolean") &&
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

/** Actor citations follow classroom domains; empty list means any HTTPS source is allowed. */
function actorFlourishFromClassroom(
  classroom: { sourceMode: string; approvedDomains: unknown } | null,
): FlourishConfig {
  return normalizeFlourishConfig({
    ...sourcePolicyFromClassroom(classroom),
    furtherReading: false,
  });
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function sse(event: string, data: unknown, encoder: TextEncoder) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body");
  }

  if (
    typeof body.characterId !== "string" ||
    !body.characterId.trim() ||
    body.characterId.length > 200
  ) {
    return jsonError("characterId is required");
  }
  if (!isContext(body.context)) {
    return jsonError("context is invalid");
  }
  const clientContext = body.context;

  const followUpQuestions = clientContext.followUpQuestions === true;
  if (
    !followUpQuestions &&
    (typeof body.question !== "string" ||
      !body.question.trim() ||
      body.question.length > 2000)
  ) {
    return jsonError("question is required");
  }
  if (clientContext.firstGreeting === true && !clientContext.greetingMode) {
    return jsonError("greetingMode is required when firstGreeting is true");
  }
  if (followUpQuestions && clientContext.firstGreeting === true) {
    return jsonError("followUpQuestions cannot be combined with firstGreeting");
  }

  const character = await prisma.character.findUnique({
    where: { id: body.characterId },
    select: {
      name: true,
      description: true,
      story: { select: { id: true, topic: true, synopsis: true } },
    },
  });
  if (!character) return jsonError("Character not found", 404);

  let user: Awaited<ReturnType<typeof requireDemoUser>> | null = null;
  try { user = await requireDemoUser(request); } catch { /* Public dialogue can continue without persistence. */ }

  const classroom = user
    ? await prisma.classroom.findFirst({
        where:
          user.role === "teacher"
            ? { teacherId: user.id }
            : { memberships: { some: { userId: user.id } } },
        select: { sourceMode: true, approvedDomains: true },
      })
    : null;
  const flourish = actorFlourishFromClassroom(classroom);

  const assignment = user
    ? await prisma.classroomAssignment.findFirst({
        where: {
          status: "published",
          classroom: { memberships: { some: { userId: user.id } } },
          OR: [
            { storyId: character.story.id },
            { journey: { voyages: { some: { storyId: character.story.id } } } },
          ],
        },
        select: { id: true },
      })
    : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const progress: AgentProgressEvent[] = [];
      const emit = (event: string, data: unknown) => {
        controller.enqueue(sse(event, data, encoder));
      };
      const emitProgress = (event: AgentProgressEvent) => {
        progress.push(event);
        emit("progress", event);
      };

      void (async () => {
        try {
          const result = await actor(
            followUpQuestions
              ? "Suggest three follow-up questions the learner might ask next."
              : (body.question as string),
            {
              topic: character.story.topic,
              synopsis: character.story.synopsis ?? undefined,
              characterName: character.name,
              characterDescription: character.description,
              firstGreeting: clientContext.firstGreeting,
              greetingMode: clientContext.greetingMode,
              timeOfDay: clientContext.timeOfDay,
              conversation: clientContext.conversation,
              followUpQuestions,
              flourish,
              storyId: character.story.id,
              assignmentId: assignment?.id,
            },
            {
              flourish,
              progress,
              onProgress: (event) => emit("progress", event),
              signal: request.signal,
            },
          );

          let fieldNoteId: string | undefined;
          const hasUser = Boolean(user);
          const notFollowUp = !followUpQuestions;
          const notGreeting = clientContext.firstGreeting !== true;
          const hasSources = Boolean(result.sources?.length);
          const canCreateFieldNote = Boolean(hasUser && notFollowUp && notGreeting && hasSources);

          // TEMP debug: field-note gate (terminal + live [d] panel)
          const fieldNoteDebug = [
            `hasUser: ${hasUser}`,
            `notFollowUp: ${notFollowUp}`,
            `notGreeting: ${notGreeting}`,
            `hasSources: ${hasSources} sources: ${JSON.stringify(result.sources ?? null)}`,
            `canCreateFieldNote: ${canCreateFieldNote}`,
          ];
          for (const message of fieldNoteDebug) {
            console.info(`[field-note debug] ${message}`);
            emitProgress({
              agent: "actor",
              phase: "agent",
              message: `[field-note] ${message}`,
            });
          }

          if (canCreateFieldNote && user) {
            console.info("Creating field note...");
            emitProgress({ agent: "actor", phase: "agent", message: "Creating field note..." });
            const note = await prisma.fieldNote.create({
              data: {
                assignmentId: assignment?.id,
                storyId: character.story.id,
                authorId: user.id,
                authorType: "bot",
                authorName: character.name,
                sources: result.sources,
                content: {
                  body: result.summary ?? result.answer ?? "",
                  title: `A note from ${character.name}`,
                },
                status: "draft",
              },
              select: { id: true },
            });
            fieldNoteId = note.id;
            console.info(`[field-note debug] created id: ${note.id}`);
            emitProgress({
              agent: "actor",
              phase: "agent",
              message: `Created field note ${note.id}`,
              details: { fieldNoteId: note.id },
            });
          }

          emit("result", {
            answer: result.answer,
            summary: result.summary,
            sources: result.sources,
            followUps: result.followUps,
            fieldNoteId,
            progress,
          });
        } catch (error) {
          emit("error", {
            error: error instanceof Error ? error.message : "The character could not answer",
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
