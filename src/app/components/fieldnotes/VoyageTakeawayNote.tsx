"use client";

import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useUser } from "@/app/components/user/UserProvider";

type VoyageTakeawayNoteProps = {
  storyId: string;
  /** Present for assigned classroom voyages; omit for solo class-share. */
  assignmentId?: string;
  /**
   * When true (assigned default), helper copy says publishing is required for
   * completion. Solo classroom shares pass false — same UI, optional publish.
   */
  required?: boolean;
  /**
   * When false, hide Publish (no classroom to share with). Save still works for
   * the cadet's Discoveries tab.
   */
  canPublish?: boolean;
  /** Called after an existing or newly saved published note is available. */
  onPublished?: () => void;
  /** Nest inside the voyage report card without outer section chrome. */
  embedded?: boolean;
};

type SavedNote = {
  id: string;
  body: string;
  status: "draft" | "published" | "archived";
};

type NotePayload = {
  id: string;
  authorId: string;
  authorType?: string | null;
  status: string;
  content: unknown;
};

function noteBody(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "body" in content) {
    return String((content as { body?: unknown }).body ?? "");
  }
  return "";
}

function parseNote(payload: NotePayload): SavedNote | null {
  if (payload.status !== "draft" && payload.status !== "published") return null;
  return {
    id: payload.id,
    body: noteBody(payload.content),
    status: payload.status,
  };
}

export default function VoyageTakeawayNote({
  storyId,
  assignmentId,
  required = Boolean(assignmentId),
  canPublish = true,
  onPublished,
  embedded = false,
}: VoyageTakeawayNoteProps) {
  const { user } = useUser();
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState<SavedNote | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [lastAction, setLastAction] = useState<"draft" | "published" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== "student") return;

    let cancelled = false;
    const load = async () => {
      setLoadState("loading");
      setError(null);
      try {
        const params = new URLSearchParams({ storyId });
        if (assignmentId) params.set("assignmentId", assignmentId);
        const response = await fetch(`/api/field-notes?${params}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          notes?: NotePayload[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load field notes.");
        }
        const own = (payload.notes ?? []).find(
          (note) =>
            note.authorId === user.id &&
            (note.authorType === "user" || note.authorType == null),
        );
        if (cancelled) return;
        if (own) {
          const parsed = parseNote(own);
          if (parsed) {
            setSaved(parsed);
            setBody(parsed.body);
            setLastAction(parsed.status === "published" ? "published" : "draft");
            if (parsed.status === "published") onPublished?.();
          }
        } else {
          setSaved(null);
          setBody("");
          setLastAction(null);
        }
        setLoadState("ready");
      } catch (loadError) {
        if (cancelled) return;
        setLoadState("error");
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load field notes.",
        );
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, onPublished, storyId, user]);

  if (!user || user.role !== "student") return null;

  const trimmed = body.trim();
  const dirty = trimmed !== (saved?.body.trim() ?? "");
  const isPublished = saved?.status === "published";
  const isDraft = saved?.status === "draft";
  const busy = saveState === "saving";
  const canSave =
    Boolean(trimmed) && !busy && !(isDraft && !dirty);
  const canPublishNow =
    canPublish && Boolean(trimmed) && !busy && !(isPublished && !dirty);

  const saveNote = async (status: "draft" | "published") => {
    if (!trimmed || busy) return;
    if (status === "published" && !canPublish) return;
    if (status === "published" && isPublished && !dirty) return;
    if (status === "draft" && isDraft && !dirty) return;

    setSaveState("saving");
    setError(null);
    try {
      const response = await fetch(
        saved ? `/api/field-notes/${saved.id}` : "/api/field-notes",
        {
          method: saved ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            saved
              ? { body: trimmed, status }
              : {
                  ...(assignmentId ? { assignmentId } : {}),
                  storyId,
                  body: trimmed,
                  status,
                },
          ),
        },
      );
      const payload = (await response.json()) as {
        note?: NotePayload;
        error?: string;
      };
      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "Could not save field note.");
      }
      const parsed = parseNote(payload.note);
      if (!parsed) throw new Error("Could not save field note.");
      setSaved(parsed);
      setBody(parsed.body);
      setLastAction(parsed.status === "published" ? "published" : "draft");
      if (parsed.status === "published") onPublished?.();
      setSaveState("saved");
    } catch (saveError) {
      setSaveState("error");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save field note.",
      );
    }
  };

  const statusHint = (() => {
    if (saveState === "saving") return "Saving…";
    if (saveState === "error") return error ?? "Could not save field note.";
    if (saveState === "saved") {
      if (lastAction === "published") {
        return "Published to the class starstream.";
      }
      return "Saved to your Discoveries. Still private from class.";
    }
    if (isPublished) {
      return dirty
        ? "Unsaved changes. Save keeps it private; Publish updates class."
        : "On the class starstream. Edit anytime, then Save or Publish.";
    }
    if (isDraft) {
      return dirty
        ? "Unsaved changes to your private draft."
        : "Draft in Discoveries — not on the class starstream yet.";
    }
    if (trimmed) {
      return canPublish
        ? "Save for Discoveries, or Publish to share with class."
        : "Save for your Discoveries tab.";
    }
    if (required) {
      return "Publish a note before this assigned voyage can be marked complete.";
    }
    return canPublish
      ? "Optional — Save privately or Publish to class when ready."
      : "Optional — Save privately to your Discoveries.";
  })();

  const fields = (
    <>
      {loadState === "loading" ? (
        <p className="mt-5 text-sm text-[#8e7f6d]">Loading your field note…</p>
      ) : loadState === "error" ? (
        <p className="mt-5 text-sm text-[#8a3b2c]" role="alert">
          {error ?? "Could not load field notes."}
        </p>
      ) : (
        <>
          <label className="sr-only" htmlFor="voyage-takeaway-body">
            Your takeaways from this voyage
          </label>
          <textarea
            id="voyage-takeaway-body"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setSaveState("idle");
            }}
            rows={5}
            placeholder="Share a takeaway, question, or piece of evidence."
            className="mt-5 w-full resize-y rounded-xl border border-[#d9cdbf] bg-white px-4 py-3 text-sm leading-6 text-[#30281f] outline-none placeholder:text-[#a59a8c] transition focus:border-[#b9895c] focus:ring-2 focus:ring-[#d9a85c]/25"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#8e7f6d]" aria-live="polite">
              {statusHint}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void saveNote("draft")}
                disabled={!canSave}
                className="min-h-10 rounded-xl border border-[#d9cdbf] px-3 text-xs text-[#6b5038] transition hover:border-[#b9895c] hover:text-[#30281f] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a85c]/50"
              >
                Save
              </button>
              {canPublish ? (
                <button
                  type="button"
                  onClick={() => void saveNote("published")}
                  disabled={!canPublishNow}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#30281f] px-3 text-xs font-semibold text-[#fffaf2] transition hover:bg-[#4a3c2f] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9a85c]/50"
                >
                  {isPublished && !dirty ? "Published" : "Publish"}
                  {isPublished && !dirty ? null : (
                    <Send size={13} aria-hidden />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <div
        className="mt-8 border-t border-[#d9cdbf]/80 pt-6"
        aria-labelledby="voyage-takeaway-heading"
      >
        <p className="font-space text-[9px] uppercase tracking-[0.22em] text-[#96734d]">
          Your field note
        </p>
        <h3
          id="voyage-takeaway-heading"
          className="mt-2 font-display text-2xl leading-tight"
        >
          Cadet, any takeaways from that voyage?
        </h3>
        <p className="mt-2 max-w-[42ch] text-sm leading-6 text-[#6b5038]/80">
          Save keeps the note in your Discoveries. Publish shares it on the
          class starstream.
        </p>
        {fields}
      </div>
    );
  }

  return (
    <section
      className="mx-auto mb-8 w-full max-w-2xl rounded-2xl border border-[#d9cdbf] bg-[#fffaf2] px-6 py-6 text-[#30281f] shadow-[0_16px_50px_rgba(77,58,37,0.08)] sm:px-8"
      aria-labelledby="voyage-takeaway-heading"
    >
      <p className="font-space text-[9px] uppercase tracking-[0.22em] text-[#96734d]">
        Your field note
      </p>
      <h2
        id="voyage-takeaway-heading"
        className="mt-2 font-display text-3xl leading-tight"
      >
        Cadet, any takeaways from that voyage?
      </h2>
      <p className="mt-3 max-w-[42ch] text-sm leading-6 text-[#6b5038]/80">
        Save keeps the note in your Discoveries. Publish shares it on the class
        starstream. You can edit whenever you return to the end of this voyage.
      </p>
      {fields}
    </section>
  );
}
