"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  DialogueEngine,
  type DialogueHistoryEntry,
  type EngineSnapshot,
  type Presentable,
  type State,
} from "@/lib/dialogue";
import { setGameSnapshot } from "@/lib/game/state";
import type { TypingGateRef } from "./typewriter";

function humanizeStatKey(key: string): string {
  return key
    .split(/[_.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizeFlag(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toastStateDiff(before: State, after: State): void {
  const statKeys = new Set([
    ...Object.keys(before.stats),
    ...Object.keys(after.stats),
  ]);
  for (const key of statKeys) {
    const prev = before.stats[key] ?? 0;
    const next = after.stats[key] ?? 0;
    const delta = next - prev;
    if (delta === 0) continue;
    const sign = delta > 0 ? "+" : "−";
    toast(`${humanizeStatKey(key)} ${sign}${Math.abs(delta)}`);
  }

  const flagKeys = new Set([
    ...Object.keys(before.flags),
    ...Object.keys(after.flags),
  ]);
  for (const key of flagKeys) {
    const prev = before.flags[key] ?? false;
    const next = after.flags[key] ?? false;
    if (prev === next) continue;
    toast(`${humanizeFlag(key)} ${next ? "gained" : "lost"}`);
  }
}

/** A past dialogue beat captured so the player can step back into it. */
type PastEntry = {
  engineSnapshot: EngineSnapshot;
  view: Presentable;
  state: State;
  hasStats: boolean;
  dialogueHistory: DialogueHistoryEntry[];
};

function bootEngine(story: unknown) {
  const engine = new DialogueEngine(story);
  const view = engine.present();
  const state = engine.getState();
  return {
    engine,
    view,
    state,
    hasStats: engine.hasStats(),
    dialogueHistory: [historyEntry(view, state)],
  };
}

function historyEntry(view: Presentable, state: State): DialogueHistoryEntry {
  if (view.kind === "choice") {
    return {
      nodeId: view.id,
      kind: view.kind,
      text: view.prompt ?? "What do you do?",
      choices: view.choices.map((choice) => choice.label),
      state,
    };
  }

  if (view.kind === "end") {
    return {
      nodeId: view.id,
      kind: view.kind,
      title: view.title,
      text: view.text,
      state,
    };
  }

  return {
    nodeId: view.id,
    kind: view.kind,
    speaker: view.speaker,
    text: view.text,
    state,
  };
}

export function useDialogueSession({
  scenarioId,
  story,
}: {
  scenarioId: string;
  story: unknown;
}) {
  const [session, setSession] = useState(() => {
    const boot = bootEngine(story);
    return {
      story,
      scenarioId,
      engine: boot.engine,
      view: boot.view,
      state: boot.state,
      hasStats: boot.hasStats,
      dialogueHistory: boot.dialogueHistory,
      past: [] as PastEntry[],
      revealKey: 0,
    };
  });

  if (session.story !== story || session.scenarioId !== scenarioId) {
    const boot = bootEngine(story);
    setSession({
      story,
      scenarioId,
      engine: boot.engine,
      view: boot.view,
      state: boot.state,
      hasStats: boot.hasStats,
      dialogueHistory: boot.dialogueHistory,
      past: [],
      revealKey: 0,
    });
  }

  const { engine, view, state, hasStats, dialogueHistory, past, revealKey } =
    session;
  const typingGateRef: TypingGateRef = useRef({
    done: true,
    skip: () => {},
  });

  useEffect(() => {
    setGameSnapshot({
      scenarioId,
      presentable: view,
      state,
      ended: engine.isEnded(),
    });
  }, [scenarioId, view, state, revealKey, engine]);

  const publish = (
    nextEngine: DialogueEngine,
    prevSnapshot: EngineSnapshot,
    selectedChoice?: string,
  ) => {
    const nextView = nextEngine.present();
    const nextState = nextEngine.getState();
    setSession((prev) => ({
      ...prev,
      past: [
        ...prev.past,
        {
          engineSnapshot: prevSnapshot,
          view: prev.view,
          state: prev.state,
          hasStats: prev.hasStats,
          dialogueHistory: prev.dialogueHistory,
        },
      ],
      engine: nextEngine,
      view: nextView,
      state: nextState,
      hasStats: nextEngine.hasStats(),
      dialogueHistory: [
        ...prev.dialogueHistory.map((entry, index) =>
          index === prev.dialogueHistory.length - 1 && selectedChoice
            ? { ...entry, selectedChoice }
            : entry,
        ),
        historyEntry(nextView, nextState),
      ],
      revealKey: prev.revealKey + 1,
    }));
  };

  const advance = () => {
    if (engine.isEnded()) return;
    const current = engine.present();
    if (current.kind !== "text" || !current.canAdvance) return;
    const snapshot = engine.getSnapshot();
    const before = engine.getState();
    engine.advance();
    toastStateDiff(before, engine.getState());
    publish(engine, snapshot);
  };

  const choose = (index: number) => {
    if (engine.isEnded()) return;
    const snapshot = engine.getSnapshot();
    const before = engine.getState();
    const current = engine.present();
    const selectedChoice = current.kind === "choice"
      ? current.choices.find((choice) => choice.index === index)?.label
      : undefined;
    engine.choose(index);
    toastStateDiff(before, engine.getState());
    publish(engine, snapshot, selectedChoice);
  };

  const canGoBack = past.length > 0;

  const back = () => {
    if (session.past.length === 0) return;
    const previous = session.past[session.past.length - 1];
    engine.restore(previous.engineSnapshot);
    setSession((prev) => ({
      ...prev,
      past: prev.past.slice(0, -1),
      view: previous.view,
      state: previous.state,
      hasStats: previous.hasStats,
      dialogueHistory: previous.dialogueHistory,
      revealKey: prev.revealKey + 1,
    }));
  };

  const restart = () => {
    const boot = bootEngine(story);
    setSession((prev) => ({
      ...prev,
      engine: boot.engine,
      view: boot.view,
      state: boot.state,
      hasStats: boot.hasStats,
      dialogueHistory: boot.dialogueHistory,
      past: [],
      revealKey: prev.revealKey + 1,
    }));
  };

  return {
    view,
    state,
    hasStats,
    revealKey,
    typingGateRef,
    advance,
    choose,
    back,
    canGoBack,
    dialogueHistory,
    restart,
  };
}
