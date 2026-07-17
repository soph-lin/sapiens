export type AgentName =
  | "curator"
  | "researcher"
  | "director"
  | "writer"
  | "artist"
  | "coco"
  | "actor";

export type UsageRecord = {
  agent: AgentName;
  provider: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  startedAt: string;
  completedAt: string;
};

export type RunUsage = {
  total: Omit<UsageRecord, "agent" | "provider" | "model">;
  byAgent: Record<AgentName, Omit<UsageRecord, "agent">>;
  records: UsageRecord[];
};

export type FunctionToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
};

export type BuiltInToolDefinition = {
  /** A provider-native Responses API tool, such as OpenAI web search. */
  type: "web_search";
};

export type AnthropicWebSearchToolDefinition = {
  /** Anthropic's server-side web search tool. */
  type: "web_search_20250305";
  name: "web_search";
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
};

export type ToolDefinition =
  | FunctionToolDefinition
  | BuiltInToolDefinition
  | AnthropicWebSearchToolDefinition;

export type ToolHandler = (argumentsJson: string) => Promise<unknown>;

export type AgentTraceEvent = {
  agent: AgentName;
  kind: "request" | "response" | "tool_call" | "tool_result";
  payload: unknown;
};

export type AgentProgressEvent = {
  agent: AgentName;
  phase: "agent" | "model" | "tool";
  message: string;
  tool?: string;
  details?: Record<string, unknown>;
};

export type GeneratedAssetEvent = {
  type: "character" | "character_sprite" | "collectible";
  name: string;
  assetId?: string;
  imageDataUrls: string[];
  frames?: Array<{ frameKey: string; dataUrl: string }>;
  metadata?: unknown;
  ageRange?: string;
};

export type GeneratedAssetFrame = {
  frameKey: string;
  dataUrl: string;
};

export type AgentExecutionResult<T> = {
  output: T;
  usage: UsageRecord[];
};
