import { ORCHESTRATOR_CONFIG } from "@/lib/orchestrator/config";

/** OpenAI Moderation gate for user-authored text. Fail closed on any uncertainty. */

export type ToxicityCheckResult = {
  allowed: boolean;
};

type ModerationResponse = {
  results?: Array<{
    flagged?: boolean;
  }>;
};

const MODERATION_MODEL = "omni-moderation-latest";

/**
 * Returns `{ allowed: true }` only when OpenAI Moderation successfully reports
 * the text as not flagged. Missing key, network/API errors, or flagged content
 * all yield `{ allowed: false }`.
 */
export async function checkToxicity(text: string): Promise<ToxicityCheckResult> {
  const input = text.trim();
  if (!input) return { allowed: true };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { allowed: false };

  try {
    const response = await fetch(`${ORCHESTRATOR_CONFIG.openAiBaseUrl}/moderations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODERATION_MODEL,
        input,
      }),
    });

    const payload = (await response.json()) as ModerationResponse;
    if (!response.ok) return { allowed: false };

    const result = payload.results?.[0];
    if (!result || typeof result.flagged !== "boolean") return { allowed: false };

    return { allowed: !result.flagged };
  } catch {
    return { allowed: false };
  }
}
