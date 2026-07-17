import type { AgentName } from "./types";

export type ConfiguredAgentName = AgentName;

export type StoryLimits = {
  maxTurns: number;
  maxCharacters: number;
};

export type DirectorLimits = StoryLimits;

export type AgentProvider = "openai" | "anthropic";

export const DEFAULT_STORY_LIMITS: StoryLimits = {
  maxTurns: 10,
  maxCharacters: 3,
};

export const DEFAULT_DIRECTOR_LIMITS = DEFAULT_STORY_LIMITS;

export const AGENT_CONFIG: Record<ConfiguredAgentName, {
  provider: AgentProvider;
  model: string;
  promptFile: string;
}> = {
  curator: {
    provider: "openai",
    model: "gpt-5.6-luna",
    promptFile: "CURATOR.md",
  },
  researcher: {
    provider: "openai",
    model: "gpt-5.6-luna",
    promptFile: "RESEARCHER.md",
  },
  director: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    promptFile: "DIRECTOR.md",
  },
  writer: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    promptFile: "WRITER.md",
  },
  artist: {
    provider: "openai",
    model: "gpt-5.6-luna",
    promptFile: "ARTIST.md",
  },
  coco: {
    provider: "openai",
    model: "gpt-5.6-luna",
    promptFile: "COCO.md",
  },
  actor: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    promptFile: "HISTORIAN.md",
  },
};

export const ORCHESTRATOR_CONFIG = {
  openAiBaseUrl: "https://api.openai.com/v1",
  anthropicBaseUrl: "https://api.anthropic.com",
  wikipediaBaseUrl: "https://en.wikipedia.org",
  pixelLabBaseUrl: "https://api.pixellab.ai/v2",
  maxToolRounds: 4,
  maxOutputTokens: 32000,
  /** Max plain-text characters returned per oversized Wikipedia section chunk. */
  pageChunkChars: 8000,
  maxTries: 3,
  /** Base delay for non-rate-limit retries; doubles each attempt. */
  retryBackoffMs: 1000,
  /** Cap for non-rate-limit retry delays. */
  retryBackoffMaxMs: 15000,
  /** Base delay when a rate limit is detected but no wait hint is present. */
  rateLimitBackoffMs: 5000,
  /** Cap for rate-limit retry delays (including provider-suggested waits). */
  rateLimitBackoffMaxMs: 60000,
  REQUIRED_SOURCES: 3,
  MAX_FOLLOWUP_SOURCES: 3,
};
