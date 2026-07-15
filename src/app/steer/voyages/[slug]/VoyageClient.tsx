"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SteerShaderBackground from "@/app/components/steer/SteerShaderBackground";

type Run = Record<string, unknown> & { slug: string; status: "ongoing" | "fail" | "succeed"; error: string | null; steering: { historicalEvent?: string; synopsisDirection?: string | null } | null; progress: unknown[]; story: { slug: string; topic: string } | null };

function pretty(value: unknown) { return value === null || value === undefined ? "Not saved for this run." : JSON.stringify(value, null, 2); }

export default function VoyageClient({ slug }: { slug: string }) {
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => { fetch(`/api/steer/voyages/${slug}`).then((response) => response.ok ? response.json() : null).then((data: { run?: Run } | null) => setRun(data?.run ?? null)); }, [slug]);
  if (!run) return <main className="min-h-screen bg-[#02080d] p-10 text-white/50">Loading voyage…</main>;
  const outputs = ["researcherOutput", "directorOutput", "writerOutput", "artistOutput"];
  return <main className="relative min-h-screen overflow-hidden bg-[#02080d] text-white"><SteerShaderBackground /><div className="relative z-10 mx-auto max-w-7xl px-6 py-10 lg:px-10"><Link href="/steer/voyages" className="font-mono text-[10px] uppercase tracking-[.35em] text-cyan-200/60">Sapiens / voyages</Link><h1 className="mt-3 font-display text-4xl">{run.steering?.historicalEvent || run.story?.topic || "Unfinalized voyage"}</h1><p className="mt-2 text-sm text-white/45">{run.steering?.synopsisDirection || "No additional direction"}</p>{run.error && <p className="mt-4 rounded-xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 font-mono text-xs text-rose-100">Run failed: {run.error}</p>}<div className="mt-8 grid gap-5 lg:grid-cols-2">{outputs.map((key) => <section key={key} className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-md"><h2 className="font-mono text-[10px] uppercase tracking-[.25em] text-cyan-200/60">{key.replace("Output", "")}</h2><pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/65">{pretty(run[key])}</pre></section>)}<section className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-md lg:col-span-2"><h2 className="font-mono text-[10px] uppercase tracking-[.25em] text-cyan-200/60">Progress log</h2><pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/55">{pretty(run.progress)}</pre></section></div></div></main>;
}
