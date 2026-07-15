import {
  AGENT_CONFIG,
  type StoryLimits,
} from "./config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt, wikipediaTools } from "./agents";

export type AdventurePlan = {
  maxTurns: number;
  maxCharacters: number;
  synopsis: Record<string, unknown>;
  characters: Array<{ name: string; role: string; desc: string }>;
  endings: unknown[];
  collectible: { name: string; desc: string };
  scenes: unknown[];
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
  const output = await withAgentRetries(context, "director", async ({ previousError }) => {
    const generation = await context.modelClient("director").generateJson<AdventurePlan>({
    agent: "director",
    model: AGENT_CONFIG.director.model,
    instructions: appendRetryContext(
      `${await loadAgentPrompt("director")}${context.directorSteering ? `\n\nSteer the story strongly in this direction:\n${context.directorSteering}` : ""}`,
      previousError,
    ),
    prompt: JSON.stringify({
      research,
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
      wikipedia_get_page: async (raw) => {
        const title = (JSON.parse(raw) as { title: string }).title;
        context.emitProgress({
          agent: "director",
          phase: "tool",
          message: `Reading the source article: ${title}`,
          tool: "wikipedia_get_page",
        });
        return context.wikipedia.getPage(title);
      },
      wikipedia_get_page_html: async (raw) => {
        const title = (JSON.parse(raw) as { title: string }).title;
        context.emitProgress({
          agent: "director",
          phase: "tool",
          message: `Reading rendered source context: ${title}`,
          tool: "wikipedia_get_page_html",
        });
        return context.wikipedia.getPageHtml(title);
      },
    },
    schema: {
      name: "adventure_plan",
      schema: {
        type: "object",
        properties: {
          synopsis: { type: "object" },
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
              },
              required: ["name", "role", "desc"],
              additionalProperties: false,
            },
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
        },
        required: ["maxTurns", "maxCharacters", "synopsis", "characters", "endings", "collectible", "scenes"],
        additionalProperties: false,
      },
    },
    });

    const output = generation.output;
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

    return {
      ...output,
      maxTurns: limits.maxTurns,
      maxCharacters: limits.maxCharacters,
    };
  });

  return output;
}
