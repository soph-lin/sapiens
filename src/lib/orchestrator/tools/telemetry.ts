import type { AgentName, RunUsage, UsageRecord } from "../types";

export class UsageCollector {
  private readonly records: UsageRecord[] = [];

  add(record: UsageRecord) {
    this.records.push(record);
  }

  addToolCall(agent: AgentName) {
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      if (this.records[index].agent === agent) {
        this.records[index].toolCalls += 1;
        return;
      }
    }
  }

  report(): RunUsage {
    const byAgent = {} as RunUsage["byAgent"];
    const total = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      startedAt: "",
      completedAt: "",
    };

    for (const record of this.records) {
      total.inputTokens += record.inputTokens;
      total.outputTokens += record.outputTokens;
      total.totalTokens += record.totalTokens;
      total.toolCalls += record.toolCalls;
      total.startedAt = total.startedAt || record.startedAt;
      total.completedAt = record.completedAt;

      const current = byAgent[record.agent];
      byAgent[record.agent] = {
        provider: record.provider,
        inputTokens: (current?.inputTokens ?? 0) + record.inputTokens,
        outputTokens: (current?.outputTokens ?? 0) + record.outputTokens,
        totalTokens: (current?.totalTokens ?? 0) + record.totalTokens,
        toolCalls: (current?.toolCalls ?? 0) + record.toolCalls,
        startedAt: current?.startedAt || record.startedAt,
        completedAt: record.completedAt,
      };
    }

    return { total, byAgent, records: [...this.records] };
  }
}
