import type { CSSProperties } from "react";

export type DialogueThemeId = "vanilla" | "space";

export type DialogueTheme = {
  root: string;
  toastClass: string;
  toastStyle: CSSProperties;
  eyebrow: string;
  title: string;
  heading: string;
  subtitle: string;
  metersRule: string;
  meterLabel: string;
  meterValue: string;
  meterTrack: string;
  meterFill: string;
  atmosphere: string;
  speaker: string;
  body: string;
  bodyMuted: string;
  hint: string;
  choiceSelected: string;
  choiceIdle: string;
  choiceIndex: string;
  choiceIndexSelected: string;
  choiceLabel: string;
  choiceLabelSelected: string;
  endStatRule: string;
  endStatLabel: string;
  endStatValue: string;
  restart: string;
  caret: string;
  caretMuted: string;
};

export const THEMES: Record<DialogueThemeId, DialogueTheme> = {
  vanilla: {
    root: "relative flex min-h-full flex-col bg-white text-neutral-950",
    toastClass: "font-sans",
    toastStyle: {
      background: "#ffffff",
      color: "#0a0a0a",
      border: "1px solid #e5e5e5",
      borderRadius: "2px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
      fontFamily: "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
      fontSize: "0.875rem",
      letterSpacing: "-0.01em",
      padding: "12px 14px",
    },
    eyebrow: "text-[11px] tracking-[0.22em] uppercase text-neutral-400",
    heading:
      "font-display text-3xl tracking-[-0.02em] text-neutral-950 sm:text-4xl",
    title:
      "mt-2 font-display text-3xl tracking-[-0.02em] text-neutral-950 sm:text-4xl",
    subtitle: "mt-2 max-w-md text-sm leading-relaxed text-neutral-500",
    metersRule: "flex gap-6 border-t border-neutral-200 pt-4",
    meterLabel:
      "flex items-baseline justify-between gap-2 text-[11px] tracking-[0.14em] uppercase text-neutral-500",
    meterValue: "tabular-nums text-neutral-800",
    meterTrack: "h-px w-full overflow-hidden bg-neutral-200",
    meterFill: "h-px origin-left bg-neutral-900 will-change-[width]",
    atmosphere:
      "mb-10 max-w-full overflow-x-auto border-b border-neutral-100 pb-10 font-mono text-[7px] leading-[1.1] tracking-[-0.05em] text-neutral-500 select-none sm:mb-12 sm:pb-12 sm:text-[8.5px]",
    speaker: "mb-5 text-[12px] tracking-[0.18em] uppercase text-neutral-400",
    body: "font-display text-[1.65rem] leading-[1.35] tracking-[-0.015em] text-neutral-950 sm:text-[1.85rem]",
    bodyMuted:
      "text-[1.05rem] leading-relaxed text-neutral-700 sm:text-[1.125rem]",
    hint: "text-[11px] tracking-[0.16em] uppercase text-neutral-400 transition-colors group-hover:text-neutral-700 group-focus-visible:text-neutral-700",
    choiceSelected: "bg-neutral-100",
    choiceIdle: "bg-transparent hover:bg-neutral-100/70",
    choiceIndex: "text-neutral-400",
    choiceIndexSelected: "text-neutral-900",
    choiceLabel: "text-neutral-800",
    choiceLabelSelected: "text-neutral-950",
    endStatRule:
      "mt-10 grid grid-cols-3 gap-4 border-t border-neutral-200 pt-6 text-sm",
    endStatLabel: "text-[11px] tracking-[0.14em] uppercase text-neutral-400",
    endStatValue: "mt-1 tabular-nums text-neutral-950",
    restart:
      "mt-auto self-start pt-14 text-[11px] tracking-[0.18em] uppercase text-neutral-500 transition-colors hover:text-neutral-950 focus-visible:text-neutral-950 focus-visible:outline-none",
    caret: "bg-neutral-950",
    caretMuted: "bg-neutral-700",
  },
  space: {
    root: "relative flex min-h-full flex-col bg-black text-white font-space",
    toastClass: "font-space",
    toastStyle: {
      background: "#000000",
      color: "#ffffff",
      border: "1px solid #333333",
      borderRadius: "2px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      fontFamily: "var(--font-space-mono), ui-monospace, monospace",
      fontSize: "0.875rem",
      letterSpacing: "0",
      padding: "12px 14px",
    },
    eyebrow: "text-[11px] tracking-[0.22em] uppercase text-white/45",
    heading: "font-space text-3xl tracking-[-0.02em] text-white sm:text-4xl",
    title: "mt-2 font-space text-3xl tracking-[-0.02em] text-white sm:text-4xl",
    subtitle: "mt-2 max-w-md text-sm leading-relaxed text-white/55",
    metersRule: "flex gap-6 border-t border-white/20 pt-4",
    meterLabel:
      "flex items-baseline justify-between gap-2 text-[11px] tracking-[0.14em] uppercase text-white/45",
    meterValue: "tabular-nums text-white",
    meterTrack: "h-px w-full overflow-hidden bg-white/20",
    meterFill: "h-px origin-left bg-white will-change-[width]",
    atmosphere:
      "mb-10 max-w-full overflow-x-auto border-b border-white/15 pb-10 font-space text-[7px] leading-[1.1] tracking-[-0.05em] text-white/40 select-none sm:mb-12 sm:pb-12 sm:text-[8.5px]",
    speaker: "mb-5 text-[12px] tracking-[0.18em] uppercase text-white/45",
    body: "font-space text-[1.65rem] leading-[1.35] tracking-[-0.015em] text-white sm:text-[1.85rem]",
    bodyMuted:
      "text-[1.05rem] leading-relaxed text-white/70 sm:text-[1.125rem]",
    hint: "text-[11px] tracking-[0.16em] uppercase text-white/40 transition-colors group-hover:text-white/75 group-focus-visible:text-white/75",
    choiceSelected: "bg-white/10",
    choiceIdle: "bg-transparent hover:bg-white/5",
    choiceIndex: "text-white/40",
    choiceIndexSelected: "text-white",
    choiceLabel: "text-white/80",
    choiceLabelSelected: "text-white",
    endStatRule:
      "mt-10 grid grid-cols-3 gap-4 border-t border-white/20 pt-6 text-sm",
    endStatLabel: "text-[11px] tracking-[0.14em] uppercase text-white/45",
    endStatValue: "mt-1 tabular-nums text-white",
    restart:
      "mt-auto self-start pt-14 text-[11px] tracking-[0.18em] uppercase text-white/50 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none",
    caret: "bg-white",
    caretMuted: "bg-white/70",
  },
};
