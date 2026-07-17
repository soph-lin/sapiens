/** Shared time-of-day helpers for gameplay prompts and scheduling. */

export type DayPeriod = "morning" | "afternoon" | "evening" | "night";

export type MealPeriod = "breakfast" | "lunch" | "dinner" | "snack";

export type TimeOfDay = {
  hour: number;
  period: DayPeriod;
  meal: MealPeriod;
};

function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return 0;
  const wrapped = ((Math.floor(hour) % 24) + 24) % 24;
  return wrapped;
}

/** Map a 0–23 hour to a coarse day period. */
export function getDayPeriod(hour: number): DayPeriod {
  const h = clampHour(hour);
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

/**
 * Meal that fits the hour: breakfast → lunch → dinner → late snack.
 * Kitchen prompts should prefer this over a fixed "dinner".
 */
export function getMealPeriod(hour: number): MealPeriod {
  const h = clampHour(hour);
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 15 && h < 21) return "dinner";
  return "snack";
}

export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours();
  return {
    hour,
    period: getDayPeriod(hour),
    meal: getMealPeriod(hour),
  };
}
