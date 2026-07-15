"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ShoppingBag } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { Coco } from "@/app/components/coco";
import {
  DialogueBox,
  THEMES,
  useDialogueSession,
} from "@/app/components/dialogue";
import HomeBackground from "@/app/components/home/HomeBackground";
import ShopPanel from "@/app/components/home/ShopPanel";
import intro from "@/lib/content/canon/intro.json";

const theme = THEMES.space;

/** Ship scene: wake is black; atmosphere from ship-1 onward. */
function onShipScene(nodeId: string): boolean {
  return /^(ship-|escort-|play-|tv-|survey-|bedtime-)/.test(nodeId);
}

/** Coco enters at ship-2 and stays for the rest of the lounge scene. */
function cocoOnStage(nodeId: string): boolean {
  return nodeId !== "ship-1" && onShipScene(nodeId);
}

function subscribeToTutorialDone(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getTutorialDone(): boolean {
  return window.localStorage.getItem("tutorialDone") === "true";
}

export default function Lounge() {
  const [shopOpen, setShopOpen] = useState(false);
  const tutorialDone = useSyncExternalStore(
    subscribeToTutorialDone,
    getTutorialDone,
    () => false,
  );
  const { view, revealKey, typingGateRef, advance, choose, restart } =
    useDialogueSession({
      scenarioId: "intro",
      story: intro,
    });
  const tutorialFinished =
    view.kind === "end" || (view.kind === "text" && !view.canAdvance);

  useEffect(() => {
    if (tutorialFinished) {
      window.localStorage.setItem("tutorialDone", "true");
    }
  }, [tutorialFinished]);

  const showShop = tutorialDone || tutorialFinished;
  const showCoco = tutorialDone || cocoOnStage(view.id);

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black text-white font-space">
      {tutorialDone || onShipScene(view.id) ? <HomeBackground /> : null}
      {showCoco ? (
        <Coco
          expression={
            tutorialDone
              ? "sleeping"
              : view.kind === "text" &&
                  view.speaker?.toLowerCase() === "coco"
                ? "talking"
                : "idle"
          }
        />
      ) : null}

      {showShop ? (
        <>
          <ShopPanel isOpen={shopOpen} onClose={() => setShopOpen(false)} />
          <button
            type="button"
            onClick={() => setShopOpen((open) => !open)}
            aria-expanded={shopOpen}
            aria-controls="shop-panel"
            aria-label={shopOpen ? "Close shop" : "Open shop"}
            className="pointer-events-auto fixed bottom-6 right-6 z-30 flex size-14 items-center justify-center rounded-full border border-cyan-100/20 bg-slate-950/90 text-cyan-100 shadow-[0_0_30px_rgba(103,232,249,0.15)] backdrop-blur transition hover:border-cyan-100/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-200/70 sm:bottom-8 sm:right-8"
          >
            <ShoppingBag size={22} aria-hidden />
          </button>
        </>
      ) : null}

      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{
          duration: 2800,
          className: theme.toastClass,
          style: theme.toastStyle,
        }}
      />

      {!tutorialDone ? (
        <main className="pointer-events-none relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-end px-6 pb-10 pt-[48vh] sm:px-8 sm:pb-14">
          <div
            key={revealKey}
            className="pointer-events-auto flex min-h-[28vh] flex-col"
          >
            <DialogueBox
              view={view}
              theme={theme}
              size="md"
              typingGateRef={typingGateRef}
              onAdvance={advance}
              onChoose={choose}
              onRestart={restart}
            />
          </div>
        </main>
      ) : null}
    </div>
  );
}
