"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";
import toast, { Toaster } from "react-hot-toast";
import { DialogueEngine, type State } from "@/dialogue";
import { setGameSnapshot } from "@/game/state";

type DialoguePanelProps = {
  scenarioId: string;
  story: unknown;
  title?: string;
  subtitle?: string;
  /** Optional decorative braille / monospace scene above the dialogue. */
  atmosphereArt?: string;
};

const CHAR_MS = 18;
const PUNCT_PAUSE_MS = 90;

const STAT_LABELS: Record<"reputation" | "evidence" | "safety", string> = {
  reputation: "Reputation",
  evidence: "Evidence",
  safety: "Safety",
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function humanizeFlag(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toastStateDiff(before: State, after: State): void {
  for (const key of ["reputation", "evidence", "safety"] as const) {
    const delta = after[key] - before[key];
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

function useTypewriter(text: string, enabled = true) {
  const instant = !enabled || text.length === 0 || prefersReducedMotion();
  const [visibleLength, setVisibleLength] = useState(() =>
    instant ? text.length : 0,
  );
  const [done, setDone] = useState(() => instant);
  const [resetKey, setResetKey] = useState({ text, enabled });
  const skippedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (text !== resetKey.text || enabled !== resetKey.enabled) {
    setResetKey({ text, enabled });
    const nextInstant =
      !enabled || text.length === 0 || prefersReducedMotion();
    setVisibleLength(nextInstant ? text.length : 0);
    setDone(nextInstant);
  }

  useEffect(() => {
    skippedRef.current = false;

    if (!enabled || prefersReducedMotion() || text.length === 0) {
      return;
    }

    let index = 0;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const tick = () => {
      if (skippedRef.current) return;
      index += 1;
      setVisibleLength(index);
      if (index >= text.length) {
        setDone(true);
        timerRef.current = null;
        return;
      }
      const ch = text[index - 1] ?? "";
      const delay =
        ch === "." || ch === "!" || ch === "?" || ch === "—" || ch === ","
          ? CHAR_MS + PUNCT_PAUSE_MS
          : CHAR_MS;
      timerRef.current = setTimeout(tick, delay);
    };

    timerRef.current = setTimeout(tick, CHAR_MS);
    return clearTimer;
  }, [text, enabled]);

  const skip = () => {
    skippedRef.current = true;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisibleLength(text.length);
    setDone(true);
  };

  return {
    displayed: text.slice(0, visibleLength),
    done,
    skip,
  };
}

function Meter({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    let raf = 0;

    if (prefersReducedMotion()) {
      raf = requestAnimationFrame(() => {
        shownRef.current = value;
        setShown(value);
      });
      return () => cancelAnimationFrame(raf);
    }

    const from = shownRef.current;
    const to = value;
    if (Math.abs(from - to) < 0.001) {
      raf = requestAnimationFrame(() => {
        shownRef.current = to;
        setShown(to);
      });
      return () => cancelAnimationFrame(raf);
    }

    const delta = Math.abs(to - from);
    const duration = Math.min(1100, 340 + delta * 50);
    const start = performance.now();
    const easeOut = (t: number) => 1 - (1 - t) ** 3;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = from + (to - from) * easeOut(t);
      shownRef.current = next;
      setShown(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      shownRef.current = to;
      setShown(to);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const clamped = Math.max(0, Math.min(max, shown));
  const width = `${(clamped / max) * 100}%`;
  const display = Math.round(shown);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px] tracking-[0.14em] uppercase text-neutral-500">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-800">{display}</span>
      </div>
      <div className="h-px w-full overflow-hidden bg-neutral-200">
        <div
          className="h-px origin-left bg-neutral-900 will-change-[width]"
          style={{ width }}
        />
      </div>
    </div>
  );
}

function bootEngine(story: unknown) {
  const engine = new DialogueEngine(story);
  return {
    engine,
    view: engine.present(),
    state: engine.getState(),
  };
}

export function DialoguePanel({
  scenarioId,
  story,
  title = "Field note",
  subtitle,
  atmosphereArt,
}: DialoguePanelProps) {
  const [session, setSession] = useState(() => {
    const boot = bootEngine(story);
    return {
      story,
      scenarioId,
      engine: boot.engine,
      view: boot.view,
      state: boot.state,
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
      revealKey: 0,
    });
  }

  const { engine, view, state, revealKey } = session;
  const typingGateRef = useRef<{
    done: boolean;
    skip: () => void;
  }>({ done: true, skip: () => {} });

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
      revealKey: prev.revealKey + 1,
    }));
  };

  const advance = () => {
    if (engine.isEnded()) return;
    const current = engine.present();
    if (current.kind !== "text" || !current.canAdvance) return;
    engine.advance();
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
      // Choice options keep native Space/Enter activation.
      if (el.closest('[role="option"]')) return;
      event.preventDefault();
      event.stopPropagation();
      handleContinueIntent();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="relative flex min-h-dvh flex-col bg-white text-neutral-950">
      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{
          duration: 2800,
          className: "font-sans",
          style: {
            background: "#ffffff",
            color: "#0a0a0a",
            border: "1px solid #e5e5e5",
            borderRadius: "2px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            fontFamily:
              "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
            fontSize: "0.875rem",
            letterSpacing: "-0.01em",
            padding: "12px 14px",
          },
        }}
      />

      <header className="mx-auto flex w-full max-w-2xl items-end justify-between gap-6 px-6 pt-10 pb-6 sm:px-8 sm:pt-14">
        <div>
          <p className="text-[11px] tracking-[0.22em] uppercase text-neutral-400">
            sapiens / go
          </p>
          <h1 className="mt-2 font-display text-3xl tracking-[-0.02em] text-neutral-950 sm:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-500">
              {subtitle}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-6 sm:px-8">
        <div className="flex gap-6 border-t border-neutral-200 pt-4">
          <Meter label="Reputation" value={state.reputation} max={10} />
          <Meter label="Evidence" value={state.evidence} max={10} />
          <Meter label="Safety" value={state.safety} max={100} />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 sm:px-8 sm:py-14">
        {atmosphereArt ? (
          <pre
            aria-hidden
            className="mb-10 max-w-full overflow-x-auto border-b border-neutral-100 pb-10 font-mono text-[7px] leading-[1.1] tracking-[-0.05em] text-neutral-500 select-none sm:mb-12 sm:pb-12 sm:text-[8.5px]"
          >
            {atmosphereArt}
          </pre>
        ) : null}

        <div key={revealKey} className="flex flex-1 flex-col">
          {view.kind === "text" ? (
            <TextBeat
              speaker={view.speaker}
              text={view.text}
              canAdvance={view.canAdvance}
              onContinue={() => {
                if (!typingGateRef.current.done) {
                  typingGateRef.current.skip();
                  return;
                }
                advance();
              }}
              typingGateRef={typingGateRef}
            />
          ) : null}

          {view.kind === "choice" ? (
            <ChoiceBeat
              prompt={view.prompt}
              choices={view.choices}
              onChoose={choose}
              typingGateRef={typingGateRef}
            />
          ) : null}

          {view.kind === "end" ? (
            <EndBeat
              title={view.title}
              text={view.text}
              state={view.state}
              onRestart={restart}
              typingGateRef={typingGateRef}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

type TypingGateRef = MutableRefObject<{
  done: boolean;
  skip: () => void;
}>;

function TypeCaret({ tone = "dark" }: { tone?: "dark" | "muted" }) {
  return (
    <span
      className={`ml-0.5 inline-block h-[0.95em] w-[0.08em] translate-y-[0.08em] align-baseline ${
        tone === "muted" ? "bg-neutral-700" : "bg-neutral-950"
      }`}
      aria-hidden
    />
  );
}

function useTypingGate(
  typingGateRef: TypingGateRef,
  done: boolean,
  skip: () => void,
) {
  useEffect(() => {
    typingGateRef.current.done = done;
    typingGateRef.current.skip = () => {
      skip();
      typingGateRef.current.done = true;
    };
    return () => {
      typingGateRef.current = { done: true, skip: () => {} };
    };
  }, [typingGateRef, done, skip]);
}

function TextBeat({
  speaker,
  text,
  canAdvance,
  onContinue,
  typingGateRef,
}: {
  speaker?: string;
  text: string;
  canAdvance: boolean;
  onContinue: () => void;
  typingGateRef: TypingGateRef;
}) {
  const { displayed, done, skip } = useTypewriter(text);
  useTypingGate(typingGateRef, done, skip);

  return (
    <button
      type="button"
      onClick={onContinue}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          // Handled by the capture-phase window listener — avoid double fire.
          event.preventDefault();
        }
      }}
      className="group flex flex-1 flex-col items-stretch text-left outline-none"
    >
      {speaker ? (
        <p className="mb-5 text-[12px] tracking-[0.18em] uppercase text-neutral-400">
          {speaker}
        </p>
      ) : null}
      <p
        className="font-display text-[1.65rem] leading-[1.35] tracking-[-0.015em] text-neutral-950 sm:text-[1.85rem]"
        aria-label={text}
      >
        {displayed}
        {!done ? <TypeCaret /> : null}
      </p>
      {canAdvance && done ? (
        <p className="mt-auto pt-16 text-[11px] tracking-[0.16em] uppercase text-neutral-400 transition-colors group-hover:text-neutral-700 group-focus-visible:text-neutral-700">
          Continue — space
        </p>
      ) : (
        <p className="mt-auto pt-16 text-[11px] tracking-[0.16em] uppercase text-neutral-400 transition-colors group-hover:text-neutral-700 group-focus-visible:text-neutral-700">
          {done ? "" : "Skip to end — space"}
        </p>
      )}
    </button>
  );
}

function ChoiceBeat({
  prompt,
  choices,
  onChoose,
  typingGateRef,
}: {
  prompt?: string;
  choices: Array<{ index: number; label: string }>;
  onChoose: (index: number) => void;
  typingGateRef: TypingGateRef;
}) {
  const promptText = prompt ?? "What do you do?";
  const { displayed, done, skip } = useTypewriter(promptText);
  useTypingGate(typingGateRef, done, skip);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const choicesKey = choices.map((choice) => choice.index).join(",");
  const [focusReset, setFocusReset] = useState({ done, choicesKey });

  if (done !== focusReset.done || choicesKey !== focusReset.choicesKey) {
    setFocusReset({ done, choicesKey });
    if (done && choices.length > 0) {
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (!done || choices.length === 0) return;
    const id = window.requestAnimationFrame(() => {
      const first = listRef.current?.querySelector<HTMLButtonElement>(
        '[data-choice-index="0"]',
      );
      first?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [done, choices]);

  const focusChoice = (order: number) => {
    if (choices.length === 0) return;
    const wrapped = (order + choices.length) % choices.length;
    setActiveIndex(wrapped);
    const button = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-choice-index="${wrapped}"]`,
    );
    button?.focus();
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      focusChoice(activeIndex + (event.shiftKey ? -1 : 1));
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusChoice(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusChoice(activeIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusChoice(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusChoice(choices.length - 1);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        tabIndex={done ? -1 : 0}
        onClick={() => {
          if (!done) skip();
        }}
        className="mb-8 text-left outline-none"
        aria-label={promptText}
      >
        <p className="font-display text-[1.65rem] leading-[1.35] tracking-[-0.015em] text-neutral-950 sm:text-[1.85rem]">
          {displayed}
          {!done ? <TypeCaret /> : null}
        </p>
      </button>
      {done ? (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Choices"
          onKeyDown={onListKeyDown}
          className="mt-auto flex flex-col gap-2"
        >
          {choices.map((choice, order) => {
            const selected = order === activeIndex;
            return (
              <li
                key={choice.index}
                className="choice-cascade-item"
                style={{ ["--cascade-i" as string]: order }}
                role="none"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-choice-index={order}
                  tabIndex={selected ? 0 : -1}
                  onFocus={() => setActiveIndex(order)}
                  onClick={() => onChoose(choice.index)}
                  className={`group flex w-full items-start gap-5 rounded-sm px-4 py-4 text-left outline-none transition-colors duration-300 ease-out ${
                    selected
                      ? "bg-neutral-50"
                      : "bg-transparent hover:bg-neutral-50/70"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-6 shrink-0 text-[12px] tabular-nums tracking-[0.12em] transition-colors duration-300 ${
                      selected ? "text-neutral-900" : "text-neutral-400"
                    }`}
                  >
                    {String(order + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-[1.05rem] leading-snug transition-colors duration-300 sm:text-[1.125rem] ${
                      selected ? "text-neutral-950" : "text-neutral-800"
                    }`}
                  >
                    {choice.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function EndBeat({
  title,
  text,
  state,
  onRestart,
  typingGateRef,
}: {
  title: string;
  text: string;
  state: State;
  onRestart: () => void;
  typingGateRef: TypingGateRef;
}) {
  const { displayed, done, skip } = useTypewriter(text);
  useTypingGate(typingGateRef, done, skip);

  return (
    <div className="flex flex-1 flex-col">
      <p className="mb-3 text-[11px] tracking-[0.22em] uppercase text-neutral-400">
        Ending
      </p>
      <h2 className="font-display text-3xl tracking-[-0.02em] text-neutral-950 sm:text-4xl">
        {title}
      </h2>
      <button
        type="button"
        onClick={() => {
          if (!done) skip();
        }}
        className="mt-6 text-left outline-none"
        aria-label={text}
      >
        <p className="text-[1.05rem] leading-relaxed text-neutral-700 sm:text-[1.125rem]">
          {displayed}
          {!done ? <TypeCaret tone="muted" /> : null}
        </p>
      </button>
      {done ? (
        <>
          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-neutral-200 pt-6 text-sm">
            <div>
              <dt className="text-[11px] tracking-[0.14em] uppercase text-neutral-400">
                Reputation
              </dt>
              <dd className="mt-1 tabular-nums text-neutral-950">
                {state.reputation}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.14em] uppercase text-neutral-400">
                Evidence
              </dt>
              <dd className="mt-1 tabular-nums text-neutral-950">
                {state.evidence}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.14em] uppercase text-neutral-400">
                Safety
              </dt>
              <dd className="mt-1 tabular-nums text-neutral-950">
                {state.safety}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={onRestart}
            className="mt-auto self-start pt-14 text-[11px] tracking-[0.18em] uppercase text-neutral-500 transition-colors hover:text-neutral-950 focus-visible:text-neutral-950 focus-visible:outline-none"
          >
            Begin again
          </button>
        </>
      ) : null}
    </div>
  );
}
