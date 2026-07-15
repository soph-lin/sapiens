"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink, Flag, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import SteerShaderBackground from "@/app/components/steer/SteerShaderBackground";

type Run = {
  id: string;
  slug: string | null;
  status: "ongoing" | "fail" | "succeed";
  replayable: boolean;
  missing: string[];
  source: string | null;
  steering: { historicalEvent?: string; synopsisDirection?: string | null } | null;
  storyConfig: { maxTurns?: number; maxCharacters?: number } | null;
  modelConfig: { agents?: Record<string, { model?: string }> } | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  story: { slug: string; topic: string };
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "In progress";
}

export default function VoyagesClient() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; left: number; top: number; above: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/steer/voyages")
      .then(async (response) => {
        const data = await response.json() as { runs?: Run[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load voyages");
        return data;
      })
      .then((data: { runs?: Run[] }) => setRuns(data.runs ?? []))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load voyages"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = runs.filter((run) => {
    const text = `${run.steering?.historicalEvent ?? ""} ${run.steering?.synopsisDirection ?? ""} ${run.story?.topic ?? ""}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02080d] text-white">
      <SteerShaderBackground />
      {tooltip && <div role="tooltip" className="pointer-events-none fixed z-[100] w-64 rounded-lg border border-amber-200/20 bg-[#071219] px-3 py-2 text-left font-mono text-[10px] leading-4 text-amber-100 shadow-xl shadow-black/50" style={{ left: tooltip.left, top: tooltip.top, transform: tooltip.above ? "translateY(-100%) translateY(-8px)" : "translateY(8px)" }}>{tooltip.text}</div>}
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link href="/steer" className="font-mono text-[10px] uppercase tracking-[.35em] text-cyan-200/60">Sapiens / steer</Link>
            <h1 className="mt-3 font-display text-5xl tracking-tight">Previous voyages</h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,.8)]">Replayable agent runs, their steering, outputs, and live progress logs.</p>
          </div>
          <Link href="/steer" className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[.2em] text-cyan-100">New steer</Link>
        </div>

        <section className="rounded-2xl border border-white/10 bg-black/30 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur-md">
          <div className="mb-4 flex flex-wrap gap-3">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by event, direction, or topic…" className="min-w-64 flex-1 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-white/30 focus:border-cyan-200/40" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-white/10 font-mono text-[9px] uppercase tracking-[.2em] text-cyan-200/50"><tr><th className="px-3 py-3">Story</th><th className="px-3 py-3">Run</th><th className="px-3 py-3">Started</th><th className="px-3 py-3">Historical event</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Direction</th><th className="px-3 py-3">Config</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {!loading && filtered.map((run) => <tr key={run.id} className="group text-xs text-white/65 transition hover:bg-cyan-200/[.04]">
                  <td className="px-3 py-4 align-middle">{run.status === "succeed" && run.story ? <Link href={`/sail/${run.story.slug}`} target="_blank" rel="noreferrer" aria-label="Open story" className="inline-flex items-center justify-center text-cyan-200/75 hover:text-cyan-50" title="Open story"><ExternalLink size={14} /></Link> : run.status === "fail" ? <span className="inline-flex text-rose-300" aria-label="Failed run" onMouseEnter={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setTooltip({ text: `This run failed with error: ${run.error || "No error recorded."}`, left: rect.left, top: rect.top, above: rect.top > window.innerHeight / 2 }); }} onMouseLeave={() => setTooltip(null)}><Flag size={14} /></span> : <span className="inline-flex text-amber-200/80" aria-label="Ongoing run" onMouseEnter={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setTooltip({ text: "This run is ongoing.", left: rect.left, top: rect.top, above: rect.top > window.innerHeight / 2 }); }} onMouseLeave={() => setTooltip(null)}><LoaderCircle size={14} className="animate-spin" /></span>}</td>
                  <td className="px-3 py-4">{run.slug ? <Link href={`/steer/voyages/${run.slug}`} aria-label="Open voyage run" className="inline-flex items-center justify-center text-cyan-200/75 hover:text-cyan-50" title="Open voyage run"><ExternalLink size={14} /></Link> : <span className="inline-flex text-amber-200/80" aria-label={`Cannot open this run: missing ${run.missing.join(", ")}.`} onMouseEnter={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setTooltip({ text: `Cannot open this run: missing ${run.missing.join(", ")}.`, left: rect.left, top: rect.top, above: rect.top > window.innerHeight / 2 }); }} onMouseLeave={() => setTooltip(null)}><AlertTriangle size={14} className="shrink-0" /></span>}</td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-[10px] text-white/40">{date(run.startedAt)}</td>
                  <td className="max-w-xs px-3 py-4 font-medium text-white/65">{run.steering?.historicalEvent || run.story?.topic || "Unknown event"}</td>
                  <td className="px-3 py-4">{run.source ? <a href={run.source} target="_blank" rel="noreferrer" className="inline-flex max-w-[190px] items-center gap-1 truncate font-mono text-[10px] text-cyan-200/60 hover:text-cyan-100" title={run.source}>Source <ExternalLink size={12} /></a> : <span className="font-mono text-[10px] uppercase tracking-[.12em] text-white/25">Missing</span>}</td>
                  <td className="max-w-xs px-3 py-4 text-white/45">{run.steering?.synopsisDirection || "—"}</td>
                  <td className="px-3 py-4 font-mono text-[10px] text-white/40">{run.storyConfig?.maxTurns ?? "—"} turns / {run.storyConfig?.maxCharacters ?? "—"} chars</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {!loading && error && <p className="px-3 py-12 text-center text-sm text-amber-200/80">Could not load voyages: {error}</p>}
          {!loading && !error && !filtered.length && <p className="px-3 py-12 text-center text-sm text-white/40">No voyages match this filter.</p>}
          {loading && <p className="px-3 py-12 text-center text-sm text-white/40">Loading voyages…</p>}
          {!loading && <p className="mt-4 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-white/30">Showing {filtered.length} of {runs.length} voyages</p>}
        </section>
      </div>
    </main>
  );
}
