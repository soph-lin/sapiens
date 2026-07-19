/** Fixed UI label for visitor-note Starstream posts — not stored in content JSON. */
export const VISITOR_NOTE_HEADER = "Just wanted to share this:";

/** API error code when OpenAI Moderation blocks Starstream publish. */
export const TOXICITY_BLOCKED = "toxicity_blocked" as const;

/** Toast / popup copy shown when a Starstream publish is blocked. */
export const TOXICITY_RESUBMIT_MESSAGE = "Resubmit message." as const;
