"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import type { DialogueTheme } from "./theme";
import {
  renderInlineMarkdown,
  stripInlineMarkdown,
} from "./InlineMarkdown";

const CHAR_MS = 18;
const PUNCT_PAUSE_MS = 90;

export type TypingGateRef = MutableRefObject<{
  done: boolean;
  skip: () => void;
}>;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useTypewriter(text: string, enabled = true) {
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

export function useTypingGate(
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

export function TypeCaret({
  theme,
  tone = "dark",
}: {
  theme: DialogueTheme;
  tone?: "dark" | "muted";
}) {
  return (
    <span
      className={`ml-0.5 inline-block h-[0.95em] w-[0.08em] translate-y-[0.08em] align-baseline ${
        tone === "muted" ? theme.caretMuted : theme.caret
      }`}
      aria-hidden
    />
  );
}

/**
 * Typewriter copy that sizes to the final text height immediately, so the
 * box does not grow line-by-line as characters appear.
 * When `richText` is true, completed `**bold**` / `*italic*` / `_italic_`
 * markers render as emphasis; HTML-like tags stay literal text.
 */
export function TypewriterLine({
  text,
  displayed,
  done,
  className,
  style,
  theme,
  caretTone = "dark",
  richText = false,
}: {
  text: string;
  displayed: string;
  done: boolean;
  className: string;
  style?: CSSProperties;
  theme: DialogueTheme;
  caretTone?: "dark" | "muted";
  richText?: boolean;
}) {
  const render = (value: string) =>
    richText ? renderInlineMarkdown(value) : value;
  const label = richText ? stripInlineMarkdown(text) : text;

  return (
    <p className={`relative ${className}`} style={style} aria-label={label}>
      <span aria-hidden className="invisible block">
        {render(text)}
      </span>
      <span aria-hidden className="absolute inset-0">
        {render(displayed)}
        {!done ? <TypeCaret theme={theme} tone={caretTone} /> : null}
      </span>
    </p>
  );
}
