import { AGENT_CONFIG } from "../config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt } from "./agents";
import { isAllowedSourceUrl } from "./flourish";
import type { DialogueHistoryEntry } from "@/lib/dialogue";
import type { ToolDefinition } from "../types";

export type CocoDialogueContext = {
  topic: string;
  synopsis?: unknown;
  currentDialogue: string;
  dialogueHistory?: DialogueHistoryEntry[];
  speaker?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  storyId?: string;
  assignmentId?: string;
  prefilledOption?: string;
};

export type CocoAnswer = {
  noteTitle: string;
  summary: string;
  answer: string;
  sources: string[];
  citations?: Array<{ url: string; title?: string }>;
};

const webSearchTool: ToolDefinition = { type: "web_search" };

function stripSourceAppendix(answer: string): string {
  const sourceHeading = /(?:^|\n)\s*(?:[#*_~`]+\s*)?sources?\s*:?(?:\s*[#*_~`]+)?\s*(?:\n|$)/i;
  const headingIndex = answer.search(sourceHeading);
  const withoutHeading = headingIndex < 0 ? answer : answer.slice(0, headingIndex);
  const markdownSourceLine = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?\[[^\]]+\]\([^\)]+\)\s*$/;
  const withoutSourceLines = withoutHeading
    .split(/\r?\n/)
    .filter((line) => !markdownSourceLine.test(line))
    .join("\n");
  const withoutMarkdownLinks = withoutSourceLines.replace(
    /\[[^\]]+\]\([^\)]+\)/g,
    "",
  );

  return withoutMarkdownLinks.trim();
}

export async function coco(
  question: string,
  dialogueContext: CocoDialogueContext,
  options: AgentExecutionOptions = {},
): Promise<CocoAnswer> {
  if (!question.trim()) throw new Error("question is required");
  if (!dialogueContext.topic.trim()) throw new Error("topic is required");
  if (!dialogueContext.currentDialogue.trim()) {
    throw new Error("currentDialogue is required");
  }

  const context = createAgentContext(options);
  return withAgentRetries(context, "coco", async ({ previousError }) => {
    const generation = await context.openai.generateJson<Pick<CocoAnswer, "noteTitle" | "summary" | "answer" | "sources">>({
      agent: "coco",
      model: AGENT_CONFIG.coco.model,
      instructions: appendRetryContext(await loadAgentPrompt("coco"), previousError),
      prompt: JSON.stringify({
        question,
        context: dialogueContext,
        flourish: context.flourish,
      }),
      usage: context.usage,
      trace: context.emitTrace,
      progress: context.emitProgress,
      maxOutputTokens: Math.min(context.maxOutputTokens, 4000),
      signal: context.signal,
      tools: [webSearchTool],
      schema: {
        name: "coco_answer",
        description: "A concise, source-aware answer from Coco.",
        strict: true,
        schema: {
          type: "object",
          properties: {
            noteTitle: { type: "string", minLength: 1 },
            summary: { type: "string", minLength: 1 },
            answer: { type: "string", minLength: 1 },
            sources: { type: "array", items: { type: "string" } },
          },
          required: ["noteTitle", "summary", "answer", "sources"],
          additionalProperties: false,
        },
      },
    });

    const answer = stripSourceAppendix(generation.output.answer ?? "");
    if (!answer) throw new Error("Coco returned an empty answer");
    const noteTitle = stripSourceAppendix(generation.output.noteTitle ?? "");
    if (!noteTitle) throw new Error("Coco returned an empty note title");
    const summary = stripSourceAppendix(generation.output.summary ?? "") || answer;
    const modelSources = (generation.output.sources ?? [])
      .filter((source): source is string => typeof source === "string" && Boolean(source.trim()))
      .map((source) => source.trim());
    const providerSources = (generation.citations ?? []).map((citation) => citation.url);
    const sources = Array.from(new Set(modelSources.length > 0 ? modelSources : providerSources))
      .filter((source) => isAllowedSourceUrl(source, context.flourish));
    return {
      summary,
      noteTitle,
      answer,
      sources,
      citations: generation.citations,
    };
  });
}
