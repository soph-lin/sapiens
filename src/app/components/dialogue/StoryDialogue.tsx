"use client";

import Image from "next/image";
import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { FieldCompanion } from "@/app/components/fieldnotes";
import { DialoguePanel } from "./DialoguePanel";
import { THEMES, type DialogueThemeId } from "./theme";
import { useDialogueSession } from "./useDialogueSession";

type StoryDialogueProps = {
  scenarioId: string;
  story: unknown;
  title?: string;
  subtitle?: string;
  theme?: DialogueThemeId;
  atmosphereArt?: string;
  characters?: Array<{ name: string; assetUrl?: string }>;
  collectible?: { name: string; assetUrl?: string };
};

function findSpeakerAsset(
  speaker: string | undefined,
  characters: Array<{ name: string; assetUrl?: string }>,
) {
  if (!speaker) return undefined;
  const normalizedSpeaker = speaker.trim().toLowerCase();
  return characters.find(
    (character) => character.name.trim().toLowerCase() === normalizedSpeaker,
  );
}

/** Story-specific wrapper: owns the story engine and companion context. */
export function StoryDialogue({
  scenarioId,
  story,
  title = "Field note",
  subtitle,
  theme: themeId = "vanilla",
  atmosphereArt,
  characters = [],
  collectible,
}: StoryDialogueProps) {
  const theme = THEMES[themeId];
  const [collectibleDismissed, setCollectibleDismissed] = useState(false);
  const {
    view,
    state,
    hasStats,
    dialogueHistory,
    revealKey,
    typingGateRef,
    advance,
    choose,
    restart: restartSession,
  } = useDialogueSession({ scenarioId, story });
  const speakerAsset = view.kind === "text"
    ? findSpeakerAsset(view.speaker, characters)
    : undefined;
  const showCollectible =
    view.kind === "end" && Boolean(collectible) && !collectibleDismissed;
  const dialoguePoint = view.kind === "choice"
    ? view.prompt ?? "A choice is waiting."
    : view.text;
  const dialogueSpeaker = view.kind === "text" ? view.speaker : undefined;

  const restart = () => {
    setCollectibleDismissed(false);
    restartSession();
  };

  return (
    <div className={theme.root}>
      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{
          duration: 2800,
          className: theme.toastClass,
          style: theme.toastStyle,
        }}
      />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 sm:px-8 sm:py-14">
        <DialoguePanel
          title={title}
          subtitle={subtitle}
          theme={themeId}
          state={state}
          showStats={hasStats}
          atmosphereArt={atmosphereArt}
          characterPortrait={speakerAsset}
          view={view}
          revealKey={revealKey}
          typingGateRef={typingGateRef}
          onAdvance={advance}
          onChoose={choose}
          onRestart={restart}
          className="flex flex-1 flex-col"
        />
      </main>

      <FieldCompanion
        topic={title}
        dialoguePoint={dialoguePoint}
        dialogueHistory={dialogueHistory}
        speaker={dialogueSpeaker}
      />

      {showCollectible && collectible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-amber-300/40 bg-[#fffaf0] p-6 text-center text-neutral-950 shadow-2xl">
            <p className="font-space text-[10px] uppercase tracking-[0.28em] text-amber-700">
              Collectible obtained!
            </p>
            {collectible.assetUrl ? (
              <Image
                src={collectible.assetUrl}
                alt={collectible.name}
                width={128}
                height={128}
                unoptimized
                className="mx-auto mt-5 h-32 w-32 rounded-xl border border-amber-200 bg-white object-contain p-3"
              />
            ) : null}
            <h2 className="mt-5 font-display text-3xl">{collectible.name}</h2>
            <button
              type="button"
              onClick={() => setCollectibleDismissed(true)}
              className="mt-6 rounded-full bg-neutral-950 px-5 py-3 font-space text-[10px] uppercase tracking-[0.18em] text-white"
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
