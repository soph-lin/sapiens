import { AGENT_CONFIG } from "./config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt } from "./agents";
import type { DialogueHistoryEntry } from "@/lib/dialogue";
import type { ToolDefinition } from "./types";

export type CocoDialogueContext = {
  topic: string;
  synopsis?: unknown;
  currentDialogue: string;
  dialogueHistory?: DialogueHistoryEntry[];
  speaker?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

export type CocoAnswer = {
  answer: string;
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
    const generation = await context.openai.generateJson<CocoAnswer>({
      agent: "coco",
      model: AGENT_CONFIG.coco.model,
      instructions: appendRetryContext(await loadAgentPrompt("coco"), previousError),
      prompt: JSON.stringify({ question, context: dialogueContext }),
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
          properties: { answer: { type: "string", minLength: 1 } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
    });

    const answer = stripSourceAppendix(generation.output.answer ?? "");
    if (!answer) throw new Error("Coco returned an empty answer");
    return {
      ...generation.output,
      answer,
      citations: generation.citations,
    };
  });
}
