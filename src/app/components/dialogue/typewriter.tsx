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
  renderInlineMarkdownTyped,
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

export function useTypewriter(
  text: string,
  enabled = true,
  richText = false,
) {
  // Rich text types by visible letters so `**` / `_` never consume ticks or flash.
  const typedSource = richText ? stripInlineMarkdown(text) : text;
  const instant =
    !enabled || typedSource.length === 0 || prefersReducedMotion();
  const [visibleLength, setVisibleLength] = useState(() =>
    instant ? typedSource.length : 0,
  );
  const [done, setDone] = useState(() => instant);
  const [resetKey, setResetKey] = useState({ text, enabled, richText });
  const skippedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (
    text !== resetKey.text ||
    enabled !== resetKey.enabled ||
    richText !== resetKey.richText
  ) {
    setResetKey({ text, enabled, richText });
    const nextSource = richText ? stripInlineMarkdown(text) : text;
    const nextInstant =
      !enabled || nextSource.length === 0 || prefersReducedMotion();
    setVisibleLength(nextInstant ? nextSource.length : 0);
    setDone(nextInstant);
  }

  useEffect(() => {
    skippedRef.current = false;
    const source = richText ? stripInlineMarkdown(text) : text;

    if (!enabled || prefersReducedMotion() || source.length === 0) {
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
      if (index >= source.length) {
        setDone(true);
        timerRef.current = null;
        return;
      }
      const ch = source[index - 1] ?? "";
      const delay =
        ch === "." || ch === "!" || ch === "?" || ch === "—" || ch === ","
          ? CHAR_MS + PUNCT_PAUSE_MS
          : CHAR_MS;
      timerRef.current = setTimeout(tick, delay);
    };

    timerRef.current = setTimeout(tick, CHAR_MS);
    return clearTimer;
  }, [text, enabled, richText]);

  const skip = () => {
    skippedRef.current = true;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const source = richText ? stripInlineMarkdown(text) : text;
    setVisibleLength(source.length);
    setDone(true);
  };

  return {
    displayed: typedSource.slice(0, visibleLength),
    visibleLength,
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
 * When `richText` is true, letters type out already bold/italic; markers never
 * appear. HTML-like tags stay literal text.
 */
export function TypewriterLine({
  text,
  displayed,
  visibleLength,
  done,
  className,
  style,
  theme,
  caretTone = "dark",
  richText = false,
}: {
  text: string;
  displayed: string;
  visibleLength?: number;
  done: boolean;
  className: string;
  style?: CSSProperties;
  theme: DialogueTheme;
  caretTone?: "dark" | "muted";
  richText?: boolean;
}) {
  const typedLength = visibleLength ?? displayed.length;
  const live = richText
    ? renderInlineMarkdownTyped(text, typedLength)
    : displayed;
  const full = richText ? renderInlineMarkdown(text) : text;
  const label = richText ? stripInlineMarkdown(text) : text;

  return (
    <p className={`relative ${className}`} style={style} aria-label={label}>
      <span aria-hidden className="invisible block">
        {full}
      </span>
      <span aria-hidden className="absolute inset-0">
        {live}
        {!done ? <TypeCaret theme={theme} tone={caretTone} /> : null}
      </span>
    </p>
  );
}
