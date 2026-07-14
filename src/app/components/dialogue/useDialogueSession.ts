"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import toast from "react-hot-toast";
import { DialogueEngine, STAT_KEYS, type State } from "@/lib/dialogue";
import { setGameSnapshot } from "@/lib/game/state";
import type { TypingGateRef } from "./typewriter";

const STAT_LABELS: Record<(typeof STAT_KEYS)[number], string> = {
  reputation: "Reputation",
  evidence: "Evidence",
  safety: "Safety",
};

function humanizeFlag(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toastStateDiff(before: State, after: State): void {
  for (const key of STAT_KEYS) {
    const prev = before[key];
    const next = after[key];
    if (prev === undefined || next === undefined) continue;
    const delta = next - prev;
    if (delta === 0) continue;
    const sign = delta > 0 ? "+" : "−";
    toast(`${STAT_LABELS[key]} ${sign}${Math.abs(delta)}`);
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
  return {
    engine,
    view: engine.present(),
    state: engine.getState(),
    hasStats: engine.hasStats(),
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
      revealKey: 0,
    });
  }

  const { engine, view, state, hasStats, revealKey } = session;
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

  const publish = (nextEngine: DialogueEngine) => {
    setSession((prev) => ({
      ...prev,
      engine: nextEngine,
      view: nextEngine.present(),
      state: nextEngine.getState(),
      hasStats: nextEngine.hasStats(),
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
    engine.choose(index);
    toastStateDiff(before, engine.getState());
    publish(engine);
  };

  const restart = () => {
    publish(bootEngine(story).engine);
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
    restart,
  };
}
