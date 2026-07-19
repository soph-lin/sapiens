"use client";

/**
 * This wrapper only adds the D-key toggle and fixed positioning around
 * ProgressLog. Do not add progress UI, entry handling, or other behavior here.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ProgressLog, { type ProgressLogProps } from "./ProgressLog";
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export default function ProgressLogPanel({
  entries,
  label,
  onTerminate,
}: ProgressLogProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isEditableTarget(event.target) ||
        event.key.toLowerCase() !== "d"
      ) {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-y-4 right-4 z-[70] w-[min(28rem,calc(100vw-2rem))]"
      data-map-overlay
    >
      <div className="pointer-events-auto h-full">
        <ProgressLog
          entries={entries}
          label={label}
          onTerminate={onTerminate}
        />
      </div>
    </div>,
    document.body,
  );
}
