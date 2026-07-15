export type AgentName =
  | "researcher"
  | "director"
  | "writer"
  | "artist";

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

export type ToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
};

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
};

export type GeneratedAssetEvent = {
  type: "character" | "collectible";
  name: string;
  assetId?: string;
  imageDataUrls: string[];
};

export type AgentExecutionResult<T> = {
  output: T;
  usage: UsageRecord[];
};
