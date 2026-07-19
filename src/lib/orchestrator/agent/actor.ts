import { AGENT_CONFIG, ORCHESTRATOR_CONFIG } from "../config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentContext,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt } from "./agents";
import type { FirstGreetingMode } from "./actor-greeting";
import type { TimeOfDay } from "@/lib/util";
import { isAllowedSourceUrl, type FlourishConfig } from "./flourish";
import type { AgentProgressEvent, ToolDefinition } from "../types";

const anthropicActorWebSearchTool: ToolDefinition = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 1,
};

const openAiActorWebSearchTool: ToolDefinition = { type: "web_search" };

function actorWebSearchTool(): ToolDefinition {
  return AGENT_CONFIG.actor.provider === "anthropic"
    ? anthropicActorWebSearchTool
    : openAiActorWebSearchTool;
}

export type ActorDialogueContext = {
  topic: string;
  synopsis?: unknown;
  characterName: string;
  characterDescription: string;
  firstGreeting?: boolean;
  greetingMode?: FirstGreetingMode;
  timeOfDay?: TimeOfDay;
  conversation?: Array<{ role: "learner" | "character"; content: string }>;
  /** When true, generate three learner follow-up questions instead of spoken dialogue. */
  followUpQuestions?: boolean;
  /** Classroom source policy. Non-empty `approvedDomains` limits citations; empty allows any. */
  flourish?: Partial<FlourishConfig>;
  storyId?: string;
  assignmentId?: string;
};

export type ActorFollowUps = {
  followUp1: string;
  followUp2: string;
  followUp3: string;
};

export type ActorAnswer = {
  answer?: string;
  followUps?: [string, string, string];
  summary?: string;
  sources?: string[];
  /** Progress events for the home [d] debug panel (and terminal). */
  progress?: AgentProgressEvent[];
};

function sanitizeActorText(raw: string): string {
  return raw
    .replace(/<sources\b[^>]*>[\s\S]*?<\/sources\s*>/gi, "")
    .replace(/<sources\b[^>]*\/\s*>/gi, "")
    .replace(/<parameter\b[^>]*>[\s\S]*?(?:<\/parameter\s*>|$)/gi, "")
    .replace(/<parameter\b[^>]*\/\s*>/gi, "")
    .replace(/<cite\b[^>]*(?:>|$)/gi, "")
    .replace(/<\/cite\s*>/gi, "")
    .replace(/<\/?(?:answer|response|output|spoken|text)\b[^>]*>/gi, "")
    .replace(/^\s*```(?:json|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\s*\[\s*(?:"[^"]*"\s*,\s*)*"[^"]*"\s*\]\s*$/g, "")
    .trim();
}

function summarizeForFieldNote(raw: string): string {
  return sanitizeActorText(raw)
    .split(/\s*\|\|\|\s*/)
    .map((node) => node.trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeFollowUps(raw: unknown): [string, string, string] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const followUps = [record.followUp1, record.followUp2, record.followUp3].map(
    (entry) => (typeof entry === "string" ? entry.trim() : ""),
  );
  if (followUps.some((entry) => !entry)) return null;
  return followUps as [string, string, string];
}

function logActor(
  context: AgentContext,
  message: string,
  extras?: { phase?: AgentProgressEvent["phase"]; tool?: string; details?: Record<string, unknown> },
) {
  console.info(message);
  context.emitProgress({
    agent: "actor",
    phase: extras?.phase ?? "agent",
    message,
    ...(extras?.tool ? { tool: extras.tool } : {}),
    ...(extras?.details ? { details: extras.details } : {}),
  });
}

export async function actor(
  question: string,
  dialogueContext: ActorDialogueContext,
  options: AgentExecutionOptions = {},
): Promise<ActorAnswer> {
  if (!dialogueContext.followUpQuestions && !question.trim()) {
    throw new Error("question is required");
  }
  if (!dialogueContext.characterName.trim()) {
    throw new Error("characterName is required");
  }

  const context = createAgentContext({
    ...options,
    maxTries: Math.min(
      options.maxTries ?? ORCHESTRATOR_CONFIG.maxTries,
      ORCHESTRATOR_CONFIG.maxTries,
    ),
  });
  const wantFollowUps = dialogueContext.followUpQuestions === true;
  const needsFactualGrounding =
    !wantFollowUps && dialogueContext.firstGreeting !== true;

  return withAgentRetries(context, "actor", async ({ previousError }) => {
    if (wantFollowUps) {
      const generation = await context.modelClient("actor").generateJson<ActorFollowUps>({
        agent: "actor",
        model: AGENT_CONFIG.actor.model,
        instructions: appendRetryContext(await loadAgentPrompt("actor"), previousError),
        prompt: JSON.stringify({
          question: "Suggest three follow-up questions the learner might ask next.",
          context: dialogueContext,
        }),
        usage: context.usage,
        trace: context.emitTrace,
        progress: context.emitProgress,
        maxOutputTokens: context.maxOutputTokens,
        signal: context.signal,
        schema: {
          name: "actor_follow_ups",
          description:
            "Three short learner follow-up questions continuing the current conversation.",
          strict: true,
          schema: {
            type: "object",
            properties: {
              followUp1: { type: "string" },
              followUp2: { type: "string" },
              followUp3: { type: "string" },
            },
            required: ["followUp1", "followUp2", "followUp3"],
            additionalProperties: false,
          },
        },
      });

      const followUps = normalizeFollowUps(generation.output);
      if (!followUps) {
        throw new Error("Actor returned invalid follow-up questions");
      }
      return { followUps, progress: [...context.progress] };
    }

    const generation = await context.modelClient("actor").generateJson<{
      summary: string;
      answer: string;
      sources?: unknown[];
    }>({
      agent: "actor",
      label: dialogueContext.characterName,
      model: AGENT_CONFIG.actor.model,
      instructions: appendRetryContext(await loadAgentPrompt("actor"), previousError),
      prompt: JSON.stringify({ question, context: dialogueContext }),
      usage: context.usage,
      trace: context.emitTrace,
      progress: context.emitProgress,
      maxOutputTokens: context.maxOutputTokens,
      signal: context.signal,
      ...(needsFactualGrounding
        ? { tools: [actorWebSearchTool()] }
        : {}),
      schema: {
        name: "actor_answer",
        description:
          "A concise field-note summary and a short in-character historical character response.",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            answer: { type: "string" },
            sources: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "answer", "sources"],
          additionalProperties: false,
        },
      },
    });

    const answer = sanitizeActorText(generation.output.answer ?? "");
    if (!answer) throw new Error("Actor returned an empty answer");
    const summary =
      summarizeForFieldNote(generation.output.summary ?? "") || summarizeForFieldNote(answer);

    if (needsFactualGrounding) {
      logActor(context, "Citing response...", { phase: "agent" });
    }

    const rawSources = Array.isArray((generation.output as { sources?: unknown }).sources)
      ? (generation.output as { sources: unknown[] }).sources
      : [];
    const modelSources = rawSources
      .filter((source): source is string => typeof source === "string" && Boolean(source.trim()))
      .map((source) => source.trim());
    const providerSources = (generation.citations ?? []).map((citation) => citation.url);
    if (providerSources.length > 0) {
      logActor(context, "Conducting web search...", {
        phase: "tool",
        tool: "web_search",
      });
    }

    const flourish = context.flourish;
    const beforeFilter = Array.from(
      new Set(modelSources.length > 0 ? modelSources : providerSources),
    );
    const sources = beforeFilter.filter((source) => isAllowedSourceUrl(source, flourish));

    // TEMP debug: citation → field-note pipeline (terminal + [d] panel)
    logActor(context, `modelSources: ${JSON.stringify(modelSources)}`, {
      details: { modelSources },
    });
    logActor(context, `providerSources: ${JSON.stringify(providerSources)}`, {
      details: { providerSources },
    });
    logActor(context, `sources before domain filter: ${JSON.stringify(beforeFilter)}`, {
      details: { beforeFilter },
    });
    logActor(context, `sources after domain filter: ${JSON.stringify(sources)}`, {
      details: { sources },
    });

    return { answer, summary, sources, progress: [...context.progress] };
  });
}
