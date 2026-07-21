import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateStoryPayload } from "@/lib/dialogue";
import type { Prisma } from "@/generated/prisma/client";
import { AGENT_CONFIG, ORCHESTRATOR_CONFIG } from "@/lib/orchestrator/config";
import { ageRangeToDb, isAgeRange, type AgeRange } from "@/lib/orchestrator/agent/portrait-age";
import { normalizeFlourishConfig, validateFurtherReading, validateGroundingSources, validateReportText, type StoryReport } from "@/lib/orchestrator/agent/flourish";
import { isConcreteHistoricalPeriod } from "@/lib/orchestrator/agent/curator-shared";
import { requireDemoUser } from "@/lib/learning/api";
import { artist, type ArtistPlan } from "@/lib/orchestrator/agent/artist";

export const runtime = "nodejs";

type AssetInput = {
  type: "character" | "character_sprite" | "collectible";
  name: string;
  frameKey?: string;
  dataUrl?: string;
  assetId?: string;
  metadata?: unknown;
  ageRange?: string;
};

type FinalizeBody = {
  runSlug?: string;
  storyJson?: unknown;
  synopsis?: unknown;
  period?: unknown;
  director?: {
    characters?: Array<{ name?: string; desc?: string; ageRange?: string }>;
    starCharacter?: { name?: string; desc?: string; ageRange?: string } | null;
    collectible?: { name?: string; desc?: string };
  };
  assets?: AssetInput[];
  progress?: unknown[];
  usage?: unknown;
  steering?: unknown;
  storyConfig?: unknown;
  report?: unknown;
  outputs?: {
    researcher?: unknown;
    curator?: unknown;
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

function steeringValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("steering must be non-empty text");
  }
  return value.trim();
}

function storyReport(value: unknown, config: ReturnType<typeof normalizeFlourishConfig>): StoryReport | undefined {
  if (value === undefined || value === null) return undefined;
  const report = outputObject(value, "writer.report");
  const reportText = validateReportText(report.reportText);
  const sources = validateGroundingSources(report.sources, config, "writer.report.sources");
  return {
    reportText,
    sources,
    furtherReading: validateFurtherReading(report.furtherReading, config, sources.map((source) => source.url)),
  };
}

function resolveStoryPeriod(body: FinalizeBody): string | undefined {
  const candidates: unknown[] = [body.period];
  const curator = body.outputs?.curator;
  if (curator && typeof curator === "object" && !Array.isArray(curator)) {
    const idea = (curator as { idea?: unknown }).idea;
    if (idea && typeof idea === "object" && !Array.isArray(idea)) {
      candidates.push((idea as { era?: unknown }).era);
      const voyage = (curator as { voyage?: unknown }).voyage;
      if (voyage && typeof voyage === "object" && !Array.isArray(voyage)) {
        candidates.push((voyage as { period?: unknown }).period);
      }
    }
  }
  for (const candidate of candidates) {
    if (typeof candidate === "string" && isConcreteHistoricalPeriod(candidate)) {
      return candidate.trim();
    }
  }
  return undefined;
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
  ageRange?: string,
) {
  return assets.find((candidate) =>
    candidate.type === type &&
    candidate.name === name &&
    (ageRange === undefined || candidate.ageRange === ageRange) &&
    (frameKey === undefined ? candidate.frameKey === undefined : candidate.frameKey === frameKey),
  );
}

function assetFor(
  assets: AssetInput[],
  type: AssetInput["type"],
  name: string,
  frameKey?: string,
  ageRange?: string,
): AssetInput {
  const asset = findAsset(assets, type, name, frameKey, ageRange);
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
    const dialogue = validateStoryPayload(body.storyJson);
    const period = resolveStoryPeriod(body);
    const storyJson = (
      period
        ? { ...(dialogue as unknown as Record<string, unknown>), period }
        : dialogue
    ) as Prisma.InputJsonValue;
    const characters = body.director?.characters ?? [];
    const starCharacter = body.director?.starCharacter ?? null;
    const collectible = body.director?.collectible;
    const collectibleName = requiredString(collectible?.name, "director.collectible.name");
    const collectibleDescription = requiredString(collectible?.desc, "director.collectible.desc");
    let assets = body.assets ?? [];
    const characterInputs = characters.map((character) => {
      const ageRange = requiredString(character.ageRange, `character.ageRange for ${character.name ?? "unknown character"}`);
      if (!isAgeRange(ageRange)) {
        throw new Error(`character.ageRange must be one of the supported age ranges`);
      }
      return {
        name: requiredString(character.name, "character.name"),
        description: requiredString(character.desc, "character.desc"),
        ageRange: ageRange as AgeRange,
      };
    });
    if (starCharacter) {
      const starName = requiredString(starCharacter.name, "director.starCharacter.name");
      if (!characterInputs.some((character) => character.name.toLocaleLowerCase() === starName.toLocaleLowerCase())) {
        throw new Error("director.starCharacter must match a director character");
      }
    }

    const missingCharacters = characterInputs.filter(
      (character) => !findAsset(assets, "character", character.name, undefined, character.ageRange),
    );
    const missingSprite = starCharacter
      ? !assets.some(
          (candidate) =>
            candidate.type === "character_sprite" &&
            candidate.name === starCharacter.name &&
            (candidate.frameKey === "south" || candidate.frameKey === undefined),
        )
      : false;
    let artistOutput = body.outputs?.artist;
    if (missingCharacters.length || missingSprite) {
      const starBrief = starCharacter
        ? {
            name: requiredString(starCharacter.name, "director.starCharacter.name"),
            desc: requiredString(starCharacter.desc, "director.starCharacter.desc"),
            ageRange: characterInputs.find(
              (character) => character.name.toLocaleLowerCase() === starCharacter.name?.toLocaleLowerCase(),
            )!.ageRange,
          }
        : null;
      const repairEvents: AssetInput[] = [];
      const repairPlan: ArtistPlan = {
        characters: missingCharacters.map(({ name, description, ageRange }) => ({
          name,
          desc: description,
          ageRange,
        })),
        starCharacter: missingSprite ? starBrief : null,
        collectible: { name: collectibleName, desc: collectibleDescription },
      };
      const repairOutput = await artist(
        repairPlan,
        {
          onAsset: (event) => {
            if (event.frames?.length) {
              repairEvents.push(
                ...event.frames.map((frame) => ({
                  type: event.type,
                  name: event.name,
                  frameKey: frame.frameKey,
                  dataUrl: frame.dataUrl,
                  assetId: event.assetId,
                  metadata: event.metadata,
                  ageRange: event.ageRange,
                })),
              );
              return;
            }
            repairEvents.push({
              type: event.type,
              name: event.name,
              assetId: event.assetId,
              dataUrl: event.imageDataUrls[0],
              metadata: event.metadata,
              ageRange: event.ageRange,
            });
          },
        },
        { skipCollectible: true },
      );
      assets = [...assets, ...repairEvents];
      artistOutput = repairOutput;
    }

    const progress = Array.isArray(body.progress) ? body.progress : [];
    const steering = steeringValue(body.steering);
    const outputs = body.outputs ?? {};
    const flourish = normalizeFlourishConfig(body.storyConfig);
    const writerOutput = body.outputs?.writer === undefined ? undefined : outputObject(body.outputs.writer, "outputs.writer");
    const report = storyReport(writerOutput?.report ?? body.report, flourish);
    let creator: Awaited<ReturnType<typeof requireDemoUser>> | null = null;
    try { creator = await requireDemoUser(request); } catch { /* Story generation can still be used outside the demo workspace. */ }
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
        const input = assetFor(assets, "character", character.name, undefined, character.ageRange);
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

      return tx.story.create({
        data: {
          slug,
          topic,
          createdById: creator?.id,
          status: creator?.role === "student" ? "published" : undefined,
          publishedAt: creator?.role === "student" ? new Date() : undefined,
          publishedById: creator?.role === "student" ? creator.id : undefined,
          synopsis: synopsis as Prisma.InputJsonValue,
          storyJson: storyJson as Prisma.InputJsonValue,
          report: report as Prisma.InputJsonValue | undefined,
          characters: {
            create: characterRecords.map(({ character, input, decoded, spriteInput, spriteDecoded, spriteFrames }) => ({
              name: character.name,
              description: character.description,
              ageRange: ageRangeToDb(character.ageRange),
              known: Boolean(input.assetId),
              asset: input.assetId
                ? { connect: { id: input.assetId } }
                : { create: { type: assetType(input.type), name: character.name, mimeType: decoded!.mimeType, data: decoded!.data, metadata: input.metadata as Prisma.InputJsonValue | undefined, ageRange: ageRangeToDb(character.ageRange) } },
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
                            ageRange: ageRangeToDb(character.ageRange),
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
              topic,
              modelConfig: modelConfig as Prisma.InputJsonValue,
              storyConfig: body.storyConfig === undefined ? undefined : body.storyConfig as Prisma.InputJsonValue,
              researcherOutput: outputs.researcher === undefined ? undefined : outputs.researcher as Prisma.InputJsonValue,
              curatorOutput: outputs.curator === undefined ? undefined : outputs.curator as Prisma.InputJsonValue,
              directorOutput: outputs.director === undefined ? undefined : outputs.director as Prisma.InputJsonValue,
              writerOutput: outputs.writer === undefined ? undefined : outputs.writer as Prisma.InputJsonValue,
              artistOutput: artistOutput === undefined ? undefined : artistOutput as Prisma.InputJsonValue,
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
