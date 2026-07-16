import { AnthropicClient } from "../providers/anthropic";
import { OpenAIClient } from "../providers/openai";
import type { AgentClient } from "../providers/agent-client";
import { PixelLabClient } from "../providers/pixellab";
import { WikipediaClient } from "../providers/wikipedia";
import {
  AGENT_CONFIG,
  DEFAULT_STORY_LIMITS,
  ORCHESTRATOR_CONFIG,
  type StoryLimits,
} from "./config";
import { UsageCollector } from "./telemetry";
import type {
  AgentName,
  AgentProgressEvent,
  AgentTraceEvent,
  GeneratedAssetEvent,
} from "./types";

export type ExistingCharacterAsset = {
  id: string;
  type: string;
  name: string;
  mimeType: string;
  data: Uint8Array;
  metadata: unknown;
  createdAt: Date;
  frames?: Array<{
    frameKey: string;
    mimeType: string;
    data: Uint8Array;
    metadata: unknown;
  }>;
};

export type CharacterAssetStore = {
  findByNames: (names: string[]) => Promise<ExistingCharacterAsset[]>;
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
      findByNames: async (names) => {
        const { prisma } = await import("../prisma");
        const characters = await prisma.character.findMany({
          where: { name: { in: names } },
          include: { asset: true },
          orderBy: { id: "asc" },
        });
        return characters.map(({ asset }) => asset);
      },
      findSpriteByNames: async (names) => {
        const { prisma } = await import("../prisma");
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
      context.emitProgress({
        agent,
        phase: "agent",
        message: isLastAttempt
          ? `${agent} attempt ${attempt}/${context.maxTries} failed: ${message}. No attempts left.`
          : `${agent} attempt ${attempt}/${context.maxTries} failed: ${message}. Retrying (${attempt + 1}/${context.maxTries})…`,
      });
      if (isLastAttempt) throw error;
      previousError = message;
    }
  }

  throw new Error("Agent failed");
}
