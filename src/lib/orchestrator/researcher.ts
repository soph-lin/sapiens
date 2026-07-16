import { AGENT_CONFIG } from "./config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt, wikipediaTools } from "./agents";

export type ResearchBrief = {
  topic: string;
  articleUrl: string;
};

export async function researcher(
  historicalEvent: string,
  options: AgentExecutionOptions = {},
): Promise<ResearchBrief> {
  if (!historicalEvent.trim()) throw new Error("historicalEvent is required");
  const context = createAgentContext(options);
  return withAgentRetries(context, "researcher", async ({ previousError }) =>
    context.modelClient("researcher").generateJson<ResearchBrief>({
      agent: "researcher",
      model: AGENT_CONFIG.researcher.model,
      instructions: appendRetryContext(
        await loadAgentPrompt("researcher"),
        previousError,
      ),
      prompt: JSON.stringify({ historicalEvent }),
      usage: context.usage,
      trace: context.emitTrace,
      progress: context.emitProgress,
      maxOutputTokens: context.maxOutputTokens,
      signal: context.signal,
      tools: wikipediaTools,
      handlers: {
        wikipedia_search: async (raw) => {
          const args = JSON.parse(raw) as { query: string };
          context.emitProgress({
            agent: "researcher",
            phase: "tool",
            message: "Searching Wikipedia for relevant pages…",
            tool: "wikipedia_search",
          });
          const results = await context.wikipedia.searchPages(args.query);
          context.emitProgress({
            agent: "researcher",
            phase: "tool",
            message: `Found ${results.length} candidate Wikipedia pages.`,
            tool: "wikipedia_search",
          });
          return results;
        },
        wikipedia_get_page: async (raw) => {
          const title = JSON.parse(raw).title as string;
          context.emitProgress({
            agent: "researcher",
            phase: "tool",
            message: `Reading Wikipedia page: ${title}`,
            tool: "wikipedia_get_page",
          });
          return context.wikipedia.getPage(title);
        },
        wikipedia_get_page_html: async (raw) => {
          const title = JSON.parse(raw).title as string;
          context.emitProgress({
            agent: "researcher",
            phase: "tool",
            message: `Reading rendered context: ${title}`,
            tool: "wikipedia_get_page_html",
          });
          return context.wikipedia.getPageHtml(title);
        },
      },
      schema: {
        name: "research_article",
        schema: {
          type: "object",
          properties: {
            topic: { type: "string", minLength: 1 },
            articleUrl: { type: "string", minLength: 1 },
          },
          required: ["topic", "articleUrl"],
          additionalProperties: false,
        },
      },
    }).then((generation) => generation.output),
  );
}
