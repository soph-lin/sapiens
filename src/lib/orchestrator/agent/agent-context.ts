import { AnthropicClient } from "../../providers/anthropic";
import { OpenAIClient } from "../../providers/openai";
import type { AgentClient } from "../../providers/agent-client";
import { PixelLabClient } from "../../providers/pixellab";
import { WikipediaClient } from "../../providers/wikipedia";
import {
  AGENT_CONFIG,
  DEFAULT_STORY_LIMITS,
  ORCHESTRATOR_CONFIG,
  type StoryLimits,
} from "../config";
import { UsageCollector } from "../tools/telemetry";
import type {
  AgentName,
  AgentProgressEvent,
  AgentTraceEvent,
  GeneratedAssetEvent,
} from "../types";
import type { AgeRange } from "./portrait-age";
import { normalizeFlourishConfig, type FlourishConfig } from "./flourish";

export type ExistingCharacterAsset = {
  id: string;
  type: string;
  name: string;
  mimeType: string;
  data: Uint8Array;
  metadata: unknown;
  ageRange?: string | null;
  createdAt: Date;
  frames?: Array<{
    frameKey: string;
    mimeType: string;
    data: Uint8Array;
    metadata: unknown;
  }>;
};

export type CharacterAssetStore = {
  findByNamesAndAgeRanges: (
    requests: Array<{ name: string; ageRange: AgeRange }>,
  ) => Promise<ExistingCharacterAsset[]>;
  findSpriteByNames: (names: string[]) => Promise<ExistingCharacterAsset[]>;
};

export type AgentExecutionOptions = {
  usage?: UsageCollector;
  trace?: AgentTraceEvent[];
  onTrace?: (event: AgentTraceEvent) => void;
  progress?: AgentProgressEvent[];
  onProgress?: (event: AgentProgressEvent) => void;
  onAsset?: (event: GeneratedAssetEvent) => void;
  limits?: StoryLimits;
  maxTries?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  directorSteering?: string;
  flourish?: Partial<FlourishConfig>;
  openai?: OpenAIClient;
  anthropic?: AnthropicClient;
  wikipedia?: WikipediaClient;
  pixellab?: PixelLabClient;
  characterAssetStore?: CharacterAssetStore;
};

export function createAgentContext(options: AgentExecutionOptions = {}) {
  const trace = options.trace ?? [];
  const emitTrace = (event: AgentTraceEvent) => {
    trace.push(event);
    options.onTrace?.(event);
  };
  const progress = options.progress ?? [];
  const emitProgress = (event: AgentProgressEvent) => {
    progress.push(event);
    options.onProgress?.(event);
  };

  const openai = options.openai ?? new OpenAIClient();
  const anthropic = options.anthropic ?? new AnthropicClient();

  return {
    usage: options.usage ?? new UsageCollector(),
    trace,
    emitTrace,
    progress,
    emitProgress,
    limits: options.limits ?? DEFAULT_STORY_LIMITS,
    maxTries: options.maxTries ?? ORCHESTRATOR_CONFIG.maxTries,
    maxOutputTokens: options.maxOutputTokens ?? ORCHESTRATOR_CONFIG.maxOutputTokens,
    signal: options.signal,
    directorSteering: options.directorSteering?.trim(),
    flourish: normalizeFlourishConfig(options.flourish),
    openai,
    anthropic,
    modelClient(agent: AgentName): AgentClient {
      return AGENT_CONFIG[agent].provider === "anthropic"
        ? anthropic
        : openai;
    },
    wikipedia: options.wikipedia ?? new WikipediaClient(),
    pixellab: options.pixellab ?? new PixelLabClient(),
    characterAssetStore: options.characterAssetStore ?? {
      findByNamesAndAgeRanges: async (requests) => {
        const { prisma } = await import("../../prisma");
        const characters = await prisma.character.findMany({
          where: {
            OR: requests.map(({ name, ageRange }) => ({
              name: { equals: name, mode: "insensitive" as const },
              ageRange: ageRange.toUpperCase().replaceAll(" ", "_") as never,
            })),
          },
          include: { asset: true },
          orderBy: { id: "asc" },
        });
        return characters.map(({ asset }) => asset);
      },
      findSpriteByNames: async (names) => {
        const { prisma } = await import("../../prisma");
        const characters = await prisma.character.findMany({
          where: { name: { in: names }, spriteAssetId: { not: null } },
          include: { spriteAsset: { include: { frames: true } } },
          orderBy: { id: "asc" },
        });
        return characters.flatMap(({ spriteAsset }) =>
          spriteAsset ? [spriteAsset] : [],
        );
      },
    },
  };
}

export type AgentContext = ReturnType<typeof createAgentContext>;

export type AgentRetryAttempt = {
  attempt: number;
  maxTries: number;
  previousError?: string;
};

export function appendRetryContext(instructions: string, previousError?: string): string {
  if (!previousError) return instructions;
  return `${instructions}\n\nPrevious attempt failure:\n${previousError}\n\nCorrect this failure before returning the next result.`;
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Parse provider wait hints such as "Please try again in 4.965s". */
export function parseRetryAfterMs(message: string): number | null {
  const match =
    message.match(/try again in\s+(\d+(?:\.\d+)?)\s*s/i) ??
    message.match(/retry after\s+(\d+(?:\.\d+)?)\s*(?:s|seconds?)/i) ??
    message.match(/retry-after[:\s]+(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.ceil(seconds * 1000);
}

export function isRateLimitError(message: string): boolean {
  return /rate limit|tokens per min|\bTPM\b|\bRPM\b|too many requests|\b429\b/i.test(message);
}

/** Delay before the next attempt. `attempt` is the failed attempt number (1-based). */
export function retryDelayMs(message: string, attempt: number): number {
  const parsed = parseRetryAfterMs(message);
  if (parsed != null) {
    // Small buffer so we do not immediately re-hit the same TPM window.
    return Math.min(
      Math.max(parsed + 500, ORCHESTRATOR_CONFIG.rateLimitBackoffMs),
      ORCHESTRATOR_CONFIG.rateLimitBackoffMaxMs,
    );
  }
  if (isRateLimitError(message)) {
    return Math.min(
      ORCHESTRATOR_CONFIG.rateLimitBackoffMs * 2 ** (attempt - 1),
      ORCHESTRATOR_CONFIG.rateLimitBackoffMaxMs,
    );
  }
  return Math.min(
    ORCHESTRATOR_CONFIG.retryBackoffMs * 2 ** (attempt - 1),
    ORCHESTRATOR_CONFIG.retryBackoffMaxMs,
  );
}

function formatWaitSeconds(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
}

export async function withAgentRetries<T>(
  context: AgentContext,
  agent: AgentName,
  operation: (attempt: AgentRetryAttempt) => Promise<T>,
): Promise<T> {
  let previousError: string | undefined;

  for (let attempt = 1; attempt <= context.maxTries; attempt += 1) {
    try {
      return await operation({
        attempt,
        maxTries: context.maxTries,
        previousError,
      });
    } catch (error) {
      if (context.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : "Unknown agent failure";
      const isLastAttempt = attempt === context.maxTries;
      if (isLastAttempt) {
        context.emitProgress({
          agent,
          phase: "agent",
          message: `${agent} attempt ${attempt}/${context.maxTries} failed: ${message}. No attempts left.`,
        });
        throw error;
      }

      const delayMs = retryDelayMs(message, attempt);
      context.emitProgress({
        agent,
        phase: "agent",
        message: `${agent} attempt ${attempt}/${context.maxTries} failed: ${message}. Waiting ${formatWaitSeconds(delayMs)}s before retry (${attempt + 1}/${context.maxTries})…`,
      });
      await sleep(delayMs, context.signal);
      previousError = message;
    }
  }

  throw new Error("Agent failed");
}
