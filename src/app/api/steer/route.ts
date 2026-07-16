import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { artist, type ArtistPlan } from "@/lib/orchestrator/artist";
import { director } from "@/lib/orchestrator/director";
import { researcher } from "@/lib/orchestrator/researcher";
import { writer } from "@/lib/orchestrator/writer";
import { UsageCollector } from "@/lib/orchestrator/telemetry";
import {
  DEFAULT_STORY_LIMITS,
  ORCHESTRATOR_CONFIG,
  type StoryLimits,
} from "@/lib/orchestrator/config";
import type {
  AgentName,
  AgentProgressEvent,
  GeneratedAssetEvent,
} from "@/lib/orchestrator/types";

export const runtime = "nodejs";

function objectInput(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be JSON object text`);
  }
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function objectWithKeys(
  value: unknown,
  label: string,
  keys: string[],
): Record<string, unknown> {
  const object = objectInput(value, label);
  const missing = keys.filter((key) => !(key in object));
  if (missing.length) throw new Error(`${label} is missing: ${missing.join(", ")}`);
  return object;
}

function artistPlanInput(value: unknown): ArtistPlan {
  const object = objectWithKeys(value, "director input", ["characters", "collectible"]);
  if (!Array.isArray(object.characters)) {
    throw new Error("artist input.characters must be an array");
  }
  const characters = object.characters.map((character, index) => {
    if (!character || typeof character !== "object" || Array.isArray(character)) {
      throw new Error(`director input.characters[${index}] must be an object`);
    }
    const value = character as Record<string, unknown>;
    if (typeof value.name !== "string" || typeof value.desc !== "string") {
      throw new Error(`director input.characters[${index}] requires name and desc`);
    }
    return { name: value.name, desc: value.desc };
  });
  if (!object.collectible || typeof object.collectible !== "object" || Array.isArray(object.collectible)) {
    throw new Error("director input.collectible must be an object");
  }
  const collectible = object.collectible as Record<string, unknown>;
  if (typeof collectible.name !== "string" || typeof collectible.desc !== "string") {
    throw new Error("director input.collectible requires name and desc");
  }
  const starCharacter = object.starCharacter;
  if (starCharacter !== undefined && starCharacter !== null) {
    if (typeof starCharacter !== "object" || Array.isArray(starCharacter)) {
      throw new Error("artist input.starCharacter must be an object or null");
    }
    const star = starCharacter as Record<string, unknown>;
    if (typeof star.name !== "string" || typeof star.desc !== "string") {
      throw new Error("artist input.starCharacter requires name and desc");
    }
  }
  return {
    characters,
    starCharacter:
      starCharacter && typeof starCharacter === "object"
        ? {
            name: (starCharacter as Record<string, unknown>).name as string,
            desc: (starCharacter as Record<string, unknown>).desc as string,
          }
        : null,
    collectible: { name: collectible.name, desc: collectible.desc },
  };
}

function sse(event: string, data: unknown, encoder: TextEncoder) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

type SteerBody = {
  agent?: AgentName;
  input?: string;
  limits?: StoryLimits & { maxTries?: number; maxOutputTokens?: number };
  synopsis?: string;
};

function parseDirectorLimits(value: unknown): {
  limits: StoryLimits;
  maxTries: number;
  maxOutputTokens: number;
} {
  if (value === undefined) {
    return {
      limits: DEFAULT_STORY_LIMITS,
      maxTries: ORCHESTRATOR_CONFIG.maxTries,
      maxOutputTokens: ORCHESTRATOR_CONFIG.maxOutputTokens,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("director limits must be an object");
  }
  const limits = value as Record<string, unknown>;
  for (const key of ["maxTurns", "maxCharacters"]) {
    const number = limits[key];
    if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > 100) {
      throw new Error(`director ${key} must be an integer from 1 to 100`);
    }
  }
  const maxTries = limits.maxTries ?? ORCHESTRATOR_CONFIG.maxTries;
  if (typeof maxTries !== "number" || !Number.isInteger(maxTries) || maxTries < 1 || maxTries > 10) {
    throw new Error("maxTries must be an integer from 1 to 10");
  }
  const maxOutputTokens = limits.maxOutputTokens ?? ORCHESTRATOR_CONFIG.maxOutputTokens;
  if (
    typeof maxOutputTokens !== "number" ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > 128_000
  ) {
    throw new Error("maxOutputTokens must be an integer from 1 to 128000");
  }
  return {
    limits: {
      maxTurns: limits.maxTurns as number,
      maxCharacters: limits.maxCharacters as number,
    },
    maxTries,
    maxOutputTokens,
  };
}

function validateBody(body: SteerBody) {
  if (!body.agent || !["researcher", "director", "writer", "artist"].includes(body.agent)) {
    throw new Error("agent must be researcher, director, writer, or artist");
  }
  if (body.synopsis !== undefined && typeof body.synopsis !== "string") {
    throw new Error("synopsis must be text");
  }
  if (body.agent === "researcher") {
    if (typeof body.input !== "string") throw new Error("historical event is required");
  } else if (body.agent === "director") {
    objectWithKeys(body.input, "researcher input", ["topic", "articleUrl"]);
  } else if (body.agent === "writer") {
    objectWithKeys(body.input, "director input", [
      "synopsis",
      "characters",
      "endings",
      "collectible",
      "scenes",
    ]);
  } else if (body.agent === "artist") {
    artistPlanInput(body.input);
  }
}

export async function POST(request: Request) {
  let body: SteerBody;
  let directorLimits: StoryLimits = DEFAULT_STORY_LIMITS;
  let maxTries = ORCHESTRATOR_CONFIG.maxTries;
  let maxOutputTokens = ORCHESTRATOR_CONFIG.maxOutputTokens;
  try {
    body = (await request.json()) as SteerBody;
    const parsedLimits = parseDirectorLimits(body.limits);
    directorLimits = parsedLimits.limits;
    maxTries = parsedLimits.maxTries;
    maxOutputTokens = parsedLimits.maxOutputTokens;
    validateBody(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid steer request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const usage = new UsageCollector();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(sse(event, data, encoder));
      };

      try {
        emit("progress", {
          agent: body.agent,
          phase: "agent",
          message: "Starting agent…",
        });
        const options = {
          usage,
          limits: directorLimits,
          maxTries,
          maxOutputTokens,
          signal: request.signal,
          directorSteering: body.synopsis,
          onProgress: (event: AgentProgressEvent) => emit("progress", event),
          onAsset: (event: GeneratedAssetEvent) => emit("asset", event),
          characterAssetStore: {
            findByNames: async (names: string[]) => {
              const characters = await prisma.character.findMany({
                where: { name: { in: names } },
                include: { asset: true },
                orderBy: { id: "asc" },
              });
              return characters.map(({ asset }) => asset);
            },
            findSpriteByNames: async (names: string[]) => {
              const characters = await prisma.character.findMany({
                where: { name: { in: names }, spriteAssetId: { not: null } },
                include: { spriteAsset: true },
                orderBy: { id: "asc" },
              });
              return characters.flatMap(({ spriteAsset }) =>
                spriteAsset ? [spriteAsset] : [],
              );
            },
          },
        };
        let output: unknown;

        if (body.agent === "researcher") {
          output = await researcher(body.input as string, options);
        } else if (body.agent === "director") {
          output = await director(
            objectWithKeys(body.input, "researcher input", ["topic", "articleUrl"]),
            options,
          );
        } else if (body.agent === "writer") {
          output = await writer(
            objectWithKeys(body.input, "director input", [
              "synopsis",
              "characters",
              "endings",
              "collectible",
              "scenes",
            ]),
            options,
          );
        } else if (body.agent === "artist") {
          output = await artist(artistPlanInput(body.input), options);
        }

        emit("result", {
          agent: body.agent,
          output,
          usage: usage.report(),
        });
        emit("progress", {
          agent: body.agent,
          phase: "agent",
          message: "Agent completed.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Steer request failed";
        emit("error", { agent: body.agent, message, usage: usage.report() });
      } finally {
        controller.close();
      }
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
