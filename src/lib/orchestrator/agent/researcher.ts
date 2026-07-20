import { AGENT_CONFIG, ORCHESTRATOR_CONFIG } from "../config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt, webSearchTool, wikipediaTools } from "./agents";
import {
  validateFurtherReading,
  validateGroundingSources,
  normalizeSource,
  type GroundingSource,
} from "./flourish";
import { createWikipediaSectionHandlers } from "../tools/wikipedia-handlers";
import { getTextChunk } from "../../util/text-chunks";
import { readableWikipediaHtml, readWikipediaSection } from "../../wikipedia/page-chunks";

export type ResearchBrief = {
  topic: string;
  articleUrl: string;
  sources: GroundingSource[];
  furtherReading: GroundingSource[];
};

export type ResearchRequest = {
  historicalEvent: string;
  sourceSearchTerms?: string;
  plotDirection?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeResearchRequest(
  input: string | ResearchRequest,
): ResearchRequest {
  if (typeof input === "string") {
    const text = input.trim();
    if (!text) throw new Error("historicalEvent is required");

    try {
      const parsed: unknown = JSON.parse(text);
      if (isRecord(parsed) && typeof parsed.historicalEvent === "string") {
        const historicalEvent = parsed.historicalEvent.trim();
        if (!historicalEvent) throw new Error("historicalEvent is required");
        const sourceSearchTerms =
          typeof parsed.sourceSearchTerms === "string"
            ? parsed.sourceSearchTerms.trim()
            : "";
        return {
          historicalEvent,
          sourceSearchTerms: sourceSearchTerms || historicalEvent,
          plotDirection:
            typeof parsed.plotDirection === "string" && parsed.plotDirection.trim()
              ? parsed.plotDirection.trim()
              : undefined,
        };
      }
    } catch (error) {
      if (error instanceof Error && error.message === "historicalEvent is required") {
        throw error;
      }
      // Natural-language requests are allowed to contain arbitrary text.
    }

    return { historicalEvent: text, sourceSearchTerms: text };
  }

  const historicalEvent = input.historicalEvent.trim();
  if (!historicalEvent) throw new Error("historicalEvent is required");
  const sourceSearchTerms = input.sourceSearchTerms?.trim();
  return {
    historicalEvent,
    sourceSearchTerms: sourceSearchTerms || historicalEvent,
    plotDirection: input.plotDirection?.trim() || undefined,
  };
}

function sourceTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "en.wikipedia.org" && parsed.pathname.startsWith("/wiki/")) {
      return decodeURIComponent(parsed.pathname.slice("/wiki/".length)).replaceAll("_", " ");
    }
    return parsed.hostname;
  } catch {
    return url;
  }
}

async function providedSource(url: string, context: ReturnType<typeof createAgentContext>): Promise<GroundingSource> {
  const parsed = new URL(url);
  const chunkSize = ORCHESTRATOR_CONFIG.pageChunkChars;
  if (parsed.hostname === "en.wikipedia.org" && parsed.pathname.startsWith("/wiki/")) {
    const title = decodeURIComponent(parsed.pathname.slice("/wiki/".length)).replaceAll("_", " ");
    const lead = await readWikipediaSection(context.wikipedia, {
      title,
      sectionIndex: 0,
      chunkIndex: 0,
      chunkSize,
    });
    return normalizeSource({
      title: lead.title,
      url: lead.sourceUrl,
      kind: "article",
      keyPoints: [lead.text],
    }, "provided source");
  }
  const response = await fetch(url, {
    headers: { Accept: "text/html, text/plain;q=0.9" },
    signal: context.signal,
  });
  if (!response.ok) throw new Error(`Could not read provided source (${response.status}): ${url}`);
  const html = await response.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || sourceTitleFromUrl(url);
  const text = getTextChunk(readableWikipediaHtml(html), 0, chunkSize).text;
  return normalizeSource({ title, url, kind: "article", keyPoints: text ? [text] : [] }, "provided source");
}

/** Build a Director-ready research brief from teacher-supplied exact URLs without running Researcher. */
export async function researchFromSources(
  sourceUrls: string[],
  topic: string,
  options: AgentExecutionOptions = {},
): Promise<ResearchBrief> {
  const context = createAgentContext(options);
  if (context.flourish.sourceMode === "restricted") {
    const domains = context.flourish.approvedDomains.join(", ");
    context.emitProgress({
      agent: "researcher",
      phase: "agent",
      message: `Researcher will only be searching in these domains: ${domains}`,
      details: {
        sourceMode: "restricted",
        approvedDomains: context.flourish.approvedDomains,
      },
    });
  }
  const urls = Array.from(new Set(sourceUrls.map((url) => url.trim()).filter(Boolean)));
  if (!urls.length) throw new Error("At least one source URL is required");
  const sources: GroundingSource[] = [];
  for (const [index, url] of urls.entries()) {
    context.emitProgress({
      agent: "researcher",
      phase: "tool",
      message: `Reading teacher-provided source ${index + 1}: ${url}`,
      tool: "provided_source",
      details: { url, exactMatch: true },
    });
    sources.push(await providedSource(url, context));
  }
  const validated = validateGroundingSources(sources, context.flourish, "provided sources", 1);
  const articleUrl = validated.find((source) => source.domain === "en.wikipedia.org")?.url ?? validated[0].url;
  context.emitProgress({
    agent: "researcher",
    phase: "agent",
    message: `Using ${validated.length} teacher-provided source${validated.length === 1 ? "" : "s"}; Researcher selection bypassed.`,
    details: { exactSources: validated.map((source) => source.url) },
  });
  return { topic: topic.trim(), articleUrl, sources: validated, furtherReading: [] };
}

function normalizedTitle(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll("_", " ")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

function prioritizeExactTitle<T extends { title: string }>(
  results: T[],
  sourceSearchTerms: string,
): T[] {
  const requestedTitle = normalizedTitle(sourceSearchTerms);
  if (!requestedTitle) return results;
  const exactIndex = results.findIndex(
    (result) => normalizedTitle(result.title) === requestedTitle,
  );
  if (exactIndex <= 0) return results;
  const ordered = [...results];
  const [exact] = ordered.splice(exactIndex, 1);
  return [exact, ...ordered];
}

const CONTEXT_TERMS = new Set([
  "and",
  "during",
  "global",
  "history",
  "historical",
  "in",
  "of",
  "second",
  "the",
  "war",
  "world",
  "ww2",
  "wwii",
  "ii",
]);

const REFERENCE_PAGE_MARKERS = [
  "casualties",
  "chronology of",
  "data",
  "death toll",
  "deaths",
  "demographics",
  "denial",
  "disambiguation",
  "index",
  "list of",
  "statistics",
  "table",
  "timeline of",
];

function titleFromWikipediaUrl(articleUrl: string): string | null {
  try {
    const url = new URL(articleUrl);
    if (url.hostname !== "en.wikipedia.org") return null;
    const marker = "/wiki/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length)).replaceAll(
      "_",
      " ",
    );
  } catch {
    return null;
  }
}

function assertFocusedSelection(
  request: ResearchRequest,
  output: ResearchBrief,
  exactCandidateUrl: string | null,
) {
  const title = titleFromWikipediaUrl(output.articleUrl);
  if (!title) return;

  const requested = normalizedTitle(request.sourceSearchTerms || request.historicalEvent);
  const titleText = normalizedTitle(title);

  if (exactCandidateUrl) {
    const exactTitle = titleFromWikipediaUrl(exactCandidateUrl);
    if (exactTitle && normalizedTitle(exactTitle) !== titleText) {
      throw new Error(
        `Researcher must use the exact-match Wikipedia article (${exactTitle}) as the primary source when it appears in search candidates; keep sub-aspects as additional sources only.`,
      );
    }
  }

  // Reject narrowing a multi-word requested subject into a longer sub-aspect title
  // (e.g. "American Revolutionary War" → "France in the American Revolutionary War").
  const requestedTokens = requested.split(" ").filter(Boolean);
  if (
    requestedTokens.length >= 2 &&
    titleText !== requested &&
    ` ${titleText} `.includes(` ${requested} `)
  ) {
    throw new Error(
      `Researcher narrowed the requested subject (${requested}) to a sub-aspect (${title}); use the dedicated subject article as the primary Wikipedia source.`,
    );
  }

  const requestedMarkers = REFERENCE_PAGE_MARKERS.filter((marker) =>
    requested.includes(marker),
  );
  const hasUnrequestedReferenceMarker = REFERENCE_PAGE_MARKERS.some(
    (marker) => titleText.includes(marker) && !requestedMarkers.includes(marker),
  );
  if (hasUnrequestedReferenceMarker) {
    throw new Error(
      `Researcher selected a reference or aggregation page (${title}) instead of the focused subject; choose a dedicated subject article.`,
    );
  }

  const focusTerms = requested
    .split(" ")
    .filter((term) => term.length > 2 && !CONTEXT_TERMS.has(term));
  const titleTerms = new Set(titleText.split(" "));
  const hasFocusedTerm = focusTerms.some((term) => titleTerms.has(term));
  const titleIsOnlyContext = titleText
    .split(" ")
    .every((term) => CONTEXT_TERMS.has(term));
  if (focusTerms.length && !hasFocusedTerm && titleIsOnlyContext) {
    throw new Error(
      `Researcher selected the broad parent page (${title}) instead of the focused subject; choose a dedicated subject article.`,
    );
  }
}

export async function researcher(
  input: string | ResearchRequest,
  options: AgentExecutionOptions = {},
): Promise<ResearchBrief> {
  const request = normalizeResearchRequest(input);
  const context = createAgentContext(options);
  if (context.flourish.sourceMode === "restricted") {
    const domains = context.flourish.approvedDomains.join(", ");
    context.emitProgress({
      agent: "researcher",
      phase: "agent",
      message: `Researcher will only be searching in these domains: ${domains}`,
      details: {
        sourceMode: "restricted",
        approvedDomains: context.flourish.approvedDomains,
      },
    });
  }
  let exactCandidateUrl: string | null = null;
  const sectionHandlers = createWikipediaSectionHandlers({
    agent: "researcher",
    wikipedia: context.wikipedia,
    emitProgress: context.emitProgress,
  });
  const wikipediaApproved = context.flourish.approvedDomains.some(
    (domain) =>
      domain === "en.wikipedia.org" ||
      "en.wikipedia.org".endsWith(`.${domain}`),
  );
  const useWikipedia = context.flourish.sourceMode === "free" || wikipediaApproved;
  return withAgentRetries(context, "researcher", async ({ previousError }) =>
    context.modelClient("researcher").generateJson<ResearchBrief>({
      agent: "researcher",
      model: AGENT_CONFIG.researcher.model,
      instructions: appendRetryContext(
        await loadAgentPrompt("researcher"),
        previousError,
      ),
      prompt: JSON.stringify({ request, config: context.flourish }),
      usage: context.usage,
      trace: context.emitTrace,
      progress: context.emitProgress,
      maxOutputTokens: context.maxOutputTokens,
      signal: context.signal,
      tools: [
        ...(useWikipedia ? wikipediaTools : []),
        webSearchTool(
          context.flourish.sourceMode === "restricted"
            ? context.flourish.approvedDomains
            : undefined,
        ),
      ],
      handlers: {
        wikipedia_search: async (raw) => {
          const args = JSON.parse(raw) as { query: string };
          context.emitProgress({
            agent: "researcher",
            phase: "tool",
            message: "Searching Wikipedia for relevant pages…",
            tool: "wikipedia_search",
          });
          // Keep the Curator's focused terms intact. The model may still choose
          // among the returned candidates, but it cannot silently broaden or
          // abbreviate the query into a different subject.
          const query = request.sourceSearchTerms || args.query;
          const results = prioritizeExactTitle(
            await context.wikipedia.searchPages(query),
            request.sourceSearchTerms || query,
          );
          const requestedTitle = normalizedTitle(request.sourceSearchTerms || query);
          const exact = results.find(
            (result) => normalizedTitle(result.title) === requestedTitle,
          );
          exactCandidateUrl = exact?.url ?? null;
          context.emitProgress({
            agent: "researcher",
            phase: "tool",
            message: `Found ${results.length} candidate Wikipedia pages.`,
            tool: "wikipedia_search",
            details: {
              candidates: results.map((result) => ({
                title: result.title,
                url: result.url,
                excerpt: result.excerpt,
              })),
              exactCandidateUrl,
            },
          });
          results.forEach((result, index) => context.emitProgress({
            agent: "researcher",
            phase: "tool",
            message: `Candidate article ${index + 1}: ${result.title} — ${result.url}`,
            tool: "wikipedia_search",
            details: { title: result.title, url: result.url, excerpt: result.excerpt },
          }));
          return results;
        },
        ...sectionHandlers,
      },
      schema: {
        name: "research_article",
        schema: {
          type: "object",
          properties: {
            topic: { type: "string", minLength: 1 },
            articleUrl: { type: "string", minLength: 1 },
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", minLength: 1 },
                  url: { type: "string", minLength: 1 },
                  kind: { type: "string", enum: ["article", "video"] },
                  keyPoints: { type: "array", items: { type: "string" } },
                },
                required: ["title", "url", "kind", "keyPoints"],
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
                  kind: { type: "string", enum: ["article", "video"] },
                  keyPoints: { type: "array", items: { type: "string" } },
                },
                required: ["title", "url", "kind", "keyPoints"],
                additionalProperties: false,
              },
            },
          },
          required: ["topic", "articleUrl", "sources", "furtherReading"],
          additionalProperties: false,
        },
      },
    }).then((generation) => {
      assertFocusedSelection(request, generation.output, exactCandidateUrl);
      const sources = validateGroundingSources(
        generation.output.sources,
        context.flourish,
        "sources",
      );
      if (sources.length !== context.flourish.requiredSources) {
        throw new Error(`Researcher must return exactly ${context.flourish.requiredSources} primary sources`);
      }
      const wikipediaSource = sources.find((source) => source.domain === "en.wikipedia.org");
      if (context.flourish.sourceMode === "free" && !wikipediaSource) {
        throw new Error("Free-mode sources must include the best-fitting English Wikipedia article");
      }
      if (useWikipedia && exactCandidateUrl && wikipediaSource) {
        const exactTitle = titleFromWikipediaUrl(exactCandidateUrl);
        const selectedTitle = titleFromWikipediaUrl(wikipediaSource.url);
        if (
          exactTitle &&
          selectedTitle &&
          normalizedTitle(exactTitle) !== normalizedTitle(selectedTitle)
        ) {
          throw new Error(
            `Primary Wikipedia source must be the exact-match candidate (${exactTitle}), not a sub-aspect`,
          );
        }
      }
      const primarySource = wikipediaSource ?? sources[0];
      if (generation.output.articleUrl !== primarySource.url) {
        generation.output.articleUrl = primarySource.url;
      }
      const furtherReading = validateFurtherReading(generation.output.furtherReading, context.flourish, sources.map((source) => source.url));
      sources.forEach((source, index) => context.emitProgress({
        agent: "researcher",
        phase: "agent",
        message: `Selected source ${index + 1}: ${source.title} — ${source.url}`,
        details: source,
      }));
      if (context.flourish.furtherReading && context.flourish.sourceMode === "restricted" && furtherReading.length === 0) {
        context.emitProgress({
          agent: "researcher",
          phase: "agent",
          message: "Further reading requested, but no additional approved sources were available in Restricted mode.",
          details: { furtherReadingUnavailable: true, approvedDomains: context.flourish.approvedDomains },
        });
      }
      return { ...generation.output, sources, furtherReading };
    }),
  );
}
