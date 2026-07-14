"use client";

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
};

export function DialoguePanel({
  scenarioId,
  story,
  title = "Field note",
  subtitle,
  theme: themeId = "vanilla",
  atmosphereArt,
}: DialoguePanelProps) {
  const theme = THEMES[themeId];
  const {
    view,
    state,
    hasStats,
    revealKey,
    typingGateRef,
    advance,
    choose,
    restart,
  } = useDialogueSession({ scenarioId, story });

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
    </div>
  );
}
