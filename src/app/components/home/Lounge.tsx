"use client";

import { Toaster } from "react-hot-toast";
import { Coco } from "@/app/components/coco";
import {
  DialogueBox,
  THEMES,
  useDialogueSession,
} from "@/app/components/dialogue";
import HomeBackground from "@/app/components/home/HomeBackground";
import intro from "@/content/canon/intro.json";

const theme = THEMES.space;

/** Ship scene: wake is black; atmosphere from ship-1 onward. */
function onShipScene(nodeId: string): boolean {
  return /^(ship-|escort-|play-|tv-|survey-|bedtime-)/.test(nodeId);
}

/** Coco enters at ship-2 and stays for the rest of the lounge scene. */
function cocoOnStage(nodeId: string): boolean {
  return nodeId !== "ship-1" && onShipScene(nodeId);
}

export default function Lounge() {
  const { view, revealKey, typingGateRef, advance, choose, restart } =
    useDialogueSession({
      scenarioId: "intro",
      story: intro,
    });

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black text-white font-space">
      {onShipScene(view.id) ? <HomeBackground /> : null}
      {cocoOnStage(view.id) ? (
        <Coco
          expression={
            view.kind === "text" && view.speaker?.toLowerCase() === "coco"
              ? "talking"
              : "idle"
          }
        />
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
    </div>
  );
}
