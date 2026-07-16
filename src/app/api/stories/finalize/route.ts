import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateStoryPayload } from "@/lib/dialogue";
import type { Prisma } from "@/generated/prisma/client";
import { AGENT_CONFIG, ORCHESTRATOR_CONFIG } from "@/lib/orchestrator/config";

export const runtime = "nodejs";

type AssetInput = {
  type: "character" | "character_sprite" | "collectible";
  name: string;
  frameKey?: string;
  dataUrl?: string;
  assetId?: string;
  metadata?: unknown;
};

type FinalizeBody = {
  runSlug?: string;
  storyJson?: unknown;
  synopsis?: unknown;
  director?: {
    characters?: Array<{ name?: string; desc?: string }>;
    starCharacter?: { name?: string; desc?: string } | null;
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

function outputObject(value: unknown, label: string): Record<string, unknown> {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      throw new Error(`${label} must be a JSON object`);
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return candidate as Record<string, unknown>;
}

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

function findAsset(
  assets: AssetInput[],
  type: AssetInput["type"],
  name: string,
  frameKey?: string,
) {
  return assets.find((candidate) =>
    candidate.type === type &&
    candidate.name === name &&
    (frameKey === undefined ? candidate.frameKey === undefined : candidate.frameKey === frameKey),
  );
}

function assetFor(
  assets: AssetInput[],
  type: AssetInput["type"],
  name: string,
  frameKey?: string,
): AssetInput {
  const asset = findAsset(assets, type, name, frameKey);
  if (!asset) throw new Error(`Missing ${type} asset for ${name}`);
  return asset;
}

function assetType(type: AssetInput["type"]): "CHARACTER" | "CHARACTER_SPRITE" | "COLLECTIBLE" {
  if (type === "character_sprite") return "CHARACTER_SPRITE";
  if (type === "collectible") return "COLLECTIBLE";
  return "CHARACTER";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FinalizeBody;
    const researcherOutput = outputObject(body.outputs?.researcher, "outputs.researcher");
    const topic = requiredString(researcherOutput.topic, "outputs.researcher.topic");
    const synopsis = body.synopsis;
    if (!synopsis || typeof synopsis !== "object" || Array.isArray(synopsis)) {
      throw new Error("synopsis must be a JSON object");
    }
    for (const field of ["premise", "eventSpine", "playerGoal", "learningFocus"]) {
      requiredString((synopsis as Record<string, unknown>)[field], `synopsis.${field}`);
    }
    if (body.storyJson === undefined || body.storyJson === null) throw new Error("storyJson is required");
    const storyJson = validateStoryPayload(body.storyJson);
    const characters = body.director?.characters ?? [];
    const starCharacter = body.director?.starCharacter ?? null;
    const collectible = body.director?.collectible;
    const collectibleName = requiredString(collectible?.name, "director.collectible.name");
    const collectibleDescription = requiredString(collectible?.desc, "director.collectible.desc");
    const assets = body.assets ?? [];
    const characterInputs = characters.map((character) => ({
      name: requiredString(character.name, "character.name"),
      description: requiredString(character.desc, "character.desc"),
    }));
    if (starCharacter) {
      const starName = requiredString(starCharacter.name, "director.starCharacter.name");
      if (!characterInputs.some((character) => character.name.toLocaleLowerCase() === starName.toLocaleLowerCase())) {
        throw new Error("director.starCharacter must match a director character");
      }
    }

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
        const decoded = input.assetId
          ? null
          : decodeDataUrl(requiredString(input.dataUrl, `character asset dataUrl for ${character.name}`));
        const isStar = starCharacter?.name?.toLocaleLowerCase() === character.name.toLocaleLowerCase();
        const spriteInputs = isStar
          ? assets.filter((candidate) => candidate.type === "character_sprite" && candidate.name === character.name)
          : [];
        const spriteInput = isStar
          ? spriteInputs.find((candidate) => candidate.frameKey === "south") ??
            spriteInputs.find((candidate) => candidate.frameKey === undefined)
          : undefined;
        if (isStar && !spriteInput) {
          throw new Error(`Missing character_sprite asset for ${character.name}`);
        }
        const spriteDecoded = spriteInput?.assetId
          ? null
          : spriteInput?.dataUrl
            ? decodeDataUrl(spriteInput.dataUrl)
            : null;
        const spriteFrames = spriteInputs
          .filter((candidate) => candidate.frameKey)
          .map((candidate) => ({
            frameKey: candidate.frameKey!,
            decoded: decodeDataUrl(requiredString(candidate.dataUrl, `sprite frame dataUrl for ${character.name}`)),
            metadata: candidate.metadata,
          }));
        return { character, input, decoded, spriteInput, spriteDecoded, spriteFrames };
      });
      const collectibleInput = assetFor(assets, "collectible", collectibleName);
      const collectibleDecoded = decodeDataUrl(requiredString(collectibleInput.dataUrl, "collectible asset dataUrl"));
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
          synopsis: synopsis as Prisma.InputJsonValue,
          storyJson: storyJson as Prisma.InputJsonValue,
          characters: {
            create: characterRecords.map(({ character, input, decoded, spriteInput, spriteDecoded, spriteFrames }) => ({
              name: character.name,
              description: character.description,
              known: Boolean(input.assetId),
              asset: input.assetId
                ? { connect: { id: input.assetId } }
                : { create: { type: assetType(input.type), name: character.name, mimeType: decoded!.mimeType, data: decoded!.data, metadata: input.metadata as Prisma.InputJsonValue | undefined } },
              ...(spriteInput
                ? {
                    spriteAsset: spriteInput.assetId
                      ? { connect: { id: spriteInput.assetId } }
                      : {
                          create: {
                            type: assetType(spriteInput.type),
                            name: character.name,
                            mimeType: spriteDecoded!.mimeType,
                            data: spriteDecoded!.data,
                            metadata: spriteInput.metadata as Prisma.InputJsonValue | undefined,
                            frames: spriteFrames.length
                              ? {
                                  create: spriteFrames.map((frame) => ({
                                    frameKey: frame.frameKey,
                                    mimeType: frame.decoded.mimeType,
                                    data: frame.decoded.data,
                                    metadata: frame.metadata as Prisma.InputJsonValue | undefined,
                                  })),
                                }
                              : undefined,
                          },
                        },
                  }
                : {}),
            })),
          },
          collectible: {
            create: {
              name: collectibleName,
              description: collectibleDescription,
              asset: { create: { type: assetType(collectibleInput.type), name: collectibleName, mimeType: collectibleDecoded.mimeType, data: collectibleDecoded.data, metadata: collectibleInput.metadata as Prisma.InputJsonValue | undefined } },
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
