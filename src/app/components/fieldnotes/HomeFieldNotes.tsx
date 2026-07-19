"use client";

import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  NotebookPen,
  Ship,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/app/components/user/UserProvider";
import { VISITOR_NOTE_HEADER } from "@/lib/learning/starstream-constants";

type FieldNote = {
  id: string;
  authorName: string | null;
  authorType: "user" | "bot";
  content: unknown;
  createdAt: string;
  sources: unknown;
  story: { topic: string };
  publishedToStarstream?: boolean;
  starstreamLogType?: string | null;
  starstreamLog?: { id: string; type?: string } | null;
};

type HomeFieldNotesProps = { refreshKey?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function noteBody(value: unknown) {
  if (isRecord(value) && typeof value.body === "string") return value.body;
  return typeof value === "string"
    ? value
    : "A new field note is waiting in your log.";
}

function noteSources(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (source): source is string =>
      typeof source === "string" && Boolean(source.trim()),
  );
}

function sourceLabel(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path =
      parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return path ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

function seenStorageKey(username: string | undefined) {
  return `sapiens:home:read-field-notes:${username ?? "anonymous"}`;
}

function readSeenIds(key: string) {
  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : [];
    return new Set<string>(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "New note";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatPossessive(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Your";
  return trimmed.endsWith("s") || trimmed.endsWith("S")
    ? `${trimmed}'`
    : `${trimmed}'s`;
}

export default function HomeFieldNotes({
  refreshKey = 0,
}: HomeFieldNotesProps) {
  const { user } = useUser();
  const storageKey = seenStorageKey(user?.username);
  const headerTitle = user
    ? `${formatPossessive(user.displayName)} visitor notes`
    : "Your visitor notes";
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [openSourcesId, setOpenSourcesId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [composeId, setComposeId] = useState<string | null>(null);
  const [commentaryDraft, setCommentaryDraft] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSeenIds(readSeenIds(storageKey)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const loadNotes = useCallback(async () => {
    if (!user) {
      setNotes([]);
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/field-notes", { cache: "no-store" });
      const payload = (await response.json()) as {
        notes?: unknown;
        error?: unknown;
      };
      if (!response.ok)
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Could not load field notes.",
        );
      const next = Array.isArray(payload.notes)
        ? payload.notes.filter((note): note is FieldNote => {
            if (!isRecord(note)) return false;
            return (
              typeof note.id === "string" &&
              (note.authorType === "bot" || note.authorType === "user")
            );
          })
        : [];
      setNotes(next);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load field notes.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadNotes(), 0);
    const interval = window.setInterval(() => void loadNotes(), 15000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadNotes, refreshKey]);

  const botNotes = useMemo(
    () => notes.filter((note) => note.authorType === "bot"),
    [notes],
  );
  const unreadNotes = botNotes.filter((note) => !seenIds.has(note.id));

  const openNotes = useCallback(() => {
    setIsOpen(true);
    const nextSeen = new Set(seenIds);
    botNotes.forEach((note) => nextSeen.add(note.id));
    setSeenIds(nextSeen);
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([...nextSeen].slice(-200)),
      );
    } catch {
      // Reading notes still works when storage is unavailable.
    }
  }, [botNotes, seenIds, storageKey]);

  const closeNotes = useCallback(() => {
    setIsOpen(false);
    setOpenSourcesId(null);
    setComposeId(null);
    setCommentaryDraft("");
    setPublishError(null);
  }, []);

  const startCompose = (noteId: string) => {
    setComposeId(noteId);
    setCommentaryDraft("");
    setPublishError(null);
  };

  const publishVisitorNote = async (noteId: string) => {
    if (publishingId) return;
    setPublishingId(noteId);
    setPublishError(null);
    try {
      const response = await fetch(`/api/field-notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "publish-visitor-note",
          ...(commentaryDraft.trim() ? { commentary: commentaryDraft.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown;
        note?: FieldNote;
        starstreamLogId?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Could not publish to Starstream.",
        );
      }
      if (payload?.note) {
        const publishedNote = payload.note;
        const logId =
          payload.starstreamLogId ??
          publishedNote.starstreamLog?.id ??
          undefined;
        setNotes((current) =>
          current.map((note) =>
            note.id === noteId
              ? {
                  ...note,
                  ...publishedNote,
                  publishedToStarstream: true,
                  starstreamLogType: "visitorNote",
                  starstreamLog: logId
                    ? { id: logId, type: "visitorNote" }
                    : publishedNote.starstreamLog,
                }
              : note,
          ),
        );
      } else {
        await loadNotes();
      }
      setComposeId(null);
      setCommentaryDraft("");
    } catch (publishErr) {
      setPublishError(
        publishErr instanceof Error
          ? publishErr.message
          : "Could not publish to Starstream.",
      );
    } finally {
      setPublishingId(null);
    }
  };

  const toggleNotes = useCallback(() => {
    if (isOpen) {
      closeNotes();
      return;
    }
    openNotes();
  }, [closeNotes, isOpen, openNotes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.key === "Escape" && isOpen) {
        if (typing) {
          // Blur the field first; a second Escape can close the panel.
          if (target instanceof HTMLElement) target.blur();
          event.preventDefault();
          return;
        }
        event.preventDefault();
        closeNotes();
        return;
      }
      if (
        event.key.toLowerCase() !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (typing) return;
      event.preventDefault();
      toggleNotes();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeNotes, isOpen, toggleNotes]);

  return (
    <>
      <div className="pointer-events-auto absolute bottom-16 right-3 z-[120] sm:bottom-[4.5rem] sm:right-4">
        <div className="group relative">
          <button
            type="button"
            aria-label={
              unreadNotes.length
                ? `Open field notes, ${unreadNotes.length} unread`
                : "Open field notes"
            }
            aria-keyshortcuts="N"
            aria-expanded={isOpen}
            onClick={toggleNotes}
            className="relative flex size-10 items-center justify-center rounded-full border border-cyan-100/20 bg-slate-950/90 text-cyan-100 shadow-[0_0_20px_rgba(103,232,249,0.12)] backdrop-blur transition hover:border-cyan-100/50 hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
          >
            <NotebookPen aria-hidden size={16} />
            {unreadNotes.length ? (
              <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border border-slate-950 bg-orange-300 px-1 font-space text-[9px] font-bold text-[#17100a] shadow-[0_0_12px_rgba(253,186,116,0.45)]">
                {unreadNotes.length > 9 ? "9+" : unreadNotes.length}
              </span>
            ) : null}
          </button>
          <span className="pointer-events-none absolute right-0 bottom-[calc(100%+0.45rem)] whitespace-nowrap rounded-md border border-cyan-100/15 bg-slate-950/95 px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-cyan-100/80 opacity-0 shadow-[0_0_20px_rgba(103,232,249,0.12)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            n
          </span>
        </div>
      </div>

      {isOpen ? (
        <aside className="pointer-events-auto absolute top-3 right-3 bottom-3 z-[130] flex w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-cyan-100/15 bg-slate-950/95 text-white shadow-[0_20px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:top-4 sm:right-4 sm:bottom-4">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-4">
            <div>
              <h2 className="font-display text-2xl tracking-[-0.03em]">
                {headerTitle}
              </h2>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Facts your visitors left behind.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close field notes"
              title="Close field notes"
              onClick={closeNotes}
              className="p-1 text-white/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
            >
              <X aria-hidden size={18} />
            </button>
          </header>
          <div className="scrollbar-no-track min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4 pr-3">
            {isLoading ? (
              <p className="py-8 text-center text-xs text-white/45">
                Checking the field log…
              </p>
            ) : error ? (
              <p className="py-8 text-center text-xs leading-5 text-orange-100/75">
                Field notes are temporarily unavailable.
              </p>
            ) : botNotes.length === 0 ? (
              <div className="py-8 text-center">
                <BookOpen className="mx-auto text-cyan-200/45" size={22} />
                <p className="mt-3 text-sm text-white/70">No notes yet.</p>
                <p className="mt-1 text-xs leading-5 text-white/40">
                  Try learning more about one of your visitors.
                </p>
              </div>
            ) : (
              botNotes.map((note) => {
                const sources = noteSources(note.sources);
                const sourcesOpen = openSourcesId === note.id;
                return (
                  <article
                    key={note.id}
                    className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-cyan-50">
                          {note.authorName || "A companion"}
                        </p>
                        <p className="mt-1 font-space text-[9px] uppercase tracking-[0.12em] text-white/30">
                          {note.story?.topic || "Historical voyage"} ·{" "}
                          {formatDate(note.createdAt)}
                        </p>
                      </div>
                      {!seenIds.has(note.id) ? (
                        <span className="font-space text-[9px] uppercase tracking-[0.12em] text-orange-200">
                          New
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-white/65">
                      {noteBody(note.content)}
                    </p>
                    {sources.length ? (
                      <div className="mt-3">
                        <button
                          type="button"
                          aria-expanded={sourcesOpen}
                          aria-controls={`field-note-sources-${note.id}`}
                          onClick={() =>
                            setOpenSourcesId(sourcesOpen ? null : note.id)
                          }
                          className="inline-flex items-center gap-1.5 font-space text-[9px] uppercase tracking-[0.12em] text-cyan-200/70 transition hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                        >
                          {sources.length} source
                          {sources.length === 1 ? "" : "s"}
                          <ChevronDown
                            aria-hidden
                            size={12}
                            className={`transition-transform ${sourcesOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        {sourcesOpen ? (
                          <ul
                            id={`field-note-sources-${note.id}`}
                            className="mt-2 space-y-1.5 border-t border-white/10 pt-2"
                          >
                            {sources.map((url) => (
                              <li key={url}>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group flex items-start gap-2 rounded-md px-1.5 py-1 text-left text-[11px] leading-4 text-cyan-100/70 transition hover:bg-white/[0.04] hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                                >
                                  <ExternalLink
                                    aria-hidden
                                    size={11}
                                    className="mt-0.5 shrink-0 text-cyan-200/45 transition group-hover:text-cyan-100/70"
                                  />
                                  <span className="min-w-0 break-all">
                                    {sourceLabel(url)}
                                  </span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-3 border-t border-white/10 pt-3">
                      {note.publishedToStarstream ? (
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-space text-[9px] uppercase tracking-[0.12em] text-cyan-100/55">
                            Shared to Starstream
                          </p>
                          {note.starstreamLog?.id ? (
                            <a
                              href={`/nexus?section=Starstream&post=${encodeURIComponent(note.starstreamLog.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Open this post in Starstream"
                              title="Open in Starstream"
                              className="grid size-7 shrink-0 place-items-center rounded-md text-cyan-100/55 transition hover:bg-cyan-200/10 hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                            >
                              <Ship aria-hidden size={14} />
                            </a>
                          ) : null}
                        </div>
                      ) : composeId === note.id ? (
                        <div className="space-y-2">
                          <p className="text-sm font-bold leading-5 text-white/80">
                            {VISITOR_NOTE_HEADER}
                          </p>
                          <textarea
                            value={commentaryDraft}
                            onChange={(event) =>
                              setCommentaryDraft(event.target.value)
                            }
                            rows={3}
                            placeholder="Add what you think (optional)"
                            className="w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-cyan-200/40 focus:ring-2 focus:ring-cyan-200/10"
                          />
                          {publishError && composeId === note.id ? (
                            <p className="text-[11px] text-orange-100/75">
                              {publishError}
                            </p>
                          ) : null}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setComposeId(null);
                                setCommentaryDraft("");
                                setPublishError(null);
                              }}
                              disabled={publishingId === note.id}
                              className="min-h-8 rounded-lg px-2.5 text-[11px] text-white/50 transition hover:text-white disabled:opacity-40"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void publishVisitorNote(note.id)}
                              disabled={publishingId === note.id}
                              className="min-h-8 rounded-lg bg-cyan-200 px-2.5 text-[11px] font-semibold text-[#071014] transition hover:bg-cyan-100 disabled:opacity-40"
                            >
                              {publishingId === note.id
                                ? "Sharing…"
                                : "Share to Starstream"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startCompose(note.id)}
                          className="min-h-8 rounded-lg border border-white/12 px-2.5 text-[11px] text-white/60 transition hover:border-cyan-200/30 hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                        >
                          Share to Starstream
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
