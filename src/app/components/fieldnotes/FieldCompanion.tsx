"use client";

import { History as HistoryIcon, NotebookPen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Coco } from "@/app/components/coco";
import { DialoguePanel } from "@/app/components/dialogue/DialoguePanel";
import { useUser } from "@/app/components/user/UserProvider";
import type { DialogueHistoryEntry, Presentable } from "@/lib/dialogue";
import NotesEditor from "./NotesEditor";

type PaneId = "notes" | "coco";
type FieldCompanionProps = {
  topic: string;
  dialoguePoint: string;
  dialogueHistory: DialogueHistoryEntry[];
  speaker?: string;
};

type CocoHistoryEntry = {
  question: string;
  answer: string;
  citations?: Array<{ url: string; title?: string }>;
};

const DEFAULT_NOTE = "<p></p>";
export const COCO_GREETING_LINES = [
  "Hey there! It's your buddy, COCO! What are you curious about?",
  "Hiya, it's COCO! Ready to explore this moment together?",
  "Ahoy there, explorer! Ask me anything about what you just saw.",
  "Shoot away! I'm all ears.",
] as const;

export const COCO_GREETING_OPTIONS = [
  "What caused this historical event?",
  "Who were the key people involved?",
  "How did this moment change what came next?",
  "Actually, I was wondering about...",
] as const;

export const COCO_FOLLOWUP_LINES = [
  "I can help connect this moment to the wider story, too. Any more questions?",
  "There is always another thread to tug on if you’re curious. Any more questions?",
  "History gets more interesting the closer you look. Any more questions?",
] as const;

export const COCO_THINKING_LINES = [
  "Good question! Let me think...",
  "Swinging through my memory banks...",
  "Hang on...",
] as const;

export function FieldCompanion({
  topic,
  dialoguePoint,
  dialogueHistory,
  speaker,
}: FieldCompanionProps) {
  const [activePane, setActivePane] = useState<PaneId | null>(null);
  const [notesDraft, setNotesDraft] = useState(DEFAULT_NOTE);
  const [savedNotes, setSavedNotes] = useState(DEFAULT_NOTE);

  useEffect(() => {
    if (!activePane) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setActivePane(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activePane]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest('[contenteditable="true"]')))
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const pane = key === "n" ? "notes" : key === "m" ? "coco" : null;
      if (!pane) return;
      event.preventDefault();
      setActivePane((current) => (current === pane ? null : pane));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const togglePane = (pane: PaneId) => {
    setActivePane((current) => (current === pane ? null : pane));
  };

  return (
    <>
      <div className="fixed right-5 top-6 z-30 flex flex-col gap-2 sm:right-7 sm:top-8">
        <CompanionButton
          active={activePane === "notes"}
          label="Open notes"
          shortcut="N"
          onClick={() => togglePane("notes")}
        >
          <NotebookPen size={19} strokeWidth={1.7} />
        </CompanionButton>
        <CompanionButton
          active={activePane === "coco"}
          label="Ask Coco"
          shortcut="M"
          preserveStyle
          onClick={() => togglePane("coco")}
          className="font-display text-[16px] leading-none tracking-[-0.08em]"
        >
          ᗧ・ꈊ・ᗤ
        </CompanionButton>
      </div>

      {activePane ? (
        <>
          <div
            aria-hidden="true"
            className={`fixed inset-0 z-40 ${activePane === "coco" ? "bg-[#32271c]/20" : "bg-[#32271c]/10"}`}
            style={
              activePane === "coco"
                ? {
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }
                : { backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }
            }
          />
          {activePane === "notes" ? (
            <aside className="fixed inset-y-3 right-3 z-50 flex w-[min(460px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.4rem] border border-[#e2d9ce] bg-[#faf8f4] text-[#29241f] shadow-[0_24px_80px_rgba(48,36,24,0.18)] sm:inset-y-5">
              <NotesPane
                topic={topic}
                draft={notesDraft}
                saved={savedNotes}
                onDraftChange={setNotesDraft}
                onSave={() => setSavedNotes(notesDraft)}
                onClose={() => setActivePane(null)}
              />
            </aside>
          ) : null}
        </>
      ) : null}
      <CocoStage
        visible={activePane === "coco"}
        topic={topic}
        dialoguePoint={dialoguePoint}
        dialogueHistory={dialogueHistory}
        speaker={speaker}
        onClose={() => setActivePane(null)}
      />
    </>
  );
}

function CompanionButton({
  active,
  label,
  shortcut,
  preserveStyle = false,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  label: string;
  shortcut: string;
  preserveStyle?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      tabIndex={-1}
      onClick={onClick}
      className={`group relative flex h-11 w-11 items-center justify-center overflow-visible rounded-full border transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d] ${
        active && !preserveStyle
          ? "border-[#6b5038] bg-[#33281d] text-[#fffaf2] shadow-[0_8px_18px_rgba(48,36,24,0.18)]"
          : "border-[#e4ded6] bg-[#fffdfa]/90 text-[#6b6258] shadow-[0_5px_18px_rgba(48,36,24,0.07)] hover:border-[#c7b8a7] hover:bg-white hover:text-[#33281d]"
      } ${className}`}
    >
      <span className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
        {children}
      </span>
      <span className="pointer-events-none absolute right-[calc(100%+0.55rem)] top-1/2 -translate-y-1/2 rounded-md bg-white px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-[#6b6258] opacity-0 shadow-[0_4px_14px_rgba(48,36,24,0.12)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {shortcut}
      </span>
    </button>
  );
}

function PaneHeader({
  eyebrow,
  title,
  onClose,
  action,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between border-b border-[#e9e2d9] px-5 py-5 sm:px-7">
      <div>
        <p className="font-space text-[9px] uppercase tracking-[0.22em] text-[#9a8d7d]">
          {eyebrow}
        </p>
        <h2 className="mt-1 font-display text-[27px] leading-tight tracking-[-0.025em] text-[#30281f]">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <button
          type="button"
          aria-label="Close pane"
          onClick={onClose}
          className="rounded-full p-2 text-[#968a7b] transition-colors hover:bg-[#f0ece6] hover:text-[#30281f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d]"
        >
          <X size={18} strokeWidth={1.7} />
        </button>
      </div>
    </header>
  );
}

function NotesPane({
  topic,
  draft,
  saved,
  onDraftChange,
  onSave,
  onClose,
}: {
  topic: string;
  draft: string;
  saved: string;
  onDraftChange: (html: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const hasChanges = draft !== saved;
  const { user } = useUser();
  const ownerLabel = user
    ? `${formatPossessive(user.displayName)} Field Notes`
    : "Your Field Notes";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        eyebrow={ownerLabel}
        title={topic}
        onClose={onClose}
        action={
          <button
            type="button"
            onClick={onSave}
            disabled={!hasChanges}
            className="rounded-full bg-[#33281d] px-3.5 py-2 font-space text-[9px] uppercase tracking-[0.16em] text-[#fffaf2] transition-colors hover:bg-[#60462f] disabled:cursor-default disabled:bg-[#e8e1d8] disabled:text-[#a59a8c]"
          >
            {hasChanges ? "Save" : "Saved"}
          </button>
        }
      />
      <div className="scrollbar-pill min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-7">
        <p className="mb-5 max-w-[34ch] text-[13px] leading-6 text-[#877b6e]">
          A quiet place to collect details, questions, and connections as the
          story unfolds.
        </p>
        <NotesEditor initialContent={draft} onChange={onDraftChange} />
        <div className="mt-5 flex items-center justify-between gap-4 text-[11px] text-[#a59a8c]">
          <span>{hasChanges ? "Unsaved changes" : "Saved to this voyage"}</span>
          <span className="font-space uppercase tracking-[0.12em]">
            Private field note
          </span>
        </div>
      </div>
    </div>
  );
}

function formatPossessive(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Your";
  return trimmed.endsWith("s") || trimmed.endsWith("S")
    ? `${trimmed}'`
    : `${trimmed}'s`;
}

function CocoStage({
  visible,
  topic,
  dialoguePoint,
  dialogueHistory,
  speaker,
  onClose,
}: {
  visible: boolean;
  topic: string;
  dialoguePoint: string;
  dialogueHistory: DialogueHistoryEntry[];
  speaker?: string;
  onClose: () => void;
}) {
  const [greeting] = useState(() => {
    const index = Math.floor(Math.random() * COCO_GREETING_LINES.length);
    return COCO_GREETING_LINES[index];
  });
  const [dialogueNodes, setDialogueNodes] = useState<string[]>([greeting]);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [showOptions, setShowOptions] = useState(true);
  const [history, setHistory] = useState<CocoHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "h") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setHistoryOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  const currentDialogue = dialogueNodes[dialogueIndex] ?? greeting;
  const advanceDialogue = () => {
    if (dialogueIndex < dialogueNodes.length - 1) {
      setDialogueIndex((index) => index + 1);
      return;
    }
    if (!showOptions) setShowOptions(true);
  };

  const askCoco = async (question: string) => {
    setShowOptions(false);
    setIsThinking(true);
    const thinkingIndex = Math.floor(
      Math.random() * COCO_THINKING_LINES.length,
    );
    setDialogueNodes([COCO_THINKING_LINES[thinkingIndex]]);
    setDialogueIndex(0);
    try {
      const response = await fetch("/api/coco/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context: {
            topic,
            currentDialogue: dialoguePoint,
            speaker,
            dialogueHistory,
            history: [],
          },
        }),
      });
      const payload = (await response.json()) as {
        answer?: string;
        citations?: Array<{ url: string; title?: string }>;
        error?: string;
      };
      if (!response.ok || !payload.answer) {
        throw new Error(payload.error || "Coco could not answer");
      }
      setHistory((entries) => [
        ...entries,
        { question, answer: payload.answer!, citations: payload.citations },
      ]);
      const nodes = payload.answer
        .split(/\s*\|\|\|\s*/)
        .map((node) => node.trim())
        .filter(Boolean);
      const followupIndex = Math.floor(
        Math.random() * COCO_FOLLOWUP_LINES.length,
      );
      setDialogueNodes([
        ...(nodes.length > 0 ? nodes : ["I’m still thinking about that one."]),
        COCO_FOLLOWUP_LINES[followupIndex],
      ]);
      setDialogueIndex(0);
    } catch (error) {
      setDialogueNodes([
        error instanceof Error
          ? error.message
          : "Coco could not answer right now.",
      ]);
      setDialogueIndex(0);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <>
      <CocoSpeech
        visible={visible}
        key={currentDialogue}
        expression="talking"
        text={currentDialogue}
        canContinue={
          !isThinking &&
          (dialogueIndex < dialogueNodes.length - 1 || !showOptions)
        }
        options={showOptions && !isThinking ? COCO_GREETING_OPTIONS : undefined}
        onOption={(option) => void askCoco(option)}
        onContinue={advanceDialogue}
        onSpeechDone={(done) => {
          if (
            done &&
            !isThinking &&
            !showOptions &&
            dialogueIndex === dialogueNodes.length - 1
          ) {
            setShowOptions(true);
          }
        }}
        onClose={onClose}
      />
      <button
        type="button"
        aria-label="Open Coco history"
        aria-expanded={historyOpen}
        tabIndex={-1}
        onClick={() => setHistoryOpen((open) => !open)}
        className={`${visible ? "" : "hidden"} group pointer-events-auto fixed bottom-6 right-6 z-[70] flex h-12 w-12 items-center justify-center rounded-full border border-[#e2d9ce] bg-[#faf8f4] text-[#6b6258] shadow-[0_10px_28px_rgba(48,36,24,0.16)] transition-colors hover:bg-white hover:text-[#33281d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d]`}
      >
        <HistoryIcon size={19} strokeWidth={1.7} />
        <span className="pointer-events-none absolute right-[calc(100%+0.55rem)] top-1/2 -translate-y-1/2 rounded-md bg-white px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-[#6b6258] opacity-0 shadow-[0_4px_14px_rgba(48,36,24,0.12)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          H
        </span>
      </button>
      {visible && historyOpen ? (
        <CocoHistoryPanel
          entries={history}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </>
  );
}

function CocoHistoryPanel({
  entries,
  onClose,
}: {
  entries: CocoHistoryEntry[];
  onClose: () => void;
}) {
  return (
    <aside className="pointer-events-auto fixed inset-y-6 right-6 z-[70] flex w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#e2d9ce] bg-[#faf8f4] text-[#29241f] shadow-[0_24px_80px_rgba(48,36,24,0.2)]">
      <header className="flex items-center justify-between border-b border-[#e9e2d9] px-5 py-4">
        <div>
          <p className="font-space text-[9px] uppercase tracking-[0.2em] text-[#9a8d7d]">
            Coco history
          </p>
          <h2 className="mt-1 font-display text-[22px] text-[#30281f]">
            Previous questions
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close Coco history"
          onClick={onClose}
          className="rounded-full p-2 text-[#968a7b] transition-colors hover:bg-[#f0ece6] hover:text-[#30281f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d]"
        >
          <X size={17} strokeWidth={1.7} />
        </button>
      </header>
      <div className="scrollbar-pill min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-[12px] leading-5 text-[#8a7c6d]">
            Your Coco questions and answers will appear here.
          </p>
        ) : (
          <div className="space-y-5">
            {entries.map((entry, index) => (
              <article key={`${entry.question}-${index}`} className="space-y-3">
                <p className="rounded-xl bg-[#f5f0e9] px-3.5 py-3 text-[12px] leading-5 text-[#66594d]">
                  {entry.question}
                </p>
                <div className="px-1 text-[12px] leading-5 text-[#51463b]">
                  {entry.answer.split(/\s*\|\|\|\s*/).map((node, nodeIndex) => (
                    <p
                      key={`${nodeIndex}-${node}`}
                      className={nodeIndex ? "mt-3" : ""}
                    >
                      {node.trim()}
                    </p>
                  ))}
                </div>
                {entry.citations?.filter(isSafeCitation).length ? (
                  <div className="border-t border-[#eee8df] pt-2 text-[10px] leading-4">
                    <p className="font-space text-[8px] uppercase tracking-[0.14em] text-[#a09589]">
                      Sources
                    </p>
                    <div className="mt-1 space-y-1">
                      {entry.citations
                        .filter(isSafeCitation)
                        .map((citation) => (
                          <a
                            key={citation.url}
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[#8a6340] underline decoration-[#d9c5ad] underline-offset-2 hover:text-[#5d432c]"
                          >
                            {citation.title || citation.url}
                          </a>
                        ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function CocoSpeech({
  visible,
  expression,
  text,
  canContinue = false,
  options,
  onOption,
  onContinue,
  onSpeechDone,
  onClose,
}: {
  visible: boolean;
  expression: "idle" | "talking";
  text: string;
  canContinue?: boolean;
  options?: readonly string[];
  onOption?: (option: string) => void;
  onContinue?: () => void;
  onSpeechDone?: (done: boolean) => void;
  onClose?: () => void;
}) {
  const typingGateRef = useRef({ done: false, skip: () => undefined });
  const [speechDone, setSpeechDone] = useState(false);
  const showChoices = Boolean(speechDone && options?.length && onOption);

  const handleTypingChange = (done: boolean) => {
    setSpeechDone(done);
    onSpeechDone?.(done);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      if (!visible) return;
      if (showChoices) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      event.stopPropagation();
      if (!typingGateRef.current.done) {
        typingGateRef.current.skip();
      } else {
        onContinue?.();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onContinue, showChoices, visible]);

  const view: Presentable = showChoices
    ? {
        kind: "choice",
        id: "coco-options",
        prompt: "What are you curious about?",
        choices: options!.map((option, index) => ({
          index,
          label: option,
        })),
      }
    : {
        kind: "text",
        id: "coco-speech",
        speaker: "COCO",
        text,
        canAdvance: canContinue,
      };

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[60] items-center justify-center ${visible ? "flex" : "hidden"}`}
    >
      {onClose ? (
        <button
          type="button"
          aria-label="Close Coco"
          onClick={onClose}
          className="pointer-events-auto fixed right-5 top-5 rounded-full bg-[#faf8f4] p-2 text-[#968a7b] shadow-[0_8px_24px_rgba(48,36,24,0.12)] transition-colors hover:text-[#30281f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d]"
        >
          <X size={18} strokeWidth={1.7} />
        </button>
      ) : null}
      <div className="flex w-[min(46rem,calc(100vw-2rem))] flex-col items-center gap-5">
        <div className="relative h-[min(48vh,30rem)] w-[min(58vw,30rem)]">
          <div className="absolute inset-[7%] rounded-full bg-[#f0ece6] shadow-[0_18px_55px_rgba(77,58,37,0.12)]" />
          <div className="relative z-10 h-full w-full">
            <Coco
              expression={speechDone ? "idle" : expression}
              color="gray"
              center={{ x: 0.5, y: 0.5 }}
              scale={0.64}
            />
          </div>
        </div>
        <DialoguePanel
          className="min-h-[14rem] w-full rounded-2xl border border-[#e2d9ce] bg-[#faf8f4]/95 px-7 py-6 text-[#29241f] shadow-[0_24px_80px_rgba(48,36,24,0.18)] backdrop-blur"
          view={view}
          theme="vanilla"
          size="lg"
          typingGateRef={typingGateRef}
          showHint={false}
          onTypingChange={handleTypingChange}
          onAdvance={() => onContinue?.()}
          onChoose={(index) => {
            const option = options?.[index];
            if (option) onOption?.(option);
          }}
          onRestart={() => undefined}
        />
        {!speechDone ? (
          <p className="font-space text-[10px] uppercase tracking-[0.16em] text-[#9a8d7d]">
            Skip to end — space
          </p>
        ) : canContinue ? (
          <p className="font-space text-[10px] uppercase tracking-[0.16em] text-[#9a8d7d]">
            Continue — space
          </p>
        ) : null}
      </div>
    </div>
  );
}

function isSafeCitation(citation: { url: string; title?: string }): boolean {
  try {
    return new URL(citation.url).protocol === "https:";
  } catch {
    return false;
  }
}
