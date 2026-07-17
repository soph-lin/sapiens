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
    status?: string;
    action?: unknown;
    results?: unknown[];
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
      }>;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

function webSearchQuery(input: unknown): string | undefined {
  if (typeof input === "string") {
    try {
      return webSearchQuery(JSON.parse(input) as unknown);
    } catch {
      return input;
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const record = input as { query?: unknown; queries?: unknown };
  if (typeof record.query === "string") return record.query;
  if (Array.isArray(record.queries) && typeof record.queries[0] === "string") {
    return record.queries[0];
  }
  return undefined;
}

function logWebSearch(agent: string, label: string, response: OpenAIResponse) {
  const attempts = (response.output ?? []).filter(
    (item) => item.type === "web_search_call" || item.name === "web_search",
  );
  const citationCount = responseCitations(response).length;

  if (attempts.length && agent === "actor") {
    console.info("Conducting web search...");
  }

  for (const attempt of attempts) {
    const query = webSearchQuery(attempt.action ?? attempt.arguments);
    console.info(
      `[${label}] attempts web search { query: ${JSON.stringify(query ?? "")} }`,
    );

    if (attempt.status === "failed") {
      console.info("Web search failed: search call failed");
      continue;
    }
    if (attempt.status && attempt.status !== "completed") {
      console.info(`Web search failed: ${attempt.status}`);
      continue;
    }

    const resultCount = Array.isArray(attempt.results)
      ? attempt.results.length
      : citationCount;
    console.info(`Web search succeeded with ${resultCount} results!`);
  }
}

function responseCitations(response: OpenAIResponse): Array<{ url: string; title?: string }> {
  const citations = (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .flatMap((item) => item.annotations ?? [])
    .filter(
      (annotation): annotation is { type: string; url: string; title?: string } =>
        annotation.type === "url_citation" && typeof annotation.url === "string",
    )
    .map(({ url, title }) => ({ url, title }));

  return Array.from(
    new Map(citations.map((citation) => [citation.url, citation])).values(),
  );
}

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
    const citations = new Map<string, { url: string; title?: string }>();
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
        ...(input.tools?.length ? { tools: input.tools } : {}),
        ...(input.maxOutputTokens
          ? { max_output_tokens: input.maxOutputTokens }
          : {}),
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
      logWebSearch(input.agent, input.label?.trim() || input.agent, response);
      for (const citation of responseCitations(response)) {
        citations.set(citation.url, citation);
      }
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
          citations: Array.from(citations.values()),
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
