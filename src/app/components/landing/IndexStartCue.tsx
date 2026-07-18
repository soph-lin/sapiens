"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

type CueMode = "hint" | "choose";

const choiceClassName =
  "rounded-sm bg-transparent px-3 py-2 font-space text-[11px] uppercase tracking-[0.22em] text-white/55 outline-none ring-0 transition-[background-color,color] duration-200 ease-out hover:bg-white/[0.06] hover:text-white focus:bg-white/10 focus:text-white focus:outline-none focus:ring-0";

export default function IndexStartCue() {
  const [mode, setMode] = useState<CueMode>("hint");
  const firstChoiceRef = useRef<HTMLAnchorElement>(null);
  const lastChoiceRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (mode !== "hint") return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== " " && event.code !== "Space") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.tagName === "BUTTON" ||
          target.tagName === "A")
      ) {
        return;
      }

      event.preventDefault();
      setMode("choose");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  useEffect(() => {
    if (mode !== "choose") return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMode("hint");
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  useEffect(() => {
    if (mode !== "choose") return;
    firstChoiceRef.current?.focus();
  }, [mode]);

  function handleChoiceKeyDown(event: ReactKeyboardEvent<HTMLAnchorElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setMode("hint");
      event.currentTarget.blur();
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.click();
      return;
    }

    const first = firstChoiceRef.current;
    const last = lastChoiceRef.current;
    if (!first || !last) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      (document.activeElement === last ? first : last).focus();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      (document.activeElement === first ? last : first).focus();
      return;
    }

    if (event.key !== "Tab") return;

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-6 pb-10 sm:pb-12">
      {mode === "hint" ? (
        <p
          className="font-space text-[11px] uppercase tracking-[0.22em] text-white/45 select-none"
          aria-live="polite"
        >
          Space — start
        </p>
      ) : (
        <nav
          className="pointer-events-auto flex flex-col items-center gap-3 sm:flex-row sm:gap-8"
          aria-label="Start as"
        >
          <Link
            ref={firstChoiceRef}
            href="/roll-call?view=new"
            className={choiceClassName}
            onKeyDown={handleChoiceKeyDown}
          >
            New player
          </Link>
          <Link
            ref={lastChoiceRef}
            href="/roll-call?view=returning"
            className={choiceClassName}
            onKeyDown={handleChoiceKeyDown}
          >
            Returning player
          </Link>
        </nav>
      )}
    </div>
  );
}
