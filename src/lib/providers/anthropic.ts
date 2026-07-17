import { ORCHESTRATOR_CONFIG } from "../orchestrator/config";
import type {
  AnthropicWebSearchToolDefinition,
  FunctionToolDefinition,
} from "../orchestrator/types";
import type {
  AgentClient,
  AgentGeneration,
  AgentGenerationRequest,
} from "./agent-client";

type AnthropicWebSearchResult = {
  type?: string;
  url?: string;
  title?: string;
  error_code?: string;
};

type AnthropicContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  citations?: Array<{ url?: string; title?: string }>;
  content?: AnthropicWebSearchResult[] | AnthropicWebSearchResult;
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

function isAnthropicWebSearchTool(
  tool: AnthropicWebSearchToolDefinition,
): boolean {
  return tool.type === "web_search_20250305" && tool.name === "web_search";
}

function anthropicTools(input: AgentGenerationRequest, outputTool: AnthropicTool) {
  return [
    ...(input.tools ?? [])
      .filter((tool): tool is FunctionToolDefinition => tool.type === "function")
      .map((tool) => toolToAnthropic(tool)),
    ...(input.tools ?? []).filter(
      (tool): tool is AnthropicWebSearchToolDefinition =>
        tool.type === "web_search_20250305" && isAnthropicWebSearchTool(tool),
    ),
    outputTool,
  ];
}

function responseCitations(content: AnthropicContentBlock[]): Array<{ url: string; title?: string }> {
  const citations = content.flatMap((block) => {
    const toolResults =
      block.type === "web_search_tool_result" && Array.isArray(block.content)
        ? block.content
        : [];
    return [...(block.citations ?? []), ...toolResults];
  });
  return Array.from(
    new Map(
      citations
        .filter((citation): citation is { url: string; title?: string } => Boolean(citation.url))
        .map((citation) => [citation.url, { url: citation.url, title: citation.title }]),
    ).values(),
  );
}

function webSearchQuery(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const query = (input as { query?: unknown }).query;
  return typeof query === "string" ? query : undefined;
}

function logWebSearch(agent: string, label: string, content: AnthropicContentBlock[]) {
  const attempts = content.filter((block) => block.type === "server_tool_use" && block.name === "web_search");
  const resultBlocks = content.filter((block) => block.type === "web_search_tool_result");
  const usedResultIds = new Set<string>();

  if (attempts.length && agent === "actor") {
    console.info("Conducting web search...");
  }

  for (const attempt of attempts) {
    const query = webSearchQuery(attempt.input);
    console.info(
      `[${label}] attempts web search { query: ${JSON.stringify(query ?? "")} }`,
    );

    const matchedIndex = resultBlocks.findIndex((block) => {
      if (usedResultIds.has(block.tool_use_id ?? block.id ?? "")) return false;
      if (attempt.id && block.tool_use_id) return block.tool_use_id === attempt.id;
      return true;
    });
    const resultBlock = matchedIndex >= 0 ? resultBlocks[matchedIndex] : undefined;
    if (resultBlock) {
      usedResultIds.add(resultBlock.tool_use_id ?? resultBlock.id ?? String(matchedIndex));
    }

    if (!resultBlock) {
      console.info("Web search failed: no result returned");
      continue;
    }

    const resultContent = resultBlock.content;
    if (
      resultContent &&
      !Array.isArray(resultContent) &&
      resultContent.type === "web_search_tool_result_error"
    ) {
      console.info(`Web search failed: ${resultContent.error_code ?? "unknown error"}`);
      continue;
    }

    const results = (Array.isArray(resultContent) ? resultContent : [])
      .filter((result) => result.type === "web_search_result" && result.url);
    console.info(`Web search succeeded with ${results.length} results!`);
  }
}

function toolToAnthropic(tool: FunctionToolDefinition): AnthropicTool {
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

function maxTokensMessage(agent: string): string {
  return `${agent} reached max output tokens before finishing`;
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
      ? (input.tools ?? [])
          .filter((tool): tool is FunctionToolDefinition => tool.type === "function")
          .map(toolToAnthropic)
      : anthropicTools(input, outputTool);
    const startedAt = new Date().toISOString();
    const messages: Array<Record<string, unknown>> = [
      { role: "user", content: input.prompt },
    ];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolCalls = 0;
    const citations = new Map<string, { url: string; title?: string }>();

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
      const content = response.content ?? [];
      logWebSearch(input.agent, input.label?.trim() || input.agent, content);
      for (const citation of responseCitations(content)) citations.set(citation.url, citation);
      input.trace?.({
        agent: input.agent,
        kind: "response",
        payload: traceResponse(response),
      });

      totalInputTokens += response.usage?.input_tokens ?? 0;
      totalOutputTokens += response.usage?.output_tokens ?? 0;
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content });
        continue;
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error(maxTokensMessage(input.agent));
      }
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
          return { output, citations: Array.from(citations.values()), ...record };
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
          citations: Array.from(citations.values()),
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
