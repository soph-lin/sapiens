"use client";

import { useEffect, useRef, useState } from "react";
import type { State } from "@/lib/dialogue";
import type { DialogueTheme } from "./theme";
import { prefersReducedMotion } from "./typewriter";

function humanizeStatKey(key: string): string {
  return key
    .split(/[_.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Meter({
  label,
  value,
  max = 100,
  theme,
}: {
  label: string;
  value: number;
  max?: number;
  theme: DialogueTheme;
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
      <div className={theme.meterLabel}>
        <span>{label}</span>
        <span className={theme.meterValue}>{display}</span>
      </div>
      <div className={theme.meterTrack}>
        <div className={theme.meterFill} style={{ width }} />
      </div>
    </div>
  );
}

type DialogueHeaderProps = {
  title: string;
  subtitle?: string;
  state?: State;
  theme: DialogueTheme;
  /** Dynamic numeric stats; only when the story contains tracked stats. */
  showStats?: boolean;
};

export function DialogueHeader({
  title,
  subtitle,
  state,
  theme,
  showStats = false,
}: DialogueHeaderProps) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-2xl items-end justify-between gap-6 px-6 pt-10 pb-6 sm:px-8 sm:pt-14">
        <div>
          <p className={theme.eyebrow}>sapiens / go</p>
          <h1 className={theme.title}>{title}</h1>
          {subtitle ? <p className={theme.subtitle}>{subtitle}</p> : null}
        </div>
      </header>

      {showStats && state ? (
        <div className="mx-auto w-full max-w-2xl px-6 sm:px-8">
          <div className={theme.metersRule}>
            {Object.entries(state.stats).map(([key, value]) => (
              <Meter
                key={key}
                label={humanizeStatKey(key)}
                value={value}
                max={Math.max(100, Math.abs(value))}
                theme={theme}
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
