import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateStoryPayload } from "@/lib/dialogue";
import type { Prisma } from "@/generated/prisma/client";
import { AGENT_CONFIG, ORCHESTRATOR_CONFIG } from "@/lib/orchestrator/config";

export const runtime = "nodejs";

type AssetInput = {
  type: "character" | "collectible";
  name: string;
  dataUrl: string;
  assetId?: string;
};

type FinalizeBody = {
  runSlug?: string;
  topic?: string;
  storyJson?: unknown;
  director?: {
    characters?: Array<{ name?: string; desc?: string }>;
    collectible?: { name?: string; desc?: string };
  };
  assets?: AssetInput[];
  progress?: unknown[];
  usage?: unknown;
  steering?: { historicalEvent?: unknown; synopsisDirection?: unknown };
  storyConfig?: unknown;
  outputs?: {
    researcher?: unknown;
    director?: unknown;
    writer?: unknown;
    artist?: unknown;
  };
};

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function decodeDataUrl(dataUrl: string): { mimeType: string; data: Uint8Array<ArrayBuffer> } {
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) throw new Error("assets must use base64 data URLs");
  const data = Buffer.from(match[2], "base64");
  if (!data.length) throw new Error("asset data cannot be empty");
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  return { mimeType: match[1], data: bytes };
}

function assetFor(assets: AssetInput[], type: AssetInput["type"], name: string): AssetInput {
  const asset = assets.find((candidate) => candidate.type === type && candidate.name === name);
  if (!asset) throw new Error(`Missing ${type} asset for ${name}`);
  return asset;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FinalizeBody;
    const topic = requiredString(body.topic, "topic");
    if (body.storyJson === undefined || body.storyJson === null) throw new Error("storyJson is required");
    const storyJson = validateStoryPayload(body.storyJson);
    const characters = body.director?.characters ?? [];
    const collectible = body.director?.collectible;
    const collectibleName = requiredString(collectible?.name, "director.collectible.name");
    const collectibleDescription = requiredString(collectible?.desc, "director.collectible.desc");
    const assets = body.assets ?? [];
    const characterInputs = characters.map((character) => ({
      name: requiredString(character.name, "character.name"),
      description: requiredString(character.desc, "character.desc"),
    }));

    const progress = Array.isArray(body.progress) ? body.progress : [];
    const steering = body.steering && typeof body.steering === "object"
      ? body.steering as Prisma.InputJsonValue
      : undefined;
    const outputs = body.outputs ?? {};
    const modelConfig = {
      agents: Object.fromEntries(
        Object.entries(AGENT_CONFIG).map(([agent, config]) => [agent, config]),
      ),
      maxOutputTokens: ORCHESTRATOR_CONFIG.maxOutputTokens,
      maxToolRounds: ORCHESTRATOR_CONFIG.maxToolRounds,
      maxTries: ORCHESTRATOR_CONFIG.maxTries,
    };
    const savedEvent = {
      agent: "system",
      phase: "save",
      message: "Story saved to the database.",
    };
    const story = await prisma.$transaction(async (tx) => {
      const characterRecords = characterInputs.map((character) => {
        const input = assetFor(assets, "character", character.name);
        const decoded = input.assetId ? null : decodeDataUrl(input.dataUrl);
        return { character, input, decoded };
      });
      const collectibleInput = assetFor(assets, "collectible", collectibleName);
      const collectibleDecoded = decodeDataUrl(collectibleInput.dataUrl);
      const slug = randomUUID().replaceAll("-", "");

      if (body.runSlug) {
        await tx.storyGenRun.update({
          where: { slug: body.runSlug },
          data: {
            status: "succeed",
            progress: [...progress, savedEvent] as Prisma.InputJsonValue,
            usage: body.usage === undefined ? undefined : body.usage as Prisma.InputJsonValue,
            steering,
            storyConfig: body.storyConfig === undefined ? undefined : body.storyConfig as Prisma.InputJsonValue,
            researcherOutput: outputs.researcher === undefined ? undefined : outputs.researcher as Prisma.InputJsonValue,
            directorOutput: outputs.director === undefined ? undefined : outputs.director as Prisma.InputJsonValue,
            writerOutput: outputs.writer === undefined ? undefined : outputs.writer as Prisma.InputJsonValue,
            artistOutput: outputs.artist === undefined ? undefined : outputs.artist as Prisma.InputJsonValue,
            error: null,
            finishedAt: new Date(),
          },
        });
      }

      return tx.story.create({
        data: {
          slug,
          topic,
          storyJson: storyJson as Prisma.InputJsonValue,
          characters: {
            create: characterRecords.map(({ character, input, decoded }) => ({
              name: character.name,
              description: character.description,
              known: Boolean(input.assetId),
              asset: input.assetId
                ? { connect: { id: input.assetId } }
                : { create: { type: "CHARACTER", name: character.name, mimeType: decoded!.mimeType, data: decoded!.data } },
            })),
          },
          collectible: {
            create: {
              name: collectibleName,
              description: collectibleDescription,
              asset: { create: { type: "COLLECTIBLE", name: collectibleName, mimeType: collectibleDecoded.mimeType, data: collectibleDecoded.data } },
            },
          },
            genRun: body.runSlug
            ? { connect: { slug: body.runSlug } }
            : { create: {
              slug: randomUUID().replaceAll("-", ""),
              status: "succeed",
              progress: [...progress, savedEvent] as Prisma.InputJsonValue,
              usage: body.usage === undefined ? undefined : body.usage as Prisma.InputJsonValue,
              steering,
              modelConfig: modelConfig as Prisma.InputJsonValue,
              storyConfig: body.storyConfig === undefined ? undefined : body.storyConfig as Prisma.InputJsonValue,
              researcherOutput: outputs.researcher === undefined ? undefined : outputs.researcher as Prisma.InputJsonValue,
              directorOutput: outputs.director === undefined ? undefined : outputs.director as Prisma.InputJsonValue,
              writerOutput: outputs.writer === undefined ? undefined : outputs.writer as Prisma.InputJsonValue,
              artistOutput: outputs.artist === undefined ? undefined : outputs.artist as Prisma.InputJsonValue,
              finishedAt: new Date(),
            } },
        },
        select: { id: true, slug: true, genRun: { select: { slug: true } } },
      });
    });

    return NextResponse.json({ ...story, genRunSlug: story.genRun?.slug, savedEvent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not finalize story";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
