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
  researcher: {
    provider: "openai",
    model: "gpt-5.6-luna",
    promptFile: "RESEARCHER.md",
  },
  director: {
    provider: "anthropic",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    promptFile: "DIRECTOR.md",
  },
  writer: {
    provider: "anthropic",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
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
    provider: "openai",
    model: "gpt-5.6-luna",
    promptFile: "ACTOR.md",
  },
};

export const ORCHESTRATOR_CONFIG = {
  openAiBaseUrl: "https://api.openai.com/v1",
  anthropicBaseUrl: "https://api.anthropic.com",
  wikipediaBaseUrl: "https://en.wikipedia.org",
  pixelLabBaseUrl: "https://api.pixellab.ai/v2",
  maxToolRounds: 4,
  maxOutputTokens: 32000,
  maxTries: 3,
};
