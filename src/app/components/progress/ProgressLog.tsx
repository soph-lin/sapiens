"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PanelRight } from "lucide-react";

/**
 * The progress shape emitted by the agent pipeline. The optional fields keep
 * this component useful for the asset and system entries also shown by /steer.
 */
export type ProgressLogEntry = {
  agent?: string;
  phase?: string;
  message?: string;
  kind?: string;
  type?: string;
  name?: string;
  imageCount?: number;
  assetId?: string;
  imageDataUrls?: readonly string[];
  frames?: readonly ProgressLogFrame[];
  metadata?: unknown;
  details?: Record<string, unknown>;
};

export type ProgressLogFrame = {
  frameKey: string;
  dataUrl: string;
};

export type ProgressLogProps = {
  entries: readonly ProgressLogEntry[];
  label?: string;
  onTerminate?: () => void;
};

function entryLabel(entry: ProgressLogEntry): string {
  if (entry.message?.trim()) return entry.message;
  if (entry.kind === "asset" && entry.name) {
    return `Created ${entry.type ?? "asset"}: ${entry.name}`;
  }
  return "Progress update";
}

const SPRITE_FRAME_ORDER = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;

function frameOrder(frameKey: string): number {
  const normalized = frameKey.toLowerCase().replace(/[^a-z]/g, "");
  const index = SPRITE_FRAME_ORDER.findIndex(
    (direction) => direction.replace(/[^a-z]/g, "") === normalized,
  );
  return index === -1 ? SPRITE_FRAME_ORDER.length : index;
}

function orderedFrames(frames: readonly ProgressLogFrame[]): ProgressLogFrame[] {
  return frames
    .map((frame, index) => ({ frame, index }))
    .sort(
      (left, right) =>
        frameOrder(left.frame.frameKey) - frameOrder(right.frame.frameKey) ||
        left.index - right.index,
    )
    .map(({ frame }) => frame);
}

function SpritePreview({
  frames,
  name,
}: {
  frames: readonly ProgressLogFrame[];
  name: string;
}) {
  const ordered = orderedFrames(frames);
  const [frameIndex, setFrameIndex] = useState(0);
  const frameCount = ordered.length;

  useEffect(() => {
    if (frameCount < 2) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frameCount);
    }, 420);
    return () => window.clearInterval(timer);
  }, [frameCount]);

  const frame = ordered[frameIndex % ordered.length];
  if (!frame) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-cyan-200/20 bg-black/25 p-2">
      <Image
        src={frame.dataUrl}
        alt={`${name} sprite facing ${frame.frameKey}`}
        width={192}
        height={192}
        unoptimized
        className="mx-auto aspect-square w-full max-w-48 object-contain [image-rendering:pixelated]"
      />
      <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-[.14em] text-cyan-200/45">
        {frame.frameKey} · 8-direction rotation
      </p>
    </div>
  );
}

function AssetPreview({ entry }: { entry: ProgressLogEntry }) {
  const frames = entry.frames ?? [];
  if (entry.type === "character_sprite" && frames.length) {
    return <SpritePreview frames={frames} name={entry.name ?? "Character"} />;
  }

  const images = entry.imageDataUrls ?? [];
  if (!images.length) return null;

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {images.map((dataUrl, index) => (
        <Image
          key={`${entry.name ?? "asset"}-${index}`}
          src={dataUrl}
          alt={`${entry.name ?? "Generated asset"} output ${index + 1}`}
          width={128}
          height={128}
          unoptimized
          className="w-full rounded-lg border border-white/10 bg-white/10 object-contain"
        />
      ))}
    </div>
  );
}

/** Remove live image payloads before progress entries are persisted. */
export function progressEntriesForStorage(
  entries: readonly ProgressLogEntry[],
): ProgressLogEntry[] {
  return entries.map((entry) => {
    const storedEntry = { ...entry };
    delete storedEntry.assetId;
    delete storedEntry.imageDataUrls;
    delete storedEntry.frames;
    delete storedEntry.metadata;
    return storedEntry;
  });
}

export default function ProgressLog({
  entries,
  label = "Live progress",
  onTerminate,
}: ProgressLogProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries]);

  return (
    <section
      aria-label={label}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-white/15 bg-slate-950/80 p-5 text-left shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <PanelRight size={16} className="text-cyan-200" />
            <h2 className="font-display text-xl text-white">{label}</h2>
          </div>
          {onTerminate ? (
            <button
              type="button"
              onClick={onTerminate}
              aria-label="Terminate generation"
              title="Terminate generation"
              className="shrink-0 rounded-md border border-rose-200/25 bg-rose-200/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[.12em] text-rose-100/80 transition hover:border-rose-200/50 hover:bg-rose-200/20 hover:text-rose-50"
            >
              Terminate
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs leading-5 text-white/45">
          Short agent and tool updates appear here while the run is active.
        </p>
      </div>
      <div
        ref={listRef}
        className="scrollbar-pill mt-5 min-h-0 flex-1 overflow-y-auto pr-2"
        aria-live="polite"
      >
        {entries.length ? (
          <div className="space-y-2">
            {entries.map((entry, index) => (
              <div
                key={`${entry.agent ?? "event"}-${entry.phase ?? "progress"}-${index}`}
                className="whitespace-pre-wrap rounded-lg border border-white/8 bg-white/[.03] px-3 py-2 text-xs leading-4 text-cyan-50/75"
              >
                <span className="mr-2 font-mono text-[9px] uppercase tracking-[.14em] text-cyan-200/50">
                  {entry.agent ?? "system"}
                </span>
                {entryLabel(entry)}
                {entry.kind === "asset" ? <AssetPreview entry={entry} /> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/40">No progress yet.</p>
        )}
      </div>
    </section>
  );
}
