import { AGENT_CONFIG } from "../config";
import {
  appendRetryContext,
  createAgentContext,
  withAgentRetries,
  type AgentExecutionOptions,
} from "./agent-context";
import { loadAgentPrompt } from "./agents";
import {
  CURATOR_GENRES,
  isCuratorGenre,
  isConcreteHistoricalPeriod,
  parseCuratorInput,
  requireHistoricalPeriod,
  type CuratorIdea,
  type CuratorInput,
  type CuratorOutput,
  type CuratorVoyageDraft,
} from "./curator-shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Curator output.${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeCuratorOutput(
  value: unknown,
): CuratorOutput {
  if (!isRecord(value)) throw new Error("Curator returned an invalid object");

  const genre =
    value.genre === null
      ? null
      : typeof value.genre === "string"
        ? value.genre.trim().toLowerCase()
        : undefined;
  if (genre === undefined || (genre !== null && !isCuratorGenre(genre))) {
    throw new Error(
      `Curator output.genre must be one of: ${CURATOR_GENRES.join(", ")} or null`,
    );
  }

  const extractedBound = (key: "location" | "period"): string | null => {
    const valueAtKey = value[key];
    if (valueAtKey === null) return null;
    if (typeof valueAtKey !== "string" || !valueAtKey.trim()) {
      throw new Error(`Curator output.${key} must be a non-empty string or null`);
    }
    return valueAtKey.trim();
  };

  if (!isRecord(value.idea)) {
    throw new Error("Curator output.idea must be an object");
  }

  const rawIdea = value.idea;
  const idea: CuratorIdea = {
    name: requiredText(rawIdea.name, "idea.name"),
    historicalEvent: requiredText(rawIdea.historicalEvent, "idea.historicalEvent"),
    era: requireHistoricalPeriod(rawIdea.era, "idea.era"),
    region: requiredText(rawIdea.region, "idea.region"),
    whyItFits: requiredText(rawIdea.whyItFits, "idea.whyItFits"),
    plotDirection: requiredText(rawIdea.plotDirection, "idea.plotDirection"),
    sourceSearchTerms: requiredText(rawIdea.sourceSearchTerms, "idea.sourceSearchTerms"),
  };

  let voyage: CuratorVoyageDraft | null | undefined;
  if (value.voyage !== undefined && value.voyage !== null) {
    if (!isRecord(value.voyage)) throw new Error("Curator output.voyage must be an object or null");
    const rawVoyage = value.voyage;
    const optionalText = (key: keyof CuratorVoyageDraft): string | null => {
      const field = rawVoyage[key];
      if (field === null || field === undefined) return null;
      if (typeof field !== "string" || !field.trim()) {
        throw new Error(`Curator output.voyage.${key} must be non-empty text or null`);
      }
      return field.trim();
    };
    const voyagePeriod = optionalText("period");
    voyage = {
      title: optionalText("title"),
      topic: optionalText("topic"),
      period:
        voyagePeriod && isConcreteHistoricalPeriod(voyagePeriod)
          ? voyagePeriod
          : voyagePeriod
            ? idea.era
            : null,
      scene: optionalText("scene"),
      lessonPlan: optionalText("lessonPlan"),
    };
  } else if (value.voyage === null) {
    voyage = null;
  }

  return {
    genre,
    location: extractedBound("location"),
    period: extractedBound("period"),
    idea,
    voyage,
  };
}

export async function curator(
  input: CuratorInput,
  options: AgentExecutionOptions = {},
): Promise<CuratorOutput> {
  const parsedInput = parseCuratorInput(input);
  const context = createAgentContext(options);

  return withAgentRetries(context, "curator", async ({ previousError }) => {
    const generation = await context.modelClient("curator").generateJson<CuratorOutput>({
      agent: "curator",
      model: AGENT_CONFIG.curator.model,
      instructions: appendRetryContext(
        await loadAgentPrompt("curator"),
        previousError,
      ),
      prompt: parsedInput,
      usage: context.usage,
      trace: context.emitTrace,
      progress: context.emitProgress,
      maxOutputTokens: Math.min(context.maxOutputTokens, 6000),
      signal: context.signal,
      schema: {
        name: "curator_output",
        description: "One sourceable historical story idea.",
        strict: true,
        schema: {
          type: "object",
          properties: {
            genre: {
              anyOf: [
                { type: "string", enum: CURATOR_GENRES },
                { type: "null" },
              ],
            },
            location: { anyOf: [{ type: "string" }, { type: "null" }] },
            period: { anyOf: [{ type: "string" }, { type: "null" }] },
            idea: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1 },
                historicalEvent: { type: "string", minLength: 1 },
                era: { type: "string", minLength: 1 },
                region: { type: "string", minLength: 1 },
                whyItFits: { type: "string", minLength: 1 },
                plotDirection: { type: "string", minLength: 1 },
                sourceSearchTerms: { type: "string", minLength: 1 },
              },
              required: [
                "name",
                "historicalEvent",
                "era",
                "region",
                "whyItFits",
                "plotDirection",
                "sourceSearchTerms",
              ],
              additionalProperties: false,
            },
            voyage: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  properties: {
                    title: { anyOf: [{ type: "string" }, { type: "null" }] },
                    topic: { anyOf: [{ type: "string" }, { type: "null" }] },
                    period: { anyOf: [{ type: "string" }, { type: "null" }] },
                    scene: { anyOf: [{ type: "string" }, { type: "null" }] },
                    lessonPlan: { anyOf: [{ type: "string" }, { type: "null" }] },
                  },
                  required: ["title", "topic", "period", "scene", "lessonPlan"],
                  additionalProperties: false,
                },
              ],
            },
          },
          required: ["genre", "location", "period", "idea", "voyage"],
          additionalProperties: false,
        },
      },
    });

    const output = normalizeCuratorOutput(generation.output);
    context.emitProgress({
      agent: "curator",
      phase: "agent",
      message: "Curator selected one story idea.",
    });
    return output;
  });
}
