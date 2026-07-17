"use client";

import { useEffect, useState } from "react";
import { Coco } from "../coco";
import SailboatProgressBar from "./progress-bars";
import ProgressLogPanel from "../progress/ProgressLogPanel";
import type { ProgressLogEntry } from "../progress/ProgressLog";

/** How often the loading screen requests a new historical fact. */
export const FACT_CHANGE = 8_000;

const HISTORICAL_FACT_API =
  "https://randomhistoricalfact.000webhostapp.com/fact";

const FALLBACK_FACTS = [
  "The word 'deadline' originally referred to a line in Civil War prison camps that prisoners were not allowed to cross.",
  "The first recorded Olympic Games took place in Olympia, Greece, in 776 BCE.",
  "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid of Giza.",
  "Oxford University was teaching students centuries before the Aztec Empire was founded.",
] as const;

type FactResponse = {
  fact?: unknown;
};

async function getHistoricalFact(signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(HISTORICAL_FACT_API, {
      signal,
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as FactResponse;
    return typeof data.fact === "string" && data.fact.trim()
      ? data.fact.trim()
      : null;
  } catch {
    return null;
  }
}

type LoadingScreenProps = {
  /**
   * Fill fraction (0–1) for the progress bar. When provided, the bar renders
   * as determinate and fills to this value. When omitted, the bar animates
   * indeterminately.
   */
  progress?: number;
  /** Live agent and tool updates to show in the optional D-key side log. */
  pipelineProgress?: readonly ProgressLogEntry[];
  /** Optional action for the enclosing surface to stop its active generation. */
  onTerminate?: () => void;
};

export default function LoadingScreen({
  progress,
  pipelineProgress,
  onTerminate,
}: LoadingScreenProps) {
  const [fact, setFact] = useState<string>(FALLBACK_FACTS[0]);

  const isDeterminate = typeof progress === "number";
  const clampedProgress = isDeterminate
    ? Math.max(0, Math.min(1, progress))
    : 0;

  useEffect(() => {
    const controller = new AbortController();
    let fallbackIndex = 1;

    const loadFact = async () => {
      const nextFact = await getHistoricalFact(controller.signal);
      setFact(
        nextFact ?? FALLBACK_FACTS[fallbackIndex++ % FALLBACK_FACTS.length],
      );
    };

    void loadFact();
    const interval = window.setInterval(() => {
      void loadFact();
    }, FACT_CHANGE);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main
      aria-busy="true"
      aria-label="Loading Sapiens"
      className="loading-screen relative isolate flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#050708] px-6 py-10 text-[#f4f1ea] sm:px-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_35%,rgba(30,93,91,0.2),transparent_29rem),radial-gradient(circle_at_12%_90%,rgba(139,82,30,0.11),transparent_24rem),linear-gradient(160deg,#050708_0%,#090d10_55%,#050708_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-25 [background-image:linear-gradient(rgba(178,232,232,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(178,232,232,0.035)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />

      <section className="flex w-full max-w-2xl flex-col items-center text-center">
        <div className="relative h-[min(42vh,22rem)] w-full min-h-64 sm:h-[min(46vh,26rem)]">
          <Coco
            expression="sleeping"
            scale={1.5}
            center={{ x: 0.5, y: 0.52 }}
          />
        </div>

        <div className="w-full max-w-md">
          <div
            role="progressbar"
            aria-label="Loading"
            aria-valuemin={isDeterminate ? 0 : undefined}
            aria-valuemax={isDeterminate ? 100 : undefined}
            aria-valuenow={
              isDeterminate ? Math.round(clampedProgress * 100) : undefined
            }
          >
            <SailboatProgressBar progress={progress} />
          </div>
        </div>

        <p
          aria-live="polite"
          className="mt-10 max-w-lg min-h-[4.5rem] text-pretty font-display text-lg leading-relaxed text-white/75 sm:mt-12 sm:text-xl"
        >
          {fact}
        </p>
      </section>
      {pipelineProgress !== undefined && (
        <ProgressLogPanel
          entries={pipelineProgress}
          onTerminate={onTerminate}
        />
      )}
    </main>
  );
}
