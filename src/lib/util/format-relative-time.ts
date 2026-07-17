/** Shared display helpers for compact relative/absolute timestamps. */

const MONTHS_ABBR = [
  "Jan.",
  "Feb.",
  "Mar.",
  "Apr.",
  "May",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sep.",
  "Oct.",
  "Nov.",
  "Dec.",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Use relative phrasing while the event is still within this window. */
const RELATIVE_WINDOW_MS = 7 * DAY_MS;

/**
 * Short starstream-style time: "3 min ago" / "Aug. 4" / "Aug. 4, 2011".
 * Falls back to the original string when it is not a parseable date.
 */
export function formatRelativeTime(
  value: string,
  now: Date = new Date(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  if (elapsedMs < RELATIVE_WINDOW_MS) {
    const seconds = Math.floor(elapsedMs / 1000);
    if (seconds < 60) {
      const count = Math.max(1, seconds);
      return `${count} sec ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }

  const month = MONTHS_ABBR[date.getMonth()] ?? "Jan.";
  const day = date.getDate();
  if (date.getFullYear() === now.getFullYear()) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${date.getFullYear()}`;
}
