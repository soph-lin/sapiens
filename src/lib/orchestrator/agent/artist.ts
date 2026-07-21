import { AGENT_CONFIG } from "../config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt, pixelLabTools } from "./agents";
import type { GeneratedAssetFrame } from "../types";
import {
  normalizeCharacterName,
  ageRangeFromDb,
  type AgeRange,
} from "./portrait-age";

export type ArtistAssetType = "character" | "character_sprite" | "collectible";

export type ArtistAssetBrief = {
  name: string;
  desc: string;
};

export type ArtistCharacterBrief = ArtistAssetBrief & {
  ageRange: AgeRange;
};

export type ArtistPlan = {
  characters: ArtistCharacterBrief[];
  starCharacter: ArtistCharacterBrief | null;
  collectible: ArtistAssetBrief;
};

export type ArtistOutput = {
  assets: Array<{
    type: ArtistAssetType;
    name: string;
    asset: Record<string, unknown>;
  }>;
};

export type ArtistRunOptions = {
  skipCollectible?: boolean;
};

type ArtistAssetOutput = {
  asset: Record<string, unknown>;
};

function storedAssetDataUrl(asset: { mimeType: string; data: Uint8Array }): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString("base64")}`;
}

function storedAssetFrames(asset: {
  frames?: Array<{ frameKey: string; mimeType: string; data: Uint8Array }>;
}): GeneratedAssetFrame[] {
  return (asset.frames ?? []).map((frame) => ({
    frameKey: frame.frameKey,
    dataUrl: `data:${frame.mimeType};base64,${Buffer.from(frame.data).toString("base64")}`,
  }));
}

function imageDataUrls(value: unknown): string[] {
  const urls: string[] = [];
  const visit = (current: unknown) => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(current)) {
      if (key === "base64" && typeof nested === "string" && nested.length > 100) {
        urls.push(nested.startsWith("data:") ? nested : `data:image/png;base64,${nested}`);
      } else {
        visit(nested);
      }
    }
  };
  visit(value);
  return [...new Set(urls)];
}

async function generateAsset(
  context: ReturnType<typeof createAgentContext>,
  type: ArtistAssetType,
  brief: ArtistAssetBrief | ArtistCharacterBrief,
  options: AgentExecutionOptions,
): Promise<Record<string, unknown>> {
  const result = await withAgentRetries(context, "artist", async ({ previousError }) => {
    const generatedImages: string[] = [];
    const generatedFrames: GeneratedAssetFrame[] = [];
    let generatedMetadata: unknown;
    context.emitProgress({
      agent: "artist",
      phase: "agent",
      message:
        type === "character_sprite"
          ? `Generating sprite for ${brief.name}...`
          : `Generating ${type} artwork for ${brief.name}…`,
    });
    const generation = await context.modelClient("artist").generateJson<ArtistAssetOutput>({
      agent: "artist",
      model: AGENT_CONFIG.artist.model,
      instructions: appendRetryContext(
        await loadAgentPrompt("artist"),
        previousError,
      ),
      prompt: JSON.stringify({
        type,
        description:
          type === "character"
            ? `${brief.name}: ${brief.desc}\nPortrait age range: ${(brief as ArtistCharacterBrief).ageRange}. Draw this person at the requested age, not at a more famous later age.`
            : `${brief.name}: ${brief.desc}`,
      }),
      usage: context.usage,
      trace: context.emitTrace,
      progress: context.emitProgress,
      maxOutputTokens: context.maxOutputTokens,
      signal: context.signal,
      tools: pixelLabTools,
      handlers: {
        pixellab_create_portrait: async (raw) => {
          context.emitProgress({
            agent: "artist",
            phase: "tool",
            message: `Creating portrait asset for ${brief.name}…`,
            tool: "pixellab_create_portrait",
          });
          const result = await context.pixellab.createPortrait(JSON.parse(raw).description);
          generatedImages.push(...imageDataUrls(result));
          return result;
        },
        pixellab_create_character: async (raw) => {
          context.emitProgress({
            agent: "artist",
            phase: "tool",
            message: `Creating top-down sprite for ${brief.name}...`,
            tool: "pixellab_create_character",
          });
          const result = await context.pixellab.createCharacter(
            JSON.parse(raw).description,
            brief.name,
          );
          generatedFrames.push(...(result.frames ?? []));
          generatedImages.push(...(result.frames ?? []).map(({ dataUrl }) => dataUrl));
          generatedMetadata = result.metadata;
          return result;
        },
        pixellab_create_collectible: async (raw) => {
          context.emitProgress({
            agent: "artist",
            phase: "tool",
            message: `Creating collectible asset for ${brief.name}…`,
            tool: "pixellab_create_collectible",
          });
          const result = await context.pixellab.createCollectible(JSON.parse(raw).description);
          generatedImages.push(...imageDataUrls(result));
          return result;
        },
      },
      schema: {
        name: "artist_output",
        schema: {
          type: "object",
          properties: { asset: { type: "object" } },
          required: ["asset"],
          additionalProperties: false,
        },
      },
    });

    return {
      output: generation.output,
      imageDataUrls: generatedImages,
      frames: generatedFrames,
      metadata: generatedMetadata,
    };
  });

  context.emitProgress({
    agent: "artist",
    phase: "agent",
    message:
      type === "character_sprite"
        ? `Sprite successfully generated for ${brief.name}.`
        : `${type} artwork successfully generated for ${brief.name}.`,
  });
  options.onAsset?.({
    type,
    name: brief.name,
    imageDataUrls: result.imageDataUrls,
    frames: result.frames.length ? result.frames : undefined,
    metadata: result.metadata,
    ageRange:
      type === "character" || type === "character_sprite"
        ? (brief as ArtistCharacterBrief).ageRange
        : undefined,
  });
  return result.output.asset;
}

export async function artist(
  plan: ArtistPlan,
  options: AgentExecutionOptions = {},
  runOptions: ArtistRunOptions = {},
): Promise<ArtistOutput> {
  const context = createAgentContext(options);
  const assets: ArtistOutput["assets"] = [];

  const existing = plan.characters.length
    ? await context.characterAssetStore.findByNamesAndAgeRanges(
        plan.characters.map((character) => ({
          name: character.name,
          ageRange: character.ageRange,
        })),
      )
    : [];
  const existingByKey = new Map<string, (typeof existing)[number]>();
  for (const asset of existing) {
    const ageRange = ageRangeFromDb(asset.ageRange) ?? "adult";
    const key = `${normalizeCharacterName(asset.name)}|${ageRange}`;
    if (!existingByKey.has(key)) existingByKey.set(key, asset);
  }

  const existingSprites = plan.starCharacter
    ? await context.characterAssetStore.findSpriteByNames([plan.starCharacter.name])
    : [];
  const existingSpriteByName = new Map<string, (typeof existingSprites)[number]>();
  for (const asset of existingSprites) {
    if (!existingSpriteByName.has(asset.name)) existingSpriteByName.set(asset.name, asset);
  }

  for (const character of plan.characters) {
    const stored = existingByKey.get(
      `${normalizeCharacterName(character.name)}|${character.ageRange}`,
    );
    if (stored) {
      context.emitProgress({
        agent: "artist",
        phase: "agent",
        message: `Reusing existing character asset for ${character.name}.`,
      });
      options.onAsset?.({
        type: "character",
        name: character.name,
        assetId: stored.id,
        imageDataUrls: [storedAssetDataUrl(stored)],
        ageRange: character.ageRange,
      });
      assets.push({
        type: "character",
        name: character.name,
        asset: stored as unknown as Record<string, unknown>,
      });
      continue;
    }
    const asset = await generateAsset(context, "character", character, options);
    assets.push({ type: "character", name: character.name, asset });
  }

  if (plan.starCharacter) {
    const storedSprite = existingSpriteByName.get(plan.starCharacter.name);
    if (storedSprite) {
      const frames = storedAssetFrames(storedSprite);
      context.emitProgress({
        agent: "artist",
        phase: "agent",
        message: `Reusing existing sprite for ${plan.starCharacter.name}.`,
      });
      options.onAsset?.({
        type: "character_sprite",
        name: plan.starCharacter.name,
        assetId: storedSprite.id,
        imageDataUrls: frames.length ? frames.map(({ dataUrl }) => dataUrl) : [storedAssetDataUrl(storedSprite)],
        frames: frames.length ? frames : undefined,
        metadata: storedSprite.metadata,
        ageRange:
          ageRangeFromDb(storedSprite.ageRange) ?? plan.starCharacter.ageRange,
      });
      assets.push({
        type: "character_sprite",
        name: plan.starCharacter.name,
        asset: storedSprite as unknown as Record<string, unknown>,
      });
    } else {
      const sprite = await generateAsset(
        context,
        "character_sprite",
        plan.starCharacter,
        options,
      );
      assets.push({
        type: "character_sprite",
        name: plan.starCharacter.name,
        asset: sprite,
      });
    }
  }

  if (!runOptions.skipCollectible) {
    const collectible = await generateAsset(
      context,
      "collectible",
      plan.collectible,
      options,
    );
    assets.push({
      type: "collectible",
      name: plan.collectible.name,
      asset: collectible,
    });
  }

  return { assets };
}
