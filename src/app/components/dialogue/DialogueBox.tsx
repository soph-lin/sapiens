"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Presentable, State } from "@/lib/dialogue";
import type { DialogueTheme } from "./theme";
import {
  TypeCaret,
  useTypewriter,
  useTypingGate,
  type TypingGateRef,
} from "./typewriter";

function humanizeStatKey(key: string): string {
  return key
    .split(/[_.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Dialogue body text sizes (16px root: 1rem = 16px) */
const FONT_SIZE_MD = "1.2rem";
const FONT_SIZE_LG = "1.65rem";

export type DialogueBoxSize = "md" | "lg";

const FONT_SIZE: Record<DialogueBoxSize, string> = {
  md: FONT_SIZE_MD,
  lg: FONT_SIZE_LG,
};

type DialogueBoxProps = {
  view: Presentable;
  theme: DialogueTheme;
  typingGateRef: TypingGateRef;
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onRestart: () => void;
  /** Body text size. Default `lg`. */
  size?: DialogueBoxSize;
};

export function DialogueBox({
  view,
  theme,
  typingGateRef,
  onAdvance,
  onChoose,
  onRestart,
  size = "lg",
}: DialogueBoxProps) {
  if (view.kind === "text") {
    return (
      <TextBeat
        speaker={view.speaker}
        text={view.text}
        canAdvance={view.canAdvance}
        theme={theme}
        size={size}
        onContinue={() => {
          if (!typingGateRef.current.done) {
            typingGateRef.current.skip();
            return;
          }
          onAdvance();
        }}
        typingGateRef={typingGateRef}
      />
    );
  }

  if (view.kind === "choice") {
    return (
      <ChoiceBeat
        prompt={view.prompt}
        choices={view.choices}
        theme={theme}
        size={size}
        onChoose={onChoose}
        typingGateRef={typingGateRef}
      />
    );
  }

  return (
    <EndBeat
      title={view.title}
      text={view.text}
      state={view.state}
      showStats={view.showStats}
      theme={theme}
      size={size}
      onRestart={onRestart}
      typingGateRef={typingGateRef}
    />
  );
}

function bodyFontStyle(size: DialogueBoxSize): CSSProperties {
  return { fontSize: FONT_SIZE[size] };
}

/** Secondary copy (choices, end body) — only override when `md`. */
function secondaryFontStyle(size: DialogueBoxSize): CSSProperties | undefined {
  return size === "md" ? { fontSize: FONT_SIZE_MD } : undefined;
}

function TextBeat({
  speaker,
  text,
  canAdvance,
  onContinue,
  typingGateRef,
  theme,
  size,
}: {
  speaker?: string;
  text: string;
  canAdvance: boolean;
  onContinue: () => void;
  typingGateRef: TypingGateRef;
  theme: DialogueTheme;
  size: DialogueBoxSize;
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
      {speaker ? <p className={theme.speaker}>{speaker}</p> : null}
      <p className={theme.body} style={bodyFontStyle(size)} aria-label={text}>
        {displayed}
        {!done ? <TypeCaret theme={theme} /> : null}
      </p>
      {canAdvance && done ? (
        <p className={theme.hint}>Continue — space</p>
      ) : (
        <p className={theme.hint}>{done ? "" : "Skip to end — space"}</p>
      )}
    </button>
  );
}

function ChoiceBeat({
  prompt,
  choices,
  onChoose,
  typingGateRef,
  theme,
  size,
}: {
  prompt?: string;
  choices: Array<{ index: number; label: string }>;
  onChoose: (index: number) => void;
  typingGateRef: TypingGateRef;
  theme: DialogueTheme;
  size: DialogueBoxSize;
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
        <p className={theme.body} style={bodyFontStyle(size)}>
          {displayed}
          {!done ? <TypeCaret theme={theme} /> : null}
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
                    selected ? theme.choiceSelected : theme.choiceIdle
                  }`}
                >
                  <span
                    className={`mt-0.5 w-6 shrink-0 text-[12px] tabular-nums tracking-[0.12em] transition-colors duration-300 ${
                      selected ? theme.choiceIndexSelected : theme.choiceIndex
                    }`}
                  >
                    {String(order + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-[1.05rem] leading-snug transition-colors duration-300 sm:text-[1.125rem] ${
                      selected ? theme.choiceLabelSelected : theme.choiceLabel
                    }`}
                    style={secondaryFontStyle(size)}
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
  showStats,
  onRestart,
  typingGateRef,
  theme,
  size,
}: {
  title: string;
  text: string;
  state: State;
  showStats: boolean;
  onRestart: () => void;
  typingGateRef: TypingGateRef;
  theme: DialogueTheme;
  size: DialogueBoxSize;
}) {
  const { displayed, done, skip } = useTypewriter(text);
  useTypingGate(typingGateRef, done, skip);

  return (
    <div className="flex flex-1 flex-col">
      <p className={theme.eyebrow}>Ending</p>
      <h2 className={theme.heading} style={secondaryFontStyle(size)}>
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
        <p className={theme.bodyMuted} style={secondaryFontStyle(size)}>
          {displayed}
          {!done ? <TypeCaret theme={theme} tone="muted" /> : null}
        </p>
      </button>
      {done ? (
        <>
          {showStats ? (
            <dl className={theme.endStatRule}>
              {Object.entries(state.stats).map(([key, value]) => (
                <div key={key}>
                  <dt className={theme.endStatLabel}>{humanizeStatKey(key)}</dt>
                  <dd className={theme.endStatValue}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <button type="button" onClick={onRestart} className={theme.restart}>
            Begin again
          </button>
        </>
      ) : null}
    </div>
  );
}
