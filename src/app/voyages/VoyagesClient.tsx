"use client";

import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  CircleSlash2,
  Eye,
  ExternalLink,
  Flag,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { GradientBackground } from "@/app/components/effects";

type Run = {
  id: string;
  slug: string | null;
  status: "ongoing" | "fail" | "succeed";
  replayable: boolean;
  missing: string[];
  source: string | null;
  steering: string | null;
  topic: string | null;
  storyConfig: { maxTurns?: number; maxCharacters?: number } | null;
  modelConfig: { agents?: Record<string, { model?: string }> } | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  story: { slug: string; topic: string } | null;
  starCharacter: {
    name: string;
    description: string;
    portraitUrl: string | null;
    spriteUrl: string | null;
  } | null;
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "In progress";
}

export default function VoyagesClient() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStar, setSelectedStar] = useState<Run["starCharacter"]>(null);
  const [tooltip, setTooltip] = useState<{
    text: string;
    left: number;
    top: number;
    above: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/voyages")
      .then(async (response) => {
        const data = (await response.json()) as {
          runs?: Run[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error || "Could not load voyages");
        return data;
      })
      .then((data: { runs?: Run[] }) => setRuns(data.runs ?? []))
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load voyages",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = runs.filter((run) => {
    const text =
      `${run.steering ?? ""} ${run.topic ?? ""} ${run.story?.topic ?? ""}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02080d] text-white">
      <GradientBackground />
      {tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[100] w-64 rounded-lg border border-amber-200/20 bg-[#071219] px-3 py-2 text-left font-mono text-[10px] leading-4 text-amber-100 shadow-xl shadow-black/50"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            transform: tooltip.above
              ? "translateY(-100%) translateY(-8px)"
              : "translateY(8px)",
          }}
        >
          {tooltip.text}
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link
              href="/steer"
              className="font-mono text-[10px] uppercase tracking-[.35em] text-cyan-200/60"
            >
              Sapiens / steer
            </Link>
            <h1 className="mt-3 font-display text-5xl tracking-tight">
              Previous voyages
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,.8)]">
              Replayable agent runs, their steering requests, outputs, and live
              progress logs.
            </p>
          </div>
          <Link
            href="/steer"
            className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[.2em] text-cyan-100"
          >
            New steer
          </Link>
        </div>

        <section className="rounded-2xl border border-white/10 bg-black/30 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur-md">
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by steering or topic…"
              className="min-w-64 flex-1 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="border-b border-white/10 font-mono text-[9px] uppercase tracking-[.2em] text-cyan-200/50">
                <tr>
                  <th className="px-3 py-3">Story</th>
                  <th className="px-3 py-3">Run</th>
                  <th className="px-3 py-3">Star</th>
                  <th className="px-3 py-3">Started</th>
                  <th className="px-3 py-3">Steering</th>
                  <th className="px-3 py-3">Topic</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Config</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {!loading &&
                  filtered.map((run) => (
                    <tr
                      key={run.id}
                      className="group text-xs text-white/65 transition hover:bg-cyan-200/[.04]"
                    >
                      <td className="px-3 py-4 align-middle">
                        {run.status === "succeed" && run.story ? (
                          <Link
                            href={`/sail/${run.story.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open story"
                            className="inline-flex items-center justify-center text-cyan-200/75 hover:text-cyan-50"
                            title="Open story"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        ) : run.status === "fail" ? (
                          <span
                            className="inline-flex text-rose-300"
                            aria-label="Failed run"
                            onMouseEnter={(event) => {
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              setTooltip({
                                text: `This run failed with error: ${run.error || "No error recorded."}`,
                                left: rect.left,
                                top: rect.top,
                                above: rect.top > window.innerHeight / 2,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            <Flag size={14} />
                          </span>
                        ) : (
                          <span
                            className="inline-flex text-amber-200/80"
                            aria-label="Ongoing run"
                            onMouseEnter={(event) => {
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              setTooltip({
                                text: "This run is ongoing.",
                                left: rect.left,
                                top: rect.top,
                                above: rect.top > window.innerHeight / 2,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            <LoaderCircle size={14} className="animate-spin" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        {run.slug ? (
                          <Link
                            href={`/steer/${run.slug}`}
                            aria-label="Open voyage run"
                            className="inline-flex items-center justify-center text-cyan-200/75 hover:text-cyan-50"
                            title="Open voyage run"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        ) : (
                          <span
                            className="inline-flex text-amber-200/80"
                            aria-label={`Cannot open this run: missing ${run.missing.join(", ")}.`}
                            onMouseEnter={(event) => {
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              setTooltip({
                                text: `Cannot open this run: missing ${run.missing.join(", ")}.`,
                                left: rect.left,
                                top: rect.top,
                                above: rect.top > window.innerHeight / 2,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            <AlertTriangle size={14} className="shrink-0" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        {run.starCharacter ? (
                          <button
                            type="button"
                            aria-label={`View star character ${run.starCharacter.name}`}
                            title={`View star character ${run.starCharacter.name}`}
                            className="inline-flex items-center justify-center text-cyan-200/75 hover:text-cyan-50"
                            onClick={() => setSelectedStar(run.starCharacter)}
                          >
                            <Eye size={14} />
                          </button>
                        ) : (
                          <span
                            className="inline-flex text-white/20"
                            aria-label="No star character associated with this story"
                            title="No star character associated with this story"
                          >
                            <CircleSlash2 size={14} />
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 font-mono text-[10px] text-white/40">
                        {date(run.startedAt)}
                      </td>
                      <td className="max-w-xs px-3 py-4 font-medium text-white/65">
                        {run.steering || "—"}
                      </td>
                      <td className="max-w-xs px-3 py-4 font-medium text-white/65">
                        {run.topic || run.story?.topic || "Unknown topic"}
                      </td>
                      <td className="px-3 py-4">
                        {run.source ? (
                          <a
                            href={run.source}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[190px] items-center gap-1 truncate font-mono text-[10px] text-cyan-200/60 hover:text-cyan-100"
                            title={run.source}
                          >
                            Source <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="font-mono text-[10px] uppercase tracking-[.12em] text-white/25">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-4 font-mono text-[10px] text-white/40">
                        {run.storyConfig?.maxTurns ?? "—"} turns /{" "}
                        {run.storyConfig?.maxCharacters ?? "—"} chars
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!loading && error && (
            <p className="px-3 py-12 text-center text-sm text-amber-200/80">
              Could not load voyages: {error}
            </p>
          )}
          {!loading && !error && !filtered.length && (
            <p className="px-3 py-12 text-center text-sm text-white/40">
              No voyages match this filter.
            </p>
          )}
          {loading && (
            <p className="px-3 py-12 text-center text-sm text-white/40">
              Loading voyages…
            </p>
          )}
          {!loading && (
            <p className="mt-4 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-white/30">
              Showing {filtered.length} of {runs.length} voyages
            </p>
          )}
        </section>
        {selectedStar && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-10 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedStar(null);
            }}
          >
            <section
              aria-label={`Star character ${selectedStar.name}`}
              aria-modal="true"
              className="relative max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-cyan-200/20 bg-[#071219] p-6 shadow-2xl shadow-black/60"
              role="dialog"
            >
              <button
                type="button"
                aria-label="Close star character"
                title="Close"
                className="absolute right-4 top-4 rounded-full p-2 text-white/45 hover:bg-white/10 hover:text-white"
                onClick={() => setSelectedStar(null)}
              >
                <X size={16} />
              </button>
              <p className="font-mono text-[10px] uppercase tracking-[.25em] text-cyan-200/55">
                Star character
              </p>
              <h2 className="mt-2 pr-10 font-display text-3xl text-white">
                {selectedStar.name}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/65">
                {selectedStar.description}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {selectedStar.portraitUrl && (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <p className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-white/35">
                      Character
                    </p>
                    <Image
                      src={selectedStar.portraitUrl}
                      alt={selectedStar.name}
                      width={256}
                      height={256}
                      unoptimized
                      className="mx-auto aspect-square w-full rounded-lg object-contain [image-rendering:pixelated]"
                    />
                  </div>
                )}
                <div className="rounded-xl border border-cyan-200/15 bg-cyan-100/[.04] p-3">
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[.18em] text-cyan-200/55">
                    Top-down sprite
                  </p>
                  {selectedStar.spriteUrl ? (
                    <Image
                      src={selectedStar.spriteUrl}
                      alt={`${selectedStar.name} top-down sprite`}
                      width={256}
                      height={256}
                      unoptimized
                      className="mx-auto aspect-square w-full rounded-lg object-contain [image-rendering:pixelated]"
                    />
                  ) : (
                    <p className="flex min-h-32 items-center justify-center text-center text-xs text-white/35">
                      No sprite associated.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
