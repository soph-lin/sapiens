import { ORCHESTRATOR_CONFIG } from "../orchestrator/config";
import type { UsageRecord } from "../orchestrator/types";
import type {
  AgentClient,
  AgentGeneration,
  AgentGenerationRequest,
} from "./agent-client";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

function traceResponse(response: OpenAIResponse) {
  return {
    output_text: response.output_text,
    output: (response.output ?? []).filter((item) => item.type !== "reasoning"),
    usage: response.usage,
  };
}

function responseText(response: OpenAIResponse): string | undefined {
  if (response.output_text) return response.output_text;

  const text = (response.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text)
    .filter((value): value is string => Boolean(value))
    .join("");

  return text || undefined;
}

export class OpenAIClient implements AgentClient {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly baseUrl = ORCHESTRATOR_CONFIG.openAiBaseUrl,
  ) {}

  async generateJson<T>(input: AgentGenerationRequest): Promise<AgentGeneration<T>> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    let requestInput: unknown = input.prompt;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let toolCalls = 0;
    const startedAt = new Date().toISOString();

    for (let round = 0; round < ORCHESTRATOR_CONFIG.maxToolRounds; round += 1) {
      input.progress?.({
        agent: input.agent,
        phase: "model",
        message:
          round === 0
            ? "Sending the request to the model…"
            : "Analyzing the gathered information…",
      });
      const requestBody = {
        model: input.model,
        instructions: input.instructions,
        input: requestInput,
        tools: input.tools,
        text: {
          format: {
            type: "json_schema",
            name: input.schema.name,
            description: input.schema.description,
            strict: input.schema.strict ?? false,
            schema: input.schema.schema,
          },
        },
      };
      input.trace?.({ agent: input.agent, kind: "request", payload: requestBody });
      const response = await this.request<OpenAIResponse>(requestBody, input.signal);
      input.trace?.({
        agent: input.agent,
        kind: "response",
        payload: traceResponse(response),
      });

      const responseUsage = response.usage;
      totalInputTokens += responseUsage?.input_tokens ?? 0;
      totalOutputTokens += responseUsage?.output_tokens ?? 0;
      totalTokens += responseUsage?.total_tokens ?? 0;

      const calls = (response.output ?? []).filter(
        (item) => item.type === "function_call",
      );

      if (calls.length > 0) {
        input.progress?.({
          agent: input.agent,
          phase: "model",
          message: "The model requested additional information…",
        });
      }

      if (calls.length === 0) {
        const outputText = responseText(response);
        if (!outputText) throw new Error(`${input.agent} returned no final text output`);
        input.progress?.({
          agent: input.agent,
          phase: "model",
          message: "The model finished drafting the result.",
        });

        const record: UsageRecord = {
          agent: input.agent,
          provider: "openai",
          model: input.model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalTokens || totalInputTokens + totalOutputTokens,
          toolCalls,
          startedAt,
          completedAt: new Date().toISOString(),
        };
        input.usage.add(record);
        return {
          output: JSON.parse(outputText) as T,
          provider: record.provider,
          model: record.model ?? input.model,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          totalTokens: record.totalTokens,
          toolCalls: record.toolCalls,
          startedAt: record.startedAt,
          completedAt: record.completedAt,
        };
      }

      if (!input.handlers) {
        throw new Error(`${input.agent} requested tools without handlers`);
      }

      const toolOutputs: Array<Record<string, string>> = [];
      for (const call of calls) {
        if (!call.name || !call.call_id || call.arguments === undefined) {
          throw new Error("OpenAI returned an invalid function call");
        }
        const handler = input.handlers[call.name];
        if (!handler) throw new Error(`No handler registered for ${call.name}`);
        toolCalls += 1;
        input.trace?.({
          agent: input.agent,
          kind: "tool_call",
          payload: { name: call.name, callId: call.call_id, arguments: call.arguments },
        });
        const result = await handler(call.arguments);
        input.trace?.({
          agent: input.agent,
          kind: "tool_result",
          payload: { name: call.name, callId: call.call_id, result },
        });
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
      }

      requestInput = [
        ...((response.output ?? []) as unknown[]),
        ...toolOutputs,
      ];
    }

    throw new Error(`${input.agent} exceeded the tool-call round limit`);
  }

  private async request<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    const payload = (await response.json()) as T & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message || `OpenAI request failed: ${response.status}`);
    }
    return payload;
  }
}
