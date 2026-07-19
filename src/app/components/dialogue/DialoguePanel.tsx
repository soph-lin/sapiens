"use client";

import Image from "next/image";
import { useCallback, useEffect, useEffectEvent, useState, type ReactNode } from "react";
import type { Presentable, State } from "@/lib/dialogue";
import {
  DialogueBox,
  dialogueContinueHint,
  type DialogueBoxSize,
  type DialogueDropdownChoice,
  type DialogueEditableChoice,
} from "./DialogueBox";
import { DialogueHeader } from "./DialogueHeader";
import { AtmosphereArt } from "./AtmosphereArt";
import { THEMES, type DialogueTheme, type DialogueThemeId } from "./theme";
import type { TypingGateRef } from "./typewriter";

function DialogueBoxWithHint({
  view,
  theme,
  typingGateRef,
  onAdvance,
  onChoose,
  onRestart,
  size,
  showHint,
  typingEnabled,
  onTypingChange,
  richText,
  editableChoice,
  dropdownChoice,
}: {
  view: Presentable;
  theme: DialogueTheme;
  typingGateRef: TypingGateRef;
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onRestart: () => void;
  size?: DialogueBoxSize;
  showHint?: boolean;
  typingEnabled?: boolean;
  onTypingChange?: (done: boolean) => void;
  richText?: boolean;
  editableChoice?: DialogueEditableChoice;
  dropdownChoice?: DialogueDropdownChoice;
}) {
  const [typingDone, setTypingDone] = useState(false);
  const handleTypingChange = useCallback(
    (done: boolean) => {
      setTypingDone(done);
      onTypingChange?.(done);
    },
    [onTypingChange],
  );
  const continueHint =
    showHint === false ? null : dialogueContinueHint(view, typingDone);

  return (
    <>
      <DialogueBox
        view={view}
        theme={theme}
        typingGateRef={typingGateRef}
        onAdvance={onAdvance}
        onChoose={onChoose}
        onRestart={onRestart}
        size={size}
        typingEnabled={typingEnabled}
        onTypingChange={handleTypingChange}
        richText={richText}
        editableChoice={editableChoice}
        dropdownChoice={dropdownChoice}
      />
      {continueHint ? (
        <p className={`${theme.hint} mt-6`}>{continueHint}</p>
      ) : null}
    </>
  );
}

function isEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
  );
}

export type DialoguePanelProps = {
  view: Presentable;
  typingGateRef: TypingGateRef;
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onRestart: () => void;
  /** Optional keyboard escape action for an enclosing dialogue layer. */
  onEscape?: () => void;
  /** Optional keyboard back action. Renders a `Back — q` helper, without a button. */
  onBack?: () => void;
  theme?: DialogueThemeId;
  title?: string;
  subtitle?: string;
  state?: State;
  showStats?: boolean;
  /** Optional decorative braille / monospace scene above the dialogue. */
  atmosphereArt?: string;
  characterPortrait?: { name: string; assetUrl?: string };
  revealKey?: number;
  size?: DialogueBoxSize;
  showHint?: boolean;
  /**
   * When false, Space/Enter do not advance or skip typewriter. Use while an
   * overlay (e.g. Coco) owns those keys. Default true.
   */
  keyboardEnabled?: boolean;
  /** When false, choice prompts appear instantly (no typewriter). Default true. */
  typingEnabled?: boolean;
  onTypingChange?: (done: boolean) => void;
  /** Inline markdown for dialogue body text (Coco). Default false. */
  richText?: boolean;
  children?: ReactNode;
  editableChoice?: DialogueEditableChoice;
  dropdownChoice?: DialogueDropdownChoice;
  className?: string;
};

/**
 * The shared dialogue presentation surface. It knows how to display a
 * presentable view, but not where that view came from or how it is produced.
 */
export function DialoguePanel({
  view,
  typingGateRef,
  onAdvance,
  onChoose,
  onRestart,
  onEscape,
  onBack,
  theme: themeId = "vanilla",
  title,
  subtitle,
  state,
  showStats = false,
  atmosphereArt,
  characterPortrait,
  revealKey,
  size,
  showHint,
  keyboardEnabled = true,
  typingEnabled,
  onTypingChange,
  richText = false,
  children,
  editableChoice,
  dropdownChoice,
  className = "",
}: DialoguePanelProps) {
  const theme = THEMES[themeId];
  const hintKey =
    view.kind === "text"
      ? `${revealKey ?? 0}:${view.id}`
      : `${revealKey ?? 0}:${view.kind}`;

  // Shared Space/Enter continue: map/home dialogue never mounts
  // useDialogueSession, so this must live on the panel itself. Capture-phase
  // preventDefault also stops the browser from scrolling the page when focus
  // is on the document body rather than the text beat button.
  const handleContinueIntent = useEffectEvent(() => {
    if (!typingGateRef.current.done) {
      typingGateRef.current.skip();
      return;
    }
    onAdvance();
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscape) {
        // Free-text / select fields handle Escape locally (blur first).
        if (isEditingTarget(event.target)) return;
        event.preventDefault();
        onEscape();
        return;
      }

      if (isEditingTarget(event.target)) return;

      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "q" &&
        onBack
      ) {
        event.preventDefault();
        onBack();
        return;
      }

      if (event.key !== " " && event.key !== "Enter") return;
      if (!keyboardEnabled) return;
      // Let choice options keep native Space/Enter activation.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[role="option"]')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleContinueIntent();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keyboardEnabled, onBack, onEscape]);

  return (
    <section className={`text-white ${className}`}>
      {title ? (
        <DialogueHeader
          title={title}
          subtitle={subtitle}
          state={state}
          showStats={showStats}
          theme={theme}
        />
      ) : null}

      {showStats && state ? (
        <div aria-hidden="true" className="h-10 shrink-0 sm:h-12" />
      ) : null}

      {atmosphereArt ? <AtmosphereArt art={atmosphereArt} theme={theme} /> : null}

      {characterPortrait?.assetUrl ? (
        <div className="flex justify-start pb-4">
          <Image
            src={characterPortrait.assetUrl}
            alt={`${characterPortrait.name} portrait`}
            width={256}
            height={256}
            unoptimized
            className="block h-64 w-64 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      ) : null}

      <div key={revealKey} className="flex min-h-0 flex-col">
        <DialogueBoxWithHint
          key={hintKey}
          view={view}
          theme={theme}
          typingGateRef={typingGateRef}
          onAdvance={onAdvance}
          onChoose={onChoose}
          onRestart={onRestart}
          size={size}
          showHint={showHint}
          typingEnabled={typingEnabled}
          onTypingChange={onTypingChange}
          richText={richText}
          editableChoice={editableChoice}
          dropdownChoice={dropdownChoice}
        />
      </div>

      {onBack ? <p className={`${theme.hint} mt-6`}>Back — q</p> : null}

      {children}
    </section>
  );
}
