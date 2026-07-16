"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { Presentable, State } from "@/lib/dialogue";
import { DialogueBox, type DialogueBoxSize } from "./DialogueBox";
import { DialogueHeader } from "./DialogueHeader";
import { AtmosphereArt } from "./AtmosphereArt";
import { THEMES, type DialogueThemeId } from "./theme";
import type { TypingGateRef } from "./typewriter";

export type DialoguePanelProps = {
  view: Presentable;
  typingGateRef: TypingGateRef;
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onRestart: () => void;
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
  onTypingChange?: (done: boolean) => void;
  children?: ReactNode;
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
  onTypingChange,
  children,
  className = "",
}: DialoguePanelProps) {
  const theme = THEMES[themeId];

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
        <DialogueBox
          view={view}
          theme={theme}
          typingGateRef={typingGateRef}
          onAdvance={onAdvance}
          onChoose={onChoose}
          onRestart={onRestart}
          size={size}
          showHint={showHint}
          onTypingChange={onTypingChange}
        />
      </div>

      {children}
    </section>
  );
}
