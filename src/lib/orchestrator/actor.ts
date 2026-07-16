import { AGENT_CONFIG } from "./config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt } from "./agents";

export type ActorDialogueContext = {
  topic: string;
  synopsis?: unknown;
  characterName: string;
  characterDescription: string;
  firstGreeting?: boolean;
  conversation?: Array<{ role: "learner" | "character"; content: string }>;
};

export type ActorAnswer = { answer: string };

export async function actor(
  question: string,
  dialogueContext: ActorDialogueContext,
  options: AgentExecutionOptions = {},
): Promise<ActorAnswer> {
  if (!question.trim()) throw new Error("question is required");
  if (!dialogueContext.characterName.trim()) {
    throw new Error("characterName is required");
  }

  const context = createAgentContext(options);
  return withAgentRetries(context, "actor", async ({ previousError }) => {
    const generation = await context.openai.generateJson<ActorAnswer>({
      agent: "actor",
      model: AGENT_CONFIG.actor.model,
      instructions: appendRetryContext(await loadAgentPrompt("actor"), previousError),
      prompt: JSON.stringify({ question, context: dialogueContext }),
      usage: context.usage,
      trace: context.emitTrace,
      progress: context.emitProgress,
      maxOutputTokens: Math.min(context.maxOutputTokens, 1200),
      signal: context.signal,
      schema: {
        name: "actor_answer",
        description: "A short in-character historical character response.",
        strict: true,
        schema: {
          type: "object",
          properties: { answer: { type: "string", minLength: 1 } },
          required: ["answer"],
          additionalProperties: false,
        },
      },
    });

    const answer = generation.output.answer?.trim();
    if (!answer) throw new Error("Actor returned an empty answer");
    return { answer };
  });
}
