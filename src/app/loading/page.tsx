/*
 * Screen for permanent loading screen; for UI testing.
 */

"use client";

import { useEffect, useState } from "react";
import LoadingScreen from "../components/loading/LoadingScreen";

/** Faster cycle while refining the sailboat bar. */
const CYCLE_MS = 90_000;

/** Temporary visual preview for the shared loading screen. */
export default function LoadingPreviewPage() {
  const [progress, setProgress] = useState(0.55);

  useEffect(() => {
    let raf = 0;
    let cycleStart = performance.now() - CYCLE_MS * 0.55;

    const tick = (now: number) => {
      const elapsed = now - cycleStart;
      if (elapsed >= CYCLE_MS) {
        cycleStart = now;
        setProgress(0);
      } else {
        setProgress(elapsed / CYCLE_MS);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <LoadingScreen progress={progress} />;
}
