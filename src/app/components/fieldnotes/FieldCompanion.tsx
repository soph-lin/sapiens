"use client";

import {
  History as HistoryIcon,
  NotebookPen,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Coco } from "@/app/components/coco";
import { DialoguePanel } from "@/app/components/dialogue/DialoguePanel";
import { useUser } from "@/app/components/user/UserProvider";
import type { DialogueHistoryEntry, Presentable } from "@/lib/dialogue";
import { formatRelativeTime } from "@/lib/util/format-relative-time";
import {
  isPrivateNoteContent,
  privateNoteContent,
} from "@/lib/learning/field-note-content";
import CocoIcon from "@/app/components/icons/CocoIcon";
import NotesEditor from "./NotesEditor";

type PaneId = "notes" | "coco";
type FieldCompanionProps = {
  topic: string;
  /** Persisted FieldNote.storyId when sailing a DB voyage. */
  storyId?: string;
  /** Assigned classroom voyage; omit for solo. */
  assignmentId?: string;
  dialoguePoint: string;
  dialogueHistory: DialogueHistoryEntry[];
  speaker?: string;
  /** Fires when Coco overlay opens/closes so the story can release Space/Enter. */
  onCocoOpenChange?: (open: boolean) => void;
};

type PrivateFieldNote = {
  id: string;
  content: string;
  heading: string;
  createdAt: string;
  authorType?: string | null;
};

type PendingNavigation = { kind: "select"; noteId: string } | { kind: "close" };

type FieldNotePayload = {
  id: string;
  authorId: string;
  authorType?: string | null;
  title?: string | null;
  content: unknown;
  createdAt: string;
};

type CocoHistoryEntry = {
  question: string;
  answer: string;
  citations?: Array<{ url: string; title?: string }>;
  sources?: string[];
};

const DEFAULT_NOTE = "<p></p>";
export const COCO_GREETING_LINES = [
  "Hey there! It's your buddy, Coco! What are you curious about?",
  "Hiya, it's Coco! Ready to explore this moment together?",
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
  storyId,
  assignmentId,
  dialoguePoint,
  dialogueHistory,
  speaker,
  onCocoOpenChange,
}: FieldCompanionProps) {
  const [activePane, setActivePane] = useState<PaneId | null>(null);
  const notesCloseGuardRef = useRef<(() => boolean) | null>(null);
  /** Coco: return false to keep the overlay open (e.g. paging an answer). */
  const cocoEscapeGuardRef = useRef<(() => boolean) | null>(null);

  useEffect(() => {
    onCocoOpenChange?.(activePane === "coco");
    return () => {
      onCocoOpenChange?.(false);
    };
  }, [activePane, onCocoOpenChange]);

  useEffect(() => {
    if (!activePane) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (activePane === "notes" && notesCloseGuardRef.current?.() === false) {
        return;
      }
      if (activePane === "coco" && cocoEscapeGuardRef.current?.() === false) {
        return;
      }
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

  const requestCloseNotes = () => {
    if (notesCloseGuardRef.current?.() === false) return;
    setActivePane(null);
  };

  const togglePane = (pane: PaneId) => {
    setActivePane((current) => {
      if (current === pane) {
        if (pane === "notes" && notesCloseGuardRef.current?.() === false) {
          return current;
        }
        return null;
      }
      if (
        current === "notes" &&
        pane !== "notes" &&
        notesCloseGuardRef.current?.() === false
      ) {
        return current;
      }
      return pane;
    });
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
          <CocoIcon size={30} />
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
                : {
                    backdropFilter: "blur(2px)",
                    WebkitBackdropFilter: "blur(2px)",
                  }
            }
          />
          {activePane === "notes" ? (
            <aside className="fixed inset-y-3 right-3 z-50 flex w-[min(460px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.4rem] border border-[#e2d9ce] bg-[#faf8f4] text-[#29241f] shadow-[0_24px_80px_rgba(48,36,24,0.18)] sm:inset-y-5">
              <NotesPane
                topic={topic}
                storyId={storyId}
                assignmentId={assignmentId}
                onClose={requestCloseNotes}
                closeGuardRef={notesCloseGuardRef}
              />
            </aside>
          ) : null}
        </>
      ) : null}
      <CocoStage
        visible={activePane === "coco"}
        topic={topic}
        storyId={storyId}
        assignmentId={assignmentId}
        dialoguePoint={dialoguePoint}
        dialogueHistory={dialogueHistory}
        speaker={speaker}
        escapeGuardRef={cocoEscapeGuardRef}
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
  storyId,
  assignmentId,
  onClose,
  closeGuardRef,
}: {
  topic: string;
  storyId?: string;
  assignmentId?: string;
  onClose: () => void;
  closeGuardRef: React.MutableRefObject<(() => boolean) | null>;
}) {
  const { user } = useUser();
  const canPersist = Boolean(storyId) && Boolean(user);
  const [notes, setNotes] = useState<PrivateFieldNote[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState(DEFAULT_NOTE);
  const [baseline, setBaseline] = useState(DEFAULT_NOTE);
  const [editorKey, setEditorKey] = useState(0);
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ignoreEditorChangeRef = useRef(false);
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  const activeIdRef = useRef(activeId);

  draftRef.current = draft;
  baselineRef.current = baseline;
  activeIdRef.current = activeId;

  const isCreatingNew = activeId === null;
  const hasChanges = draft !== baseline;
  const canSaveNew =
    canPersist && isCreatingNew && hasChanges && !isEmptyNote(draft) && !saving;
  const ownerLabel = user
    ? `${formatPossessive(user.displayName)} Field Notes`
    : "Your Field Notes";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      setLoadState("ready");
      setLoadError(null);
      return;
    }
    if (!storyId) {
      setNotes([]);
      setLoadState("ready");
      setLoadError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadState("loading");
      setLoadError(null);
      try {
        const params = new URLSearchParams({ storyId });
        if (assignmentId) params.set("assignmentId", assignmentId);
        const response = await fetch(`/api/field-notes?${params}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          notes?: FieldNotePayload[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load field notes.");
        }
        if (cancelled) return;
        const next = (payload.notes ?? [])
          .filter(
            (note) =>
              note.authorId === user.id &&
              (note.authorType === "user" ||
                note.authorType === "coco" ||
                note.authorType == null) &&
              isPrivateNoteContent(note.content),
          )
          .map(toPrivateFieldNote);
        setNotes(next);
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadState("error");
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load field notes.",
        );
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, storyId, user]);

  const beginEditorSession = (content: string, noteId: string | null) => {
    ignoreEditorChangeRef.current = true;
    setActiveId(noteId);
    setDraft(content);
    setBaseline(content);
    setEditorKey((key) => key + 1);
    setSaveError(null);
    window.setTimeout(() => {
      ignoreEditorChangeRef.current = false;
    }, 50);
  };

  const handleDraftChange = (html: string) => {
    if (ignoreEditorChangeRef.current) return;
    setDraft(html);
  };

  const persistExisting = async (noteId: string, html: string) => {
    if (!canPersist) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/field-notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: extractHeading(html),
          content: privateNoteContent(html),
          status: "draft",
        }),
      });
      const payload = (await response.json()) as {
        note?: FieldNotePayload;
        error?: string;
      };
      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "Could not save field note.");
      }
      const saved = toPrivateFieldNote(payload.note);
      setNotes((current) =>
        current.map((note) => (note.id === noteId ? saved : note)),
      );
      if (activeIdRef.current === noteId) {
        setBaseline(html);
      }
      return true;
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save field note.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Auto-save while editing an existing note.
  useEffect(() => {
    if (!activeId || draft === baseline || ignoreEditorChangeRef.current)
      return;
    if (isEmptyNote(draft) && !isEmptyNote(baseline)) return;
    if (!canPersist) return;
    const noteId = activeId;
    const html = draft;
    const timer = window.setTimeout(() => {
      void persistExisting(noteId, html);
    }, 450);
    return () => window.clearTimeout(timer);
    // persistExisting closes over latest setters; intentionally omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on draft only
  }, [activeId, baseline, canPersist, draft]);

  const flushActiveEdits = async () => {
    const noteId = activeIdRef.current;
    const html = draftRef.current;
    const saved = baselineRef.current;
    if (!noteId || html === saved) return true;
    if (isEmptyNote(html) && !isEmptyNote(saved)) return true;
    return persistExisting(noteId, html);
  };

  const loadNote = (note: PrivateFieldNote) => {
    beginEditorSession(note.content, note.id);
  };

  const startNew = () => {
    void flushActiveEdits().then(() => {
      beginEditorSession(DEFAULT_NOTE, null);
    });
  };

  const saveNewNote = async () => {
    if (!canSaveNew || !storyId) return null;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/field-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(assignmentId ? { assignmentId } : {}),
          storyId,
          title: extractHeading(draft),
          content: privateNoteContent(draft),
          status: "draft",
        }),
      });
      const payload = (await response.json()) as {
        note?: FieldNotePayload;
        error?: string;
      };
      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "Could not save field note.");
      }
      const saved = toPrivateFieldNote(payload.note);
      setNotes((current) => [
        saved,
        ...current.filter((n) => n.id !== saved.id),
      ]);
      setActiveId(saved.id);
      setBaseline(draft);
      return saved;
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save field note.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteActiveNote = async () => {
    if (activeId && canPersist) {
      setSaving(true);
      setSaveError(null);
      try {
        const response = await fetch(`/api/field-notes/${activeId}`, {
          method: "DELETE",
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not delete field note.");
        }
        setNotes((current) => current.filter((note) => note.id !== activeId));
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Could not delete field note.",
        );
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    beginEditorSession(DEFAULT_NOTE, null);
  };

  const requestSelectNote = (noteId: string) => {
    if (noteId === activeId) return;
    if (isCreatingNew && hasChanges && !isEmptyNote(draft)) {
      setPending({ kind: "select", noteId });
      return;
    }
    void flushActiveEdits().then(() => {
      const note = notes.find((entry) => entry.id === noteId);
      if (note) loadNote(note);
    });
  };

  const requestClose = () => {
    if (isCreatingNew && hasChanges && !isEmptyNote(draft)) {
      setPending({ kind: "close" });
      return false;
    }
    void flushActiveEdits();
    return true;
  };

  useEffect(() => {
    closeGuardRef.current = () => {
      if (isCreatingNew && hasChanges && !isEmptyNote(draft)) {
        setPending({ kind: "close" });
        return false;
      }
      void flushActiveEdits();
      return true;
    };
    return () => {
      closeGuardRef.current = null;
    };
  }, [closeGuardRef, draft, hasChanges, isCreatingNew]);

  const resolvePending = async (action: "save" | "discard" | "cancel") => {
    if (!pending) return;
    if (action === "cancel") {
      setPending(null);
      return;
    }

    const navigation = pending;
    if (action === "save") {
      const saved = await saveNewNote();
      setPending(null);
      if (!saved) return;
      if (navigation.kind === "select") {
        const target = notes.find((entry) => entry.id === navigation.noteId);
        if (target) loadNote(target);
        return;
      }
      onClose();
      return;
    }

    setPending(null);
    if (navigation.kind === "select") {
      const target = notes.find((entry) => entry.id === navigation.noteId);
      if (target) loadNote(target);
      else beginEditorSession(DEFAULT_NOTE, null);
      return;
    }
    beginEditorSession(DEFAULT_NOTE, null);
    onClose();
  };

  const handleHeaderClose = () => {
    if (requestClose()) onClose();
  };

  const statusLabel = (() => {
    if (loadState === "loading") return "Loading field notes…";
    if (loadState === "error")
      return loadError ?? "Could not load field notes.";
    if (saveError) return saveError;
    if (!user) return "Sign in to keep your notes";
    if (saving || (activeId && hasChanges)) return "Saving…";
    if (isCreatingNew) return hasChanges ? "Unsaved draft" : "New field note";
    return "Saved";
  })();
  const statusIsError = loadState === "error" || Boolean(saveError);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PaneHeader
        eyebrow={ownerLabel}
        title={topic}
        onClose={handleHeaderClose}
      />
      <div className="scrollbar-pill min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-7">
        <p className="mb-5 max-w-[34ch] text-[13px] leading-6 text-[#877b6e]">
          A quiet place to collect details, questions, and connections as the
          story unfolds.
        </p>
        <NotesEditor
          key={editorKey}
          initialContent={draft}
          onChange={handleDraftChange}
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <span
            className={`min-w-0 flex-1 truncate text-left font-space text-[9px] uppercase tracking-[0.12em] ${
              statusIsError ? "text-[#8a3b2c]" : "text-[#a59a8c]"
            }`}
            title={statusLabel}
            role={statusIsError ? "alert" : undefined}
            aria-live="polite"
          >
            {statusLabel}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <IconAction
              label="Save"
              disabled={!canSaveNew}
              onClick={() => {
                void saveNewNote();
              }}
            >
              <Save size={17} strokeWidth={1.7} />
            </IconAction>
            {!isCreatingNew ? (
              <IconAction label="New" disabled={saving} onClick={startNew}>
                <Plus size={17} strokeWidth={1.7} />
              </IconAction>
            ) : null}
            <IconAction
              label="Delete"
              disabled={
                saving || (isCreatingNew && (!hasChanges || isEmptyNote(draft)))
              }
              onClick={() => {
                void deleteActiveNote();
              }}
            >
              <Trash2 size={17} strokeWidth={1.7} />
            </IconAction>
          </div>
        </div>

        {notes.length > 0 ? (
          <ul className="mt-6 space-y-1.5" aria-label="Private field notes">
            {notes.map((note) => {
              const selected = note.id === activeId;
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => requestSelectNote(note.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d] ${
                      selected
                        ? "bg-[#efe8df] text-[#29241f]"
                        : "bg-[#faf8f4] text-[#29241f] hover:bg-[#efe8df]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {note.authorType === "coco" ? (
                        <CocoIcon
                          size={14}
                          color="#9a8d7d"
                          className="shrink-0"
                          title="From Coco"
                        />
                      ) : null}
                      <span className="min-w-0 truncate text-[13px] leading-5">
                        {note.heading}
                      </span>
                    </span>
                    <span className="shrink-0 font-space text-[10px] uppercase tracking-[0.08em] text-[#9a8d7d]">
                      {formatRelativeTime(note.createdAt, now)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {pending ? (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-[#32271c]/25 p-5 sm:items-center">
          <div
            role="alertdialog"
            aria-labelledby="unsaved-note-title"
            aria-describedby="unsaved-note-desc"
            className="w-full max-w-[22rem] rounded-2xl border border-[#e2d9ce] bg-[#faf8f4] p-5 text-[#29241f] shadow-[0_18px_50px_rgba(48,36,24,0.22)]"
          >
            <h3
              id="unsaved-note-title"
              className="font-display text-[20px] leading-tight tracking-[-0.02em]"
            >
              Save changes?
            </h3>
            <p
              id="unsaved-note-desc"
              className="mt-2 text-[13px] leading-5 text-[#877b6e]"
            >
              You have an unsaved field note. Save it before leaving, or discard
              the draft.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void resolvePending("cancel")}
                className="rounded-full px-3.5 py-2 font-space text-[9px] uppercase tracking-[0.14em] text-[#6b6258] transition-colors hover:bg-[#efe8df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void resolvePending("discard")}
                className="rounded-full px-3.5 py-2 font-space text-[9px] uppercase tracking-[0.14em] text-[#8a3b2c] transition-colors hover:bg-[#f3e4df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d]"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void resolvePending("save")}
                disabled={!canSaveNew}
                className="rounded-full bg-[#33281d] px-3.5 py-2 font-space text-[9px] uppercase tracking-[0.14em] text-[#fffaf2] transition-colors hover:bg-[#60462f] disabled:cursor-default disabled:bg-[#e8e1d8] disabled:text-[#a59a8c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toPrivateFieldNote(note: FieldNotePayload): PrivateFieldNote {
  const html = isPrivateNoteContent(note.content)
    ? note.content.html
    : DEFAULT_NOTE;
  return {
    id: note.id,
    content: html,
    heading:
      (typeof note.title === "string" && note.title.trim()) ||
      extractHeading(html),
    createdAt: note.createdAt,
    authorType: note.authorType,
  };
}

function IconAction({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="group relative rounded-full p-2 text-[#29241f] transition-colors hover:bg-[#efe8df] disabled:cursor-default disabled:text-[#c4bbb0] disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#96734d]"
    >
      {children}
      <span className="pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-[#6b6258] opacity-0 shadow-[0_4px_14px_rgba(48,36,24,0.12)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:hidden">
        {label}
      </span>
    </button>
  );
}

function extractHeading(html: string): string {
  if (typeof window === "undefined") return "Untitled note";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const heading = doc.querySelector("h1, h2, h3");
  const headingText = heading?.textContent?.replace(/\s+/g, " ").trim();
  if (headingText) return headingText;
  const text = doc.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return "Untitled note";
  return text.length > 52 ? `${text.slice(0, 52)}…` : text;
}

function isEmptyNote(html: string): boolean {
  if (typeof window === "undefined") return html === DEFAULT_NOTE;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return !doc.body.textContent?.trim();
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
  storyId,
  assignmentId,
  dialoguePoint,
  dialogueHistory,
  speaker,
  escapeGuardRef,
  onClose,
}: {
  visible: boolean;
  topic: string;
  storyId?: string;
  assignmentId?: string;
  dialoguePoint: string;
  dialogueHistory: DialogueHistoryEntry[];
  speaker?: string;
  escapeGuardRef: React.MutableRefObject<(() => boolean) | null>;
  onClose: () => void;
}) {
  // Deterministic pick so SSR and client match (Math.random in useState hydrates differently).
  const [greeting] = useState(() => {
    const seed = `${topic}\0${dialoguePoint}\0${storyId ?? ""}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return COCO_GREETING_LINES[
      Math.abs(hash) % COCO_GREETING_LINES.length
    ]!;
  });
  const [dialogueNodes, setDialogueNodes] = useState<string[]>([greeting]);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [showOptions, setShowOptions] = useState(true);
  const [history, setHistory] = useState<CocoHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const isThinkingRef = useRef(false);
  const showOptionsRef = useRef(true);
  /** When true, reset idle greeting only after the overlay is hidden (no flash). */
  const resetWhenHiddenRef = useRef(false);

  isThinkingRef.current = isThinking;
  showOptionsRef.current = showOptions;

  const abortInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    isThinkingRef.current = false;
    setIsThinking(false);
  }, []);

  const resetDialogue = useCallback(() => {
    abortInFlight();
    resetWhenHiddenRef.current = false;
    setDialogueNodes([greeting]);
    setDialogueIndex(0);
    setShowOptions(true);
  }, [abortInFlight, greeting]);

  // After cancel/close: reset idle state only once hidden so greeting never flashes.
  useEffect(() => {
    if (visible) return;
    if (!resetWhenHiddenRef.current && !abortRef.current) return;
    resetDialogue();
  }, [visible, resetDialogue]);

  useEffect(() => {
    escapeGuardRef.current = () => {
      // Paging through an already-generated answer — keep the overlay open.
      if (!isThinkingRef.current && !showOptionsRef.current) {
        return false;
      }
      // Still waiting on the model — cancel now; reset greeting after hide.
      if (isThinkingRef.current || abortRef.current) {
        abortInFlight();
        resetWhenHiddenRef.current = true;
      }
      return true;
    };
    return () => {
      escapeGuardRef.current = null;
    };
  }, [abortInFlight, escapeGuardRef]);

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
    abortRef.current?.abort();
    requestIdRef.current += 1;
    const controller = new AbortController();
    const requestId = requestIdRef.current;
    abortRef.current = controller;
    resetWhenHiddenRef.current = false;
    setShowOptions(false);
    setIsThinking(true);
    isThinkingRef.current = true;
    const thinkingIndex = Math.floor(
      Math.random() * COCO_THINKING_LINES.length,
    );
    setDialogueNodes([COCO_THINKING_LINES[thinkingIndex]]);
    setDialogueIndex(0);
    try {
      const response = await fetch("/api/coco/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question,
          context: {
            topic,
            storyId,
            assignmentId,
            ...(COCO_GREETING_OPTIONS.includes(
              question as (typeof COCO_GREETING_OPTIONS)[number],
            )
              ? { prefilledOption: question }
              : {}),
            currentDialogue: dialoguePoint,
            speaker,
            dialogueHistory,
            history: [],
          },
        }),
      });
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }
      const payload = (await response.json()) as {
        answer?: string;
        summary?: string;
        noteTitle?: string;
        sources?: string[];
        citations?: Array<{ url: string; title?: string }>;
        fieldNoteId?: string;
        error?: string;
      };
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }
      if (!response.ok || !payload.answer) {
        throw new Error(payload.error || "Coco could not answer");
      }
      setHistory((entries) => [
        ...entries,
        {
          question,
          answer: payload.answer!,
          citations: payload.citations,
          sources: payload.sources,
        },
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
      if (
        controller.signal.aborted ||
        requestId !== requestIdRef.current ||
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        return;
      }
      setDialogueNodes([
        error instanceof Error
          ? error.message
          : "Coco could not answer right now.",
      ]);
      setDialogueIndex(0);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (requestId === requestIdRef.current) {
        isThinkingRef.current = false;
        setIsThinking(false);
      }
    }
  };

  const handleClose = () => {
    if (isThinkingRef.current || abortRef.current) {
      abortInFlight();
      resetWhenHiddenRef.current = true;
    }
    onClose();
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
        onClose={handleClose}
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [speechDone, setSpeechDone] = useState(false);
  const hasOptions = Boolean(options?.length && onOption);
  // If options arrive after the current line already finished typing (answer →
  // follow-up choices), show the prompt instantly so it doesn't retype.
  const promptTypingEnabled = !(hasOptions && speechDone);

  const handleTypingChange = (done: boolean) => {
    setSpeechDone(done);
    onSpeechDone?.(done);
  };

  // ChoiceBeat may try to focus while this overlay is `display: none` (always
  // mounted). Re-assert focus once the stage is actually visible.
  useEffect(() => {
    if (!visible || !hasOptions || !speechDone) return;
    const id = window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLButtonElement>('[data-choice-index="0"]')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [visible, hasOptions, speechDone, text]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      if (!visible) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      // Let focused choices activate natively (story Space is already disabled).
      if (target instanceof HTMLElement && target.closest('[role="option"]')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Choices are ready — Coco's DialoguePanel owns continue; don't page here.
      if (hasOptions && speechDone) return;
      if (!typingGateRef.current.done) {
        typingGateRef.current.skip();
      } else {
        onContinue?.();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hasOptions, onContinue, speechDone, visible]);

  // One typewriter pass: use the spoken line as the choice prompt. Avoids
  // greeting → “What are you curious about?” double flash on reopen.
  const view: Presentable = hasOptions
    ? {
        kind: "choice",
        id: "coco-options",
        prompt: text,
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
      <div
        ref={panelRef}
        className="pointer-events-auto flex w-[min(46rem,calc(100vw-2rem))] flex-col items-center gap-5"
      >
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
          className="min-h-[14rem] w-full rounded-2xl border border-[#e2d9ce] bg-[#faf8f4]/95 px-7 py-6 text-[#29241f] shadow-[0_24px_80px_rgba(48,36,24,0.18)] backdrop-blur [&_[aria-selected=true]]:!bg-[#efe8df]"
          view={view}
          theme="vanilla"
          size="lg"
          typingGateRef={typingGateRef}
          typingEnabled={promptTypingEnabled}
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
