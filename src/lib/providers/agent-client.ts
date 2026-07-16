import type {
  AgentName,
  AgentProgressEvent,
  AgentTraceEvent,
  ToolDefinition,
  ToolHandler,
} from "../orchestrator/types";
import type { UsageCollector } from "../orchestrator/telemetry";

export type JsonSchema = {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type AgentGeneration<T> = {
  output: T;
  citations?: Array<{ url: string; title?: string }>;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  startedAt: string;
  completedAt: string;
};

export type AgentGenerationRequest = {
  agent: AgentName;
  model: string;
  instructions: string;
  prompt: string;
  schema: JsonSchema;
  /** Use a provider-native JSON schema response instead of an output tool when supported. */
  nativeStructuredOutput?: boolean;
  /** Maximum generated tokens for providers that support a request-level output cap. */
  maxOutputTokens?: number;
  signal?: AbortSignal;
  tools?: ToolDefinition[];
  handlers?: Record<string, ToolHandler>;
  usage: UsageCollector;
  trace?: (event: AgentTraceEvent) => void;
  progress?: (event: AgentProgressEvent) => void;
};

export interface AgentClient {
  generateJson<T>(input: AgentGenerationRequest): Promise<AgentGeneration<T>>;
}
