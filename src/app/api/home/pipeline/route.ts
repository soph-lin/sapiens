import { NextResponse } from "next/server";
import { artist } from "@/lib/orchestrator/agent/artist";
import { curator } from "@/lib/orchestrator/agent/curator";
import { director } from "@/lib/orchestrator/agent/director";
import { researcher, researchFromSources } from "@/lib/orchestrator/agent/researcher";
import { writer } from "@/lib/orchestrator/agent/writer";
import {
  DEFAULT_STORY_LIMITS,
  ORCHESTRATOR_CONFIG,
  type StoryLimits,
} from "@/lib/orchestrator/config";
import { UsageCollector } from "@/lib/orchestrator/tools/telemetry";
import type {
  AgentProgressEvent,
  GeneratedAssetEvent,
} from "@/lib/orchestrator/types";
import type { CuratorIdea, CuratorInput } from "@/lib/orchestrator/agent/curator-shared";
import { parseCuratorInput } from "@/lib/orchestrator/agent/curator-shared";
import { normalizeFlourishConfig, sourcePolicyFromClassroom, type FlourishConfig } from "@/lib/orchestrator/agent/flourish";
import { getDemoUserFromRequest } from "@/lib/demo-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Story generation can spend several minutes in each model-backed stage.
// Use Vercel Pro's extended per-function duration so the full pipeline has
// enough headroom to finish without hitting the platform execution limit.
export const maxDuration = 1800;

type PipelineBody = {
  stage?: "curate" | "story";
  input?: CuratorInput;
  idea?: CuratorIdea;
  flourish?: unknown;
  furtherReading?: unknown;
};

function jsonResponseError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function validIdea(value: unknown): value is CuratorIdea {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const idea = value as Record<string, unknown>;
  return [
    "name",
    "historicalEvent",
    "era",
    "region",
    "whyItFits",
    "plotDirection",
    "sourceSearchTerms",
  ].every((key) => typeof idea[key] === "string" && Boolean((idea[key] as string).trim()));
}

function sse(event: string, data: unknown, encoder: TextEncoder) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function normalizeAssets(event: GeneratedAssetEvent) {
  return {
    type: event.type,
    name: event.name,
    assetId: event.assetId,
    imageDataUrls: event.imageDataUrls,
    frames: event.frames,
    metadata: event.metadata,
    ageRange: event.ageRange,
  };
}

export async function POST(request: Request) {
  let body: PipelineBody;
  let flourish: FlourishConfig;
  try {
    body = (await request.json()) as PipelineBody;
    flourish = normalizeFlourishConfig(body.flourish ?? (body.furtherReading === undefined ? undefined : { furtherReading: body.furtherReading }));
    // Classroom source policy is authoritative for every signed-in classroom user.
    // Prefer DB domains; if the classroom row is empty, keep any domains the client already sent.
    const user = await getDemoUserFromRequest(request);
    if (user) {
      const classroom = await prisma.classroom.findFirst({
        where:
          user.role === "teacher"
            ? { teacherId: user.id }
            : { memberships: { some: { userId: user.id } } },
        select: { sourceMode: true, approvedDomains: true },
      });
      if (classroom) {
        const fromClassroom = sourcePolicyFromClassroom(classroom);
        flourish = normalizeFlourishConfig({
          ...flourish,
          approvedDomains:
            fromClassroom.approvedDomains.length > 0
              ? fromClassroom.approvedDomains
              : flourish.approvedDomains,
        });
      }
    }
    if (body.stage !== "curate" && body.stage !== "story") {
      return jsonResponseError("stage must be curate or story");
    }
    if (
      body.stage === "curate" &&
      (typeof body.input !== "string" || !body.input.trim())
    ) {
      return jsonResponseError("Curator text input is required");
    }
    if (body.stage === "curate") {
      const parsedInput = parseCuratorInput(body.input);
      body.input = parsedInput;
    }
    if (body.stage === "story" && !validIdea(body.idea)) {
      return jsonResponseError("A complete Curator idea is required");
    }
  } catch (error) {
    return jsonResponseError(error instanceof Error ? error.message : "Invalid request");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const progress: AgentProgressEvent[] = [];
      const usage = new UsageCollector();
      const assets: GeneratedAssetEvent[] = [];
      const emit = (event: string, data: unknown) => {
        // A browser can leave the page while an agent is still running. In
        // that case enqueue/close may throw; do not mask the original agent
        // error with a second stream-controller error.
        try {
          controller.enqueue(sse(event, data, encoder));
          return true;
        } catch {
          return false;
        }
      };
      const emitProgress = (event: AgentProgressEvent) => {
        progress.push(event);
        emit("progress", event);
      };

      void (async () => {
        try {
          if (body.stage === "curate") {
            emitProgress({ agent: "curator", phase: "agent", message: "Starting agent…" });
            emitProgress({ agent: "curator", phase: "agent", message: "Curator is finding historical possibilities…" });
            const output = await curator(body.input!, {
              usage,
              progress,
              onProgress: (event) => emit("progress", event),
              signal: request.signal,
              maxTries: ORCHESTRATOR_CONFIG.maxTries,
              maxOutputTokens: ORCHESTRATOR_CONFIG.maxOutputTokens,
            });
            emit("result", { stage: "curate", output, usage: usage.report() });
            emitProgress({ agent: "curator", phase: "agent", message: "Agent completed." });
            return;
          }

          const idea = body.idea!;
          const storySteering = [
            idea.plotDirection,
            typeof idea.lessonPlan === "string" && idea.lessonPlan.trim()
              ? `Lesson plan / learning focus: ${idea.lessonPlan.trim()}`
              : "",
          ].filter(Boolean).join("\n");
          const options = {
            usage,
            progress,
            onProgress: (event: AgentProgressEvent) => emitProgress(event),
            onAsset: (event: GeneratedAssetEvent) => {
              assets.push(event);
              emit("asset", normalizeAssets(event));
            },
            limits: DEFAULT_STORY_LIMITS as StoryLimits,
            directorSteering: storySteering,
            signal: request.signal,
            maxTries: ORCHESTRATOR_CONFIG.maxTries,
            maxOutputTokens: ORCHESTRATOR_CONFIG.maxOutputTokens,
            flourish,
          };

          emitProgress({ agent: "researcher", phase: "agent", message: "Starting agent…" });
          const providedSourceUrls = Array.isArray(idea.sourceUrls)
            ? idea.sourceUrls.filter((url): url is string => typeof url === "string" && Boolean(url.trim()))
            : [];
          const researcherOutput = providedSourceUrls.length
            ? await researchFromSources(providedSourceUrls, idea.historicalEvent, options)
            : await researcher(
                {
                  historicalEvent: idea.historicalEvent,
                  sourceSearchTerms: idea.sourceSearchTerms,
                  plotDirection: storySteering,
                },
                options,
              );
          emitProgress({ agent: "researcher", phase: "agent", message: "Agent completed." });
          emitProgress({ agent: "director", phase: "agent", message: "Starting agent…" });
          const directorOutput = await director(researcherOutput, options);
          emitProgress({ agent: "director", phase: "agent", message: "Agent completed." });
          emitProgress({ agent: "writer", phase: "agent", message: "Starting agent…" });
          const writerOutput = await writer(directorOutput, options);
          emitProgress({ agent: "writer", phase: "agent", message: "Agent completed." });
          if (!writerOutput.need_assets) throw new Error("Writer did not return asset needs");
          emitProgress({ agent: "artist", phase: "agent", message: "Starting agent…" });
          const artistOutput = await artist(writerOutput.need_assets, options);
          emitProgress({ agent: "artist", phase: "agent", message: "Agent completed." });
          emit("result", {
            stage: "story",
            outputs: {
              researcher: researcherOutput,
              director: directorOutput,
              writer: writerOutput,
              artist: artistOutput,
            },
            assets: assets.map(normalizeAssets),
            progress,
            usage: usage.report(),
          });
        } catch (error) {
          emit("error", {
            agent: body.stage === "curate" ? "curator" : "system",
            message: error instanceof Error ? error.message : "Pipeline failed",
            progress,
            usage: usage.report(),
          });
        } finally {
          try {
            controller.close();
          } catch {
            // The client may have disconnected while the model was running.
          }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
