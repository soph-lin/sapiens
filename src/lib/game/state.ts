import type { Presentable, State } from "@/lib/dialogue";

/**
 * Thin shared snapshot so React UI and (later) Phaser can read the same
 * dialogue-driven game values without owning the engine.
 */
export type GameSnapshot = {
  scenarioId: string;
  presentable: Presentable | null;
  state: State | null;
  ended: boolean;
};

type Listener = (snapshot: GameSnapshot) => void;

const EMPTY: GameSnapshot = {
  scenarioId: "",
  presentable: null,
  state: null,
  ended: false,
};

let snapshot: GameSnapshot = EMPTY;
const listeners = new Set<Listener>();

export function getGameSnapshot(): GameSnapshot {
  return snapshot;
}

export function setGameSnapshot(next: GameSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}

export function subscribeGameSnapshot(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetGameSnapshot(): void {
  snapshot = EMPTY;
  for (const listener of listeners) listener(snapshot);
}
