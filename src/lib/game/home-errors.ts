/** Friendly home-2d error copy. Raw details stay in `console.error`. */

export const MAP_LOAD_ERROR_LABELS = [
  "a pipe suddenly burst — mopping up, back in a moment!",
  "the lights are flickering — rewiring things now, hang tight!",
  "a window's stuck — jimmying it open, just a sec!",
  "a raccoon wandered in — we're kindly escorting it back out!",
  "a shelf toppled over — tidying up before you come in!",
  "a bird got in through an open window — coaxing it back outside!",
] as const;

/** Non-map, non-NPC failures — including actor/LLM errors. */
export const BACKEND_ERROR_LABELS = [
  "the control panels are being recalibrated — back shortly!",
  "a few gears are grinding louder than usual — smoothing them out!",
  "the power core's running a bit hot — cooling it down now!",
  "crossed a few wires up on the bridge — untangling them now!",
] as const;

/** Star/NPC guests failed to load, or none are available. */
export const NPC_ERROR_LABELS = [
  "a meteor shower's lighting up the sky — everyone has stepped out to watch!",
  "the aurora's put on quite a show tonight — your guests wandered off to catch a glimpse!",
  "a bit of space weather outside — your visitors are waiting it out!",
  "seems quiet — your guests must be caught up elsewhere at the moment!",
  "all's calm, but no one's stopped by just yet — check back soon!",
  "your guests are off exploring another part of the ship for now — check back soon!",
  "you're passing through a stretch of space with spotty signal — hard to reach any visitor right now!",
] as const;

export function pickRandomLabel(labels: readonly string[]): string {
  return labels[Math.floor(Math.random() * labels.length)] ?? labels[0]!;
}
