/** Greeting modes for map NPC actor dialogue. */

export const FIRST_GREETING_MODES = [
  "notice_setting",
  "reference_period",
  "ask_what_brought_them",
  "mid_task",
] as const;

export type FirstGreetingMode = (typeof FIRST_GREETING_MODES)[number];

const GREETING_QUESTIONS: Record<FirstGreetingMode, string> = {
  notice_setting:
    "The learner has just approached you. Open with a brief greeting that notices the setting or time of day.",
  reference_period:
    "The learner has just approached you. Open with a brief greeting that nods to your historical period, era, or the world you knew.",
  ask_what_brought_them:
    "The learner has just approached you. Open with a brief greeting that asks what brought them here.",
  mid_task:
    "The learner has just approached you. Open with a brief, slightly preoccupied mid-task greeting.",
};

export function isFirstGreetingMode(value: unknown): value is FirstGreetingMode {
  return (
    typeof value === "string" &&
    (FIRST_GREETING_MODES as readonly string[]).includes(value)
  );
}

export function pickFirstGreetingMode(
  random = Math.random,
): FirstGreetingMode {
  const index = Math.floor(random() * FIRST_GREETING_MODES.length);
  return FIRST_GREETING_MODES[index] ?? FIRST_GREETING_MODES[0];
}

export function firstGreetingQuestion(mode: FirstGreetingMode): string {
  return GREETING_QUESTIONS[mode];
}

export function returningGreetingQuestion(): string {
  return "The learner has returned after a prior conversation. Acknowledge their return briefly in your voice.";
}
