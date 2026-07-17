"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import {
  FieldCompanion,
  VoyageTakeawayNote,
} from "@/app/components/fieldnotes";
import { ReportMarkdown } from "@/app/components/report";
import { DialoguePanel } from "./DialoguePanel";
import { THEMES, type DialogueThemeId } from "./theme";
import { useDialogueSession } from "./useDialogueSession";
import type { StoryReport } from "@/lib/orchestrator/agent/flourish";

type ClassSharePrompt = {
  storyId: string;
  /** Assigned classroom voyages only. */
  assignmentId?: string;
  /**
   * Assigned voyages require a published note to complete; solo classroom
   * shares are optional. Defaults to whether `assignmentId` is set.
   */
  required?: boolean;
  /** Solo voyages only show the class note when the owner belongs to a classroom. */
  showNote?: boolean;
};

type StoryDialogueProps = {
  scenarioId: string;
  story: unknown;
  title?: string;
  subtitle?: string;
  theme?: DialogueThemeId;
  atmosphereArt?: string;
  characters?: Array<{ name: string; assetUrl?: string }>;
  collectible?: { name: string; assetUrl?: string };
  report?: StoryReport;
  /**
   * Class-share takeaway at voyage end: assigned voyages (required) or solo
   * voyages when the cadet belongs to a classroom (optional, below report).
   */
  classShare?: ClassSharePrompt;
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
  report,
  classShare,
}: StoryDialogueProps) {
  const theme = THEMES[themeId];
  const [collectibleDismissed, setCollectibleDismissed] = useState(false);
  const completionAttempted = useRef<string | null>(null);
  const {
    view,
    state,
    hasStats,
    dialogueHistory,
    revealKey,
    typingGateRef,
    advance,
    choose,
    back,
    canGoBack,
    restart: restartSession,
  } = useDialogueSession({ scenarioId, story });
  const speakerAsset =
    view.kind === "text"
      ? findSpeakerAsset(view.speaker, characters)
      : undefined;
  const showCollectible =
    view.kind === "end" && Boolean(collectible) && !collectibleDismissed;
  const dialoguePoint =
    view.kind === "choice"
      ? (view.prompt ?? "A choice is waiting.")
      : view.text;
  const dialogueSpeaker = view.kind === "text" ? view.speaker : undefined;

  const restart = () => {
    setCollectibleDismissed(false);
    restartSession();
  };

  const markVoyageComplete = useCallback(async () => {
    if (!classShare) return;
    const key = `${classShare.storyId}:${classShare.assignmentId ?? "solo"}`;
    if (completionAttempted.current === key) return;
    completionAttempted.current = key;
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(classShare.assignmentId ? { assignmentId: classShare.assignmentId } : {}),
          storyId: classShare.storyId,
          progress: { completed: true },
          completed: true,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not save voyage completion.");
      }
    } catch (error) {
      completionAttempted.current = null;
      toast.error(error instanceof Error ? error.message : "Could not save voyage completion.");
    }
  }, [classShare]);
  const handleVoyagePublished = useCallback(() => {
    void markVoyageComplete();
  }, [markVoyageComplete]);

  useEffect(() => {
    if (view.kind === "end" && classShare && !classShare.required) {
      void markVoyageComplete();
    }
  }, [classShare, markVoyageComplete, view.kind]);

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
          onBack={canGoBack ? back : undefined}
          className="flex flex-1 flex-col"
        />
      </main>

      <FieldCompanion
        topic={title}
        dialoguePoint={dialoguePoint}
        dialogueHistory={dialogueHistory}
        speaker={dialogueSpeaker}
      />

      {view.kind === "end" && report ? (
        <section
          className="mx-auto mb-12 w-full max-w-2xl rounded-2xl border border-[#d9cdbf] bg-[#fffaf2] px-6 py-6 text-[#30281f] shadow-[0_16px_50px_rgba(77,58,37,0.08)] sm:px-8"
          aria-labelledby="story-report-heading"
        >
          <p className="font-space text-[9px] uppercase tracking-[0.22em] text-[#96734d]">
            Voyage report
          </p>
          <h2 id="story-report-heading" className="mt-2 font-display text-3xl">
            What did we learn?
          </h2>
          <ReportMarkdown
            variant="light"
            className="mt-5"
            sources={report.sources}
          >
            {report.reportText}
          </ReportMarkdown>
          <h3 className="mt-6 font-space text-[9px] uppercase tracking-[0.18em] text-[#8e7f6d]">
            Sources
          </h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-[#6b5038]">
            {report.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-[#b9a58e] underline-offset-2 hover:text-[#30281f]"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ol>
          {report.furtherReading.length ? (
            <>
              <h3 className="mt-6 font-space text-[9px] uppercase tracking-[0.18em] text-[#8e7f6d]">
                Further reading
              </h3>
              <ul className="mt-3 space-y-2 text-xs text-[#6b5038]">
                {report.furtherReading.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-[#b9a58e] underline-offset-2 hover:text-[#30281f]"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {classShare ? (
            <VoyageTakeawayNote
              storyId={classShare.storyId}
              assignmentId={classShare.assignmentId}
              required={classShare.required ?? Boolean(classShare.assignmentId)}
              canPublish={
                Boolean(classShare.assignmentId) ||
                classShare.showNote !== false
              }
              onPublished={handleVoyagePublished}
              embedded
            />
          ) : null}
        </section>
      ) : null}

      {view.kind === "end" && !report && classShare ? (
        <VoyageTakeawayNote
          storyId={classShare.storyId}
          assignmentId={classShare.assignmentId}
          required={classShare.required ?? Boolean(classShare.assignmentId)}
          canPublish={
            Boolean(classShare.assignmentId) || classShare.showNote !== false
          }
          onPublished={handleVoyagePublished}
        />
      ) : null}

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
