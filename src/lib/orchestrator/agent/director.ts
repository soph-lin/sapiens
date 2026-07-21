import {
  AGENT_CONFIG,
  type StoryLimits,
} from "../config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt, wikipediaTools } from "./agents";
import type { AgeRange } from "./portrait-age";
import { validateFurtherReading, validateGroundingSources, type GroundingSource } from "./flourish";
import { createWikipediaSectionHandlers } from "../tools/wikipedia-handlers";

export type AdventurePlan = {
  maxTurns: number;
  maxCharacters: number;
  synopsis: {
    premise: string;
    eventSpine: string;
    playerGoal: string;
    learningFocus: string;
    [key: string]: unknown;
  };
  characters: Array<{ name: string; role: string; desc: string; ageRange: AgeRange }>;
  starCharacter: { name: string; role: string; desc: string; wikipediaUrl: string } | null;
  endings: unknown[];
  collectible: { name: string; desc: string };
  scenes: unknown[];
  sources: GroundingSource[];
  furtherReading: GroundingSource[];
};

export async function director(
  research: Record<string, unknown>,
  options: AgentExecutionOptions = {},
): Promise<AdventurePlan> {
  const context = createAgentContext(options);
  const limits: StoryLimits = context.limits;
  if (
    !Number.isInteger(limits.maxTurns) ||
    !Number.isInteger(limits.maxCharacters) ||
    limits.maxTurns < 1 ||
    limits.maxCharacters < 1
  ) {
    throw new Error("Director limits must be positive integers");
  }
  const sectionHandlers = createWikipediaSectionHandlers({
    agent: "director",
    wikipedia: context.wikipedia,
    emitProgress: context.emitProgress,
  });
  const output = await withAgentRetries(context, "director", async ({ previousError }) => {
    const generation = await context.modelClient("director").generateJson<AdventurePlan>({
    agent: "director",
    model: AGENT_CONFIG.director.model,
    instructions: appendRetryContext(
      `${await loadAgentPrompt("director")}${context.directorSteering ? `\n\nStory direction (in-world scope and point of view):\n${context.directorSteering}` : ""}${context.directorLearningDesign ? `\n\nClassroom learning design (teacher-facing constraints; do not literalize as the player's occupation or actions):\n${context.directorLearningDesign}` : ""}`,
      previousError,
    ),
    prompt: JSON.stringify({
      research,
      sourcePolicy: context.flourish,
      maxTurns: limits.maxTurns,
      maxCharacters: limits.maxCharacters,
    }),
    usage: context.usage,
    trace: context.emitTrace,
    progress: context.emitProgress,
    maxOutputTokens: context.maxOutputTokens,
    signal: context.signal,
    tools: wikipediaTools,
    handlers: {
      wikipedia_search: async (raw) => {
        context.emitProgress({
          agent: "director",
          phase: "tool",
          message: "Locating the source article…",
          tool: "wikipedia_search",
        });
        const results = await context.wikipedia.searchPages(
          (JSON.parse(raw) as { query: string }).query,
        );
        context.emitProgress({
          agent: "director",
          phase: "tool",
          message: `Found ${results.length} possible source pages.`,
          tool: "wikipedia_search",
        });
        return results;
      },
      ...sectionHandlers,
    },
    schema: {
      name: "adventure_plan",
      schema: {
        type: "object",
        properties: {
          synopsis: {
            type: "object",
            properties: {
              premise: { type: "string", minLength: 1 },
              eventSpine: { type: "string", minLength: 1 },
              playerGoal: { type: "string", minLength: 1 },
              learningFocus: { type: "string", minLength: 1 },
            },
            required: ["premise", "eventSpine", "playerGoal", "learningFocus"],
            additionalProperties: true,
          },
          maxTurns: { type: "integer", minimum: 1 },
          maxCharacters: { type: "integer", minimum: 1 },
          characters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                desc: { type: "string" },
                ageRange: {
                  type: "string",
                  enum: ["baby", "child", "teenager", "young adult", "adult", "elderly"],
                },
              },
              required: ["name", "role", "desc", "ageRange"],
              additionalProperties: false,
            },
          },
          starCharacter: {
            anyOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  desc: { type: "string" },
                  wikipediaUrl: { type: "string", minLength: 1 },
                },
                required: ["name", "role", "desc", "wikipediaUrl"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
          },
          endings: { type: "array", items: { type: "object" } },
          collectible: {
            type: "object",
            properties: {
              name: { type: "string" },
              desc: { type: "string" },
            },
            required: ["name", "desc"],
            additionalProperties: false,
          },
          scenes: { type: "array", items: { type: "object" } },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 1 },
                url: { type: "string", minLength: 1 },
                domain: { type: "string", minLength: 1 },
                kind: { type: "string", enum: ["article", "video"] },
                keyPoints: { type: "array", items: { type: "string" } },
              },
              required: ["title", "url", "domain", "kind", "keyPoints"],
              additionalProperties: false,
            },
          },
          furtherReading: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 1 },
                url: { type: "string", minLength: 1 },
                domain: { type: "string", minLength: 1 },
                kind: { type: "string", enum: ["article", "video"] },
                keyPoints: { type: "array", items: { type: "string" } },
              },
              required: ["title", "url", "domain", "kind", "keyPoints"],
              additionalProperties: false,
            },
          },
        },
        required: ["maxTurns", "maxCharacters", "synopsis", "characters", "starCharacter", "endings", "collectible", "scenes", "sources", "furtherReading"],
        additionalProperties: false,
      },
    },
    });

    const output = generation.output;
    const researchSources = (research.sources ?? []) as unknown;
    const sources = validateGroundingSources(
      output.sources?.length ? output.sources : researchSources,
      context.flourish,
      "director.sources",
    );
    const furtherReading = validateFurtherReading(
      output.furtherReading?.length ? output.furtherReading : research.furtherReading,
      context.flourish,
      sources.map((source) => source.url),
    );
    if (output.characters.length > limits.maxCharacters) {
      throw new Error(
        `Director exceeded maxCharacters (${output.characters.length}/${limits.maxCharacters})`,
      );
    }
    if (output.scenes.length > limits.maxTurns) {
      throw new Error(
        `Director exceeded maxTurns (${output.scenes.length}/${limits.maxTurns})`,
      );
    }

    const starCharacter = output.starCharacter ?? null;
    if (starCharacter) {
      const selectedCharacter = output.characters.find(
        (character) =>
          character.name.trim().toLocaleLowerCase() ===
          starCharacter.name.trim().toLocaleLowerCase(),
      );
      if (!selectedCharacter) {
        throw new Error(
          `Director starCharacter must match a selected character: ${starCharacter.name}`,
        );
      }

      let wikipediaUrl: URL;
      try {
        wikipediaUrl = new URL(starCharacter.wikipediaUrl);
      } catch {
        throw new Error(
          `Director starCharacter.wikipediaUrl must be a valid English Wikipedia URL: ${starCharacter.wikipediaUrl}`,
        );
      }
      if (
        wikipediaUrl.protocol !== "https:" ||
        wikipediaUrl.hostname !== "en.wikipedia.org" ||
        !wikipediaUrl.pathname.startsWith("/wiki/") ||
        wikipediaUrl.search ||
        wikipediaUrl.hash
      ) {
        throw new Error(
          `Director starCharacter.wikipediaUrl must be a canonical English Wikipedia article URL: ${starCharacter.wikipediaUrl}`,
        );
      }

      const titleFromUrl = decodeURIComponent(wikipediaUrl.pathname.slice("/wiki/".length))
        .replaceAll("_", " ")
        .trim();
      if (!titleFromUrl) {
        throw new Error("Director starCharacter.wikipediaUrl must include an article title");
      }

      const page = await context.wikipedia.getPage(titleFromUrl);
      const searchResults = await context.wikipedia.searchPages(starCharacter.name, 10);
      const normalizedTitle = (value: string) =>
        value.replaceAll("_", " ").replace(/\s+/g, " ").trim().toLocaleLowerCase();
      const fetchedTitle = normalizedTitle(page.title || titleFromUrl);
      const exactSearchMatch = searchResults.some(
        (result) => normalizedTitle(result.title) === fetchedTitle,
      );
      if (!exactSearchMatch) {
        throw new Error(
          `Director starCharacter has no exact-name Wikipedia page verification: ${starCharacter.name}`,
        );
      }

      starCharacter.wikipediaUrl = page.sourceUrl;
    }
    context.emitProgress({
      agent: "director",
      phase: "agent",
      message: starCharacter
        ? `Selected ${starCharacter.name} as star character...`
        : "No Wikipedia-verified real person was suitable; no star character will be created.",
    });

    return {
      ...output,
      sources,
      furtherReading,
      starCharacter,
      maxTurns: limits.maxTurns,
      maxCharacters: limits.maxCharacters,
    };
  });

  return output;
}
