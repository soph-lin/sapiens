import { ORCHESTRATOR_CONFIG } from "../orchestrator/config";
import type { ToolDefinition } from "../orchestrator/types";
import type {
  AgentClient,
  AgentGeneration,
  AgentGenerationRequest,
} from "./agent-client";

type AnthropicContentBlock = {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
};

type AnthropicResponse = {
  id?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  strict?: boolean;
};

function anthropicTools(input: AgentGenerationRequest, outputTool: AnthropicTool) {
  return [
    ...(input.tools ?? []).map((tool) => toolToAnthropic(tool)),
    outputTool,
  ];
}

function toolToAnthropic(tool: ToolDefinition): AnthropicTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
    strict: tool.strict,
  };
}

function traceResponse(response: AnthropicResponse) {
  return {
    id: response.id,
    stop_reason: response.stop_reason,
    content: response.content,
    usage: response.usage,
  };
}

function invalidNativeStructuredOutputMessage(response: AnthropicResponse): string {
  const lines = ["[invalid schema]"];
  if (response.stop_reason) {
    lines.push(`Claude stop reason: ${response.stop_reason}`);
  }
  return lines.join("\n");
}

export class AnthropicClient implements AgentClient {
  constructor(
    private readonly apiKey = process.env.ANTHROPIC_API_KEY,
    private readonly baseUrl = ORCHESTRATOR_CONFIG.anthropicBaseUrl,
  ) {}

  async generateJson<T>(input: AgentGenerationRequest): Promise<AgentGeneration<T>> {
    if (!this.apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const outputToolName = input.schema.name;
    const outputTool: AnthropicTool = {
      name: outputToolName,
      description: input.schema.description ?? "Return the requested structured result.",
      input_schema: input.schema.schema,
      strict: input.schema.strict,
    };
    const tools = input.nativeStructuredOutput
      ? (input.tools ?? []).map(toolToAnthropic)
      : anthropicTools(input, outputTool);
    const startedAt = new Date().toISOString();
    const messages: Array<Record<string, unknown>> = [
      { role: "user", content: input.prompt },
    ];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolCalls = 0;

    for (let round = 0; round < ORCHESTRATOR_CONFIG.maxToolRounds; round += 1) {
      input.progress?.({
        agent: input.agent,
        phase: "model",
        message:
          round === 0
            ? "Sending the request to the model…"
            : "Analyzing the gathered information…",
      });

      const forceOutput = !input.nativeStructuredOutput && (round > 0 || !input.tools?.length);
      const requestBody = input.nativeStructuredOutput
        ? {
            model: input.model,
            max_tokens: input.maxOutputTokens ?? ORCHESTRATOR_CONFIG.maxOutputTokens,
            system: input.instructions,
            messages,
            ...(tools.length ? { tools } : {}),
            output_config: {
              format: {
                type: "json_schema",
                schema: input.schema.schema,
              },
            },
          }
        : {
            model: input.model,
            max_tokens: input.maxOutputTokens ?? ORCHESTRATOR_CONFIG.maxOutputTokens,
            system: input.instructions,
            messages,
            tools,
            ...(forceOutput
              ? { tool_choice: { type: "tool", name: outputToolName } }
              : {}),
          };
      input.trace?.({ agent: input.agent, kind: "request", payload: requestBody });
      const response = await this.request<AnthropicResponse>(requestBody, input.signal);
      input.trace?.({
        agent: input.agent,
        kind: "response",
        payload: traceResponse(response),
      });

      totalInputTokens += response.usage?.input_tokens ?? 0;
      totalOutputTokens += response.usage?.output_tokens ?? 0;
      const content = response.content ?? [];
      if (input.nativeStructuredOutput) {
        const outputText = content.find(
          (block) => block.type === "text" && typeof block.text === "string",
        )?.text;
        if (outputText) {
          let output: T;
          try {
            output = JSON.parse(outputText) as T;
          } catch {
            throw new Error(
              invalidNativeStructuredOutputMessage(response),
            );
          }
          const completedAt = new Date().toISOString();
          const totalTokens = totalInputTokens + totalOutputTokens;
          const record = {
            agent: input.agent,
            provider: "anthropic",
            model: input.model,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens,
            toolCalls,
            startedAt,
            completedAt,
          } as const;
          input.usage.add(record);
          input.progress?.({
            agent: input.agent,
            phase: "model",
            message: "The model finished drafting the result.",
          });
          return { output, ...record };
        }
      }
      if (input.nativeStructuredOutput) {
        throw new Error(invalidNativeStructuredOutputMessage(response));
      }
      const outputBlock = content.find(
        (block) => block.type === "tool_use" && block.name === outputToolName,
      );
      if (outputBlock) {
        if (outputBlock.input === undefined) {
          throw new Error(`${input.agent} returned an empty structured output`);
        }
        const completedAt = new Date().toISOString();
        const totalTokens = totalInputTokens + totalOutputTokens;
        const record = {
          agent: input.agent,
          provider: "anthropic",
          model: input.model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens,
          toolCalls,
          startedAt,
          completedAt,
        } as const;
        input.usage.add(record);
        input.progress?.({
          agent: input.agent,
          phase: "model",
          message: "The model finished drafting the result.",
        });
        return {
          output: outputBlock.input as T,
          ...record,
        };
      }

      const calls = content.filter(
        (block): block is AnthropicContentBlock & { id: string; name: string } =>
          block.type === "tool_use" && Boolean(block.id && block.name),
      );
      if (!calls.length) {
        throw new Error(
          `${input.agent} returned text instead of structured output${response.stop_reason ? ` (stop_reason: ${response.stop_reason})` : ""}`,
        );
      }
      if (!input.handlers) {
        throw new Error(`${input.agent} requested tools without handlers`);
      }

      messages.push({ role: "assistant", content });
      const toolResults: Array<Record<string, unknown>> = [];
      for (const call of calls) {
        const handler = input.handlers[call.name];
        if (!handler) throw new Error(`No handler registered for ${call.name}`);
        toolCalls += 1;
        const argumentsJson = JSON.stringify(call.input ?? {});
        input.trace?.({
          agent: input.agent,
          kind: "tool_call",
          payload: { name: call.name, callId: call.id, arguments: argumentsJson },
        });
        const result = await handler(argumentsJson);
        input.trace?.({
          agent: input.agent,
          kind: "tool_result",
          payload: { name: call.name, callId: call.id, result },
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error(`${input.agent} exceeded the tool-call round limit`);
  }

  private async request<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey as string,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    const payload = (await response.json()) as T & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message || `Anthropic request failed: ${response.status}`);
    }
    return payload;
  }
}
