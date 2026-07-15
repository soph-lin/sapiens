import { validateStory, type Story } from "@/lib/dialogue";
import type { ArtistAssetBrief, ArtistPlan } from "./artist";
import { AGENT_CONFIG } from "./config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt } from "./agents";
import { writerOutputJsonSchema } from "@/lib/dialogue/json-schema";

export type WriterOutput = {
  dialogue: Story;
  embellish: unknown[];
  need_assets: ArtistPlan;
};

type WriterModelOutput = {
  dialogue: unknown;
  embellish: unknown[];
};

function assetBrief(value: unknown, label: string): ArtistAssetBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const brief = value as Record<string, unknown>;
  if (typeof brief.name !== "string" || !brief.name.trim()) {
    throw new Error(`${label}.name must be a non-empty string`);
  }
  if (typeof brief.desc !== "string" || !brief.desc.trim()) {
    throw new Error(`${label}.desc must be a non-empty string`);
  }
  return { name: brief.name.trim(), desc: brief.desc.trim() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function characterAppearsInStory(characterName: string, dialogue: Story): boolean {
  const needle = characterName.trim().toLocaleLowerCase();
  const storyText = Object.values(dialogue.nodes)
    .flatMap((node) => {
      if (node.type === "text") return [node.speaker, node.text];
      if (node.type === "choice") {
        return [node.prompt, ...node.choices.map((choice) => choice.label)];
      }
      if (node.type === "end") return [node.title, node.text];
      return [];
    })
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLocaleLowerCase();
  return storyText.includes(needle);
}

function deriveCharacterAssetNeeds(
  characters: unknown[],
  dialogue: Story,
): ArtistAssetBrief[] {
  return characters
    .map((character, index) => assetBrief(character, `Writer input.characters[${index}]`))
    .filter((character) => characterAppearsInStory(character.name, dialogue));
}

/** Convert Anthropic's fixed-shape provider transport back to the runtime story shape. */
function normalizeWriterDialogue(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return value;

  const nodes: Record<string, unknown> = {};
  for (const [index, node] of value.nodes.entries()) {
    if (!isRecord(node) || typeof node.id !== "string" || !node.id.trim()) {
      throw new Error(`Writer dialogue.nodes[${index}].id must be a non-empty string`);
    }
    if (node.id in nodes) {
      throw new Error(`Writer dialogue contains duplicate node id "${node.id}"`);
    }
    nodes[node.id] = node;
  }

  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const normalizedMetadata =
    metadata && Array.isArray(metadata.statDefaults)
      ? {
          ...metadata,
          statDefaults: Object.fromEntries(
            metadata.statDefaults.map((entry, index) => {
              if (!isRecord(entry) || typeof entry.key !== "string" || !entry.key.trim()) {
                throw new Error(
                  `Writer dialogue.metadata.statDefaults[${index}].key must be a non-empty string`,
                );
              }
              if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
                throw new Error(
                  `Writer dialogue.metadata.statDefaults[${index}].value must be a finite number`,
                );
              }
              return [entry.key, entry.value];
            }),
          ),
        }
      : metadata;

  return {
    ...value,
    nodes,
    ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
  };
}

export async function writer(
  directorPlan: Record<string, unknown>,
  options: AgentExecutionOptions = {},
): Promise<WriterOutput> {
  const context = createAgentContext(options);
  if (!Array.isArray(directorPlan.characters)) {
    throw new Error("Writer input.characters must be an array");
  }
  const collectible = assetBrief(directorPlan.collectible, "Writer input.collectible");

  const inputMaxCharacters = directorPlan.maxCharacters;
  const requestedMaxCharacters =
    typeof inputMaxCharacters === "number" && Number.isInteger(inputMaxCharacters)
      ? inputMaxCharacters
      : context.limits.maxCharacters;
  const maxCharacters = Math.min(
    context.limits.maxCharacters,
    Math.max(1, requestedMaxCharacters),
  );
  const originalCharacterCount = directorPlan.characters.length;
  const characters = directorPlan.characters.slice(0, maxCharacters);
  if (originalCharacterCount > maxCharacters) {
    context.emitProgress({
      agent: "writer",
      phase: "agent",
      message: `Truncated character list from size ${originalCharacterCount} to ${maxCharacters}`,
    });
  }
  const normalizedDirectorPlan = {
    ...directorPlan,
    maxTurns:
      typeof directorPlan.maxTurns === "number" && Number.isInteger(directorPlan.maxTurns)
        ? Math.min(context.limits.maxTurns, Math.max(1, directorPlan.maxTurns))
        : context.limits.maxTurns,
    maxCharacters,
    characters,
  };
  return withAgentRetries(context, "writer", async ({ previousError }) => {
    const generation = await context.modelClient("writer").generateJson<WriterModelOutput>({
      agent: "writer",
      model: AGENT_CONFIG.writer.model,
      nativeStructuredOutput: true,
      instructions: appendRetryContext(
        await loadAgentPrompt("writer"),
        previousError,
      ),
      prompt: JSON.stringify({ director: normalizedDirectorPlan }),
      usage: context.usage,
      trace: context.emitTrace,
      progress: context.emitProgress,
      maxOutputTokens: context.maxOutputTokens,
      signal: context.signal,
      schema: {
        name: "writer_output",
        schema: writerOutputJsonSchema,
      },
    });

    context.emitProgress({
      agent: "writer",
      phase: "agent",
      message: "Validating generated story structure…",
    });
    const output = generation.output;
    const dialogue = validateStory(normalizeWriterDialogue(output.dialogue));
    const charactersNeedingAssets = deriveCharacterAssetNeeds(characters, dialogue);
    context.emitProgress({
      agent: "writer",
      phase: "agent",
      message: "Story structure is valid and renderable.",
    });

    return {
      dialogue,
      embellish: output.embellish,
      need_assets: {
        characters: charactersNeedingAssets,
        collectible,
      },
    };
  });
}
