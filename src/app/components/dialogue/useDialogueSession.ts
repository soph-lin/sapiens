"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  DialogueEngine,
  type DialogueHistoryEntry,
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
      revealKey: 0,
    });
  }

  const { engine, view, state, hasStats, dialogueHistory, revealKey } = session;
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

  const publish = (nextEngine: DialogueEngine, selectedChoice?: string) => {
    const nextView = nextEngine.present();
    const nextState = nextEngine.getState();
    setSession((prev) => ({
      ...prev,
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
    const before = engine.getState();
    engine.advance();
    toastStateDiff(before, engine.getState());
    publish(engine);
  };

  const choose = (index: number) => {
    if (engine.isEnded()) return;
    const before = engine.getState();
    const current = engine.present();
    const selectedChoice = current.kind === "choice"
      ? current.choices.find((choice) => choice.index === index)?.label
      : undefined;
    engine.choose(index);
    toastStateDiff(before, engine.getState());
    publish(engine, selectedChoice);
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
      revealKey: prev.revealKey + 1,
    }));
  };

  const handleContinueIntent = useEffectEvent(() => {
    if (!typingGateRef.current.done) {
      typingGateRef.current.skip();
      return;
    }
    advance();
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      if (document.body.dataset.cocoLayerOpen === "true") return;
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      if (el.closest('[role="option"]')) return;
      event.preventDefault();
      event.stopPropagation();
      handleContinueIntent();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return {
    view,
    state,
    hasStats,
    revealKey,
    typingGateRef,
    advance,
    choose,
    dialogueHistory,
    restart,
  };
}
