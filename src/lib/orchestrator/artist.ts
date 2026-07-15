import { AGENT_CONFIG } from "./config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt, pixelLabTools } from "./agents";

export type ArtistAssetType = "character" | "collectible";

export type ArtistAssetBrief = {
  name: string;
  desc: string;
};

export type ArtistPlan = {
  characters: ArtistAssetBrief[];
  collectible: ArtistAssetBrief;
};

export type ArtistOutput = {
  assets: Array<{
    type: ArtistAssetType;
    name: string;
    asset: Record<string, unknown>;
  }>;
};

type ArtistAssetOutput = {
  asset: Record<string, unknown>;
};

function storedAssetDataUrl(asset: { mimeType: string; data: Uint8Array }): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString("base64")}`;
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
  brief: ArtistAssetBrief,
  options: AgentExecutionOptions,
): Promise<Record<string, unknown>> {
  const result = await withAgentRetries(context, "artist", async ({ previousError }) => {
    const generatedImages: string[] = [];
    context.emitProgress({
      agent: "artist",
      phase: "agent",
      message: `Generating ${type} artwork for ${brief.name}…`,
    });
    const generation = await context.modelClient("artist").generateJson<ArtistAssetOutput>({
      agent: "artist",
      model: AGENT_CONFIG.artist.model,
      instructions: appendRetryContext(
        await loadAgentPrompt("artist"),
        previousError,
      ),
      prompt: JSON.stringify({ type, description: `${brief.name}: ${brief.desc}` }),
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

    return { output: generation.output, imageDataUrls: generatedImages };
  });

  options.onAsset?.({
    type,
    name: brief.name,
    imageDataUrls: result.imageDataUrls,
  });
  return result.output.asset;
}

export async function artist(
  plan: ArtistPlan,
  options: AgentExecutionOptions = {},
): Promise<ArtistOutput> {
  const context = createAgentContext(options);
  const assets: ArtistOutput["assets"] = [];

  const existing = await context.characterAssetStore.findByNames(
    plan.characters.map((character) => character.name),
  );
  const existingByName = new Map<string, (typeof existing)[number]>();
  for (const asset of existing) {
    if (!existingByName.has(asset.name)) existingByName.set(asset.name, asset);
  }

  for (const character of plan.characters) {
    const stored = existingByName.get(character.name);
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

  return { assets };
}
