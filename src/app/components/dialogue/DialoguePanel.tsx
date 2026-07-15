"use client";

import Image from "next/image";
import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { AtmosphereArt } from "./AtmosphereArt";
import { DialogueBox } from "./DialogueBox";
import { DialogueHeader } from "./DialogueHeader";
import { THEMES, type DialogueThemeId } from "./theme";
import { useDialogueSession } from "./useDialogueSession";

type DialoguePanelProps = {
  scenarioId: string;
  story: unknown;
  title?: string;
  subtitle?: string;
  theme?: DialogueThemeId;
  /** Optional decorative braille / monospace scene above the dialogue. */
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

export function DialoguePanel({
  scenarioId,
  story,
  title = "Field note",
  subtitle,
  theme: themeId = "vanilla",
  atmosphereArt,
  characters = [],
  collectible,
}: DialoguePanelProps) {
  const theme = THEMES[themeId];
  const [collectibleDismissed, setCollectibleDismissed] = useState(false);
  const {
    view,
    state,
    hasStats,
    revealKey,
    typingGateRef,
    advance,
    choose,
    restart: restartSession,
  } = useDialogueSession({ scenarioId, story });
  const speakerAsset = view.kind === "text"
    ? findSpeakerAsset(view.speaker, characters)
    : undefined;

  const showCollectible = view.kind === "end" && Boolean(collectible) && !collectibleDismissed;

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

      <DialogueHeader
        title={title}
        subtitle={subtitle}
        state={state}
        showStats={hasStats}
        theme={theme}
      />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10 sm:px-8 sm:py-14">
        {atmosphereArt ? (
          <AtmosphereArt art={atmosphereArt} theme={theme} />
        ) : null}

        {speakerAsset?.assetUrl ? (
          <div className="flex justify-end pb-4">
            <Image
              src={speakerAsset.assetUrl}
              alt={`${speakerAsset.name} portrait`}
              width={256}
              height={256}
              unoptimized
              className="block h-64 w-64 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ) : null}

        <div key={revealKey} className="flex flex-1 flex-col">
          <DialogueBox
            view={view}
            theme={theme}
            typingGateRef={typingGateRef}
            onAdvance={advance}
            onChoose={choose}
            onRestart={restart}
          />
        </div>
      </main>

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
