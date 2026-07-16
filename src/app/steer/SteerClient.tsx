"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  Info,
  LoaderCircle,
  PanelRight,
  Play,
  Ship,
  Square,
} from "lucide-react";
import SteerShaderBackground from "@/app/components/steer/SteerShaderBackground";
import { DEFAULT_STORY_LIMITS, ORCHESTRATOR_CONFIG } from "@/lib/orchestrator/config";

type AgentName = "researcher" | "director" | "writer" | "artist";
type ArtistType = "character" | "character_sprite" | "collectible";
type DirectorLimits = {
  maxTurns: number;
  maxCharacters: number;
  maxTries: number;
  maxOutputTokens: number;
};

type GeneratedImage = {
  type: ArtistType;
  name: string;
  url: string;
  frameKey?: string;
  assetId?: string;
  metadata?: unknown;
};

type RunAsset = GeneratedImage;
type RunResult = { output: string; assets: RunAsset[]; usage?: unknown };

const RUN_STOPPED_MESSAGE = "Run stopped by user";
const HISTORICAL_EVENT_STORAGE_KEY = "sapiens:steer:historical-event";
const SYNOPSIS_STORAGE_KEY = "sapiens:steer:synopsis-direction";

type PanelState = {
  input: string;
  output: string;
  tokens: number | null;
  error: string;
  running: boolean;
};

type StoredRun = {
  slug: string;
  status: "ongoing" | "fail" | "succeed";
  steering: { historicalEvent?: string; synopsisDirection?: string | null } | null;
  storyConfig: Partial<DirectorLimits> | null;
  progress: unknown;
  usage: unknown;
  error: string | null;
  researcherOutput: unknown;
  directorOutput: unknown;
  writerOutput: unknown;
  artistOutput: unknown;
};

const emptyPanel = (): PanelState => ({ input: "", output: "", tokens: null, error: "", running: false });

function pretty(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "";
}

function parseStoredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function AnimatedSpritePreview({ frames, name }: { frames: GeneratedImage[]; name: string }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (frames.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, 420);
    return () => window.clearInterval(timer);
  }, [frames.length]);

  const frame = frames[frameIndex % frames.length];
  if (!frame) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-cyan-200/20 bg-black/25 p-2">
      <Image src={frame.url} alt={`${name} animated sprite`} width={192} height={192} unoptimized className="mx-auto aspect-square w-full object-contain [image-rendering:pixelated]" />
      <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-[.14em] text-cyan-200/45">South / rotating directions</p>
    </div>
  );
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.slice(7) ?? "message";
  const dataText = lines
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");
  if (!dataText) return null;
  return { event, data: JSON.parse(dataText) as unknown };
}

function TextArea({ value, onChange, placeholder, readOnly = false }: { value: string; onChange: (value: string) => void; placeholder: string; readOnly?: boolean }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className="min-h-32 w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white outline-none ring-emerald-300/40 placeholder:text-white/30 focus:ring-2"
    />
  );
}

export default function SteerClient({ runSlug }: { runSlug?: string }) {
  const viewingRun = Boolean(runSlug);
  const [panels, setPanels] = useState<Record<AgentName, PanelState>>({
    researcher: emptyPanel(),
    director: emptyPanel(),
    writer: emptyPanel(),
    artist: emptyPanel(),
  });
  const [runAllHistoricalEvent, setRunAllHistoricalEvent] = useState("");
  const [runAllSynopsis, setRunAllSynopsis] = useState("");
  const [directorLimits, setDirectorLimits] = useState<DirectorLimits>({
    ...DEFAULT_STORY_LIMITS,
    maxTries: ORCHESTRATOR_CONFIG.maxTries,
    maxOutputTokens: ORCHESTRATOR_CONFIG.maxOutputTokens,
  });
  const [debug, setDebug] = useState<unknown[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [debugOpen, setDebugOpen] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [runAllRunning, setRunAllRunning] = useState(false);
  const [cachedInputsLoaded, setCachedInputsLoaded] = useState(() => viewingRun);
  const [storedRun, setStoredRun] = useState<StoredRun | null>(null);
  const [storedRunError, setStoredRunError] = useState<string | null>(null);
  const runAllAbortController = useRef<AbortController | null>(null);
  const storedRunLoading = viewingRun && !storedRun && !storedRunError;

  useEffect(() => {
    if (runSlug) return undefined;
    const timer = window.setTimeout(() => {
      try {
        // Hydrate the client-only fields from browser storage after the server render.
        setRunAllHistoricalEvent(localStorage.getItem(HISTORICAL_EVENT_STORAGE_KEY) ?? "");
        setRunAllSynopsis(localStorage.getItem(SYNOPSIS_STORAGE_KEY) ?? "");
      } catch {
        // Ignore storage failures such as private-browsing restrictions.
      } finally {
        setCachedInputsLoaded(true);
      }
    });
    return () => window.clearTimeout(timer);
  }, [runSlug]);

  useEffect(() => {
    if (!cachedInputsLoaded || viewingRun) return;
    try {
      localStorage.setItem(HISTORICAL_EVENT_STORAGE_KEY, runAllHistoricalEvent);
      localStorage.setItem(SYNOPSIS_STORAGE_KEY, runAllSynopsis);
    } catch {
      // Ignore storage failures such as private-browsing quota restrictions.
    }
  }, [cachedInputsLoaded, runAllHistoricalEvent, runAllSynopsis, viewingRun]);

  useEffect(() => {
    if (!runSlug) return;
    let active = true;
    fetch(`/api/steer/voyages/${encodeURIComponent(runSlug)}`)
      .then(async (response) => {
        const data = await response.json() as { run?: StoredRun; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load run");
        if (!data.run) throw new Error("Run was not found");
        return data.run;
      })
      .then((run) => {
        if (!active) return;
        setStoredRun(run);
        const researcherOutput = pretty(run.researcherOutput);
        const directorOutput = pretty(run.directorOutput);
        const writerOutput = pretty(run.writerOutput);
        const artistOutput = pretty(run.artistOutput);
        const parsedWriterOutput = parseStoredValue(run.writerOutput);
        const writerAssets = parsedWriterOutput && typeof parsedWriterOutput === "object" && !Array.isArray(parsedWriterOutput)
          ? (parsedWriterOutput as Record<string, unknown>).need_assets
          : undefined;
        const progress = Array.isArray(run.progress) ? run.progress : [];
        setRunAllHistoricalEvent(run.steering?.historicalEvent ?? "");
        setRunAllSynopsis(run.steering?.synopsisDirection ?? "");
        setDirectorLimits((current) => ({
          ...current,
          ...(run.storyConfig ?? {}),
        }));
        setPanels({
          researcher: { ...emptyPanel(), input: run.steering?.historicalEvent ?? "", output: researcherOutput },
          director: { ...emptyPanel(), input: researcherOutput, output: directorOutput },
          writer: { ...emptyPanel(), input: directorOutput, output: writerOutput },
          artist: { ...emptyPanel(), input: pretty(writerAssets ?? parsedWriterOutput), output: artistOutput },
        });
        setDebug(progress);
        if (run.error) {
          setDebug((current) => [...current, { agent: "system", phase: "error", message: run.error }]);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStoredRunError(error instanceof Error ? error.message : "Could not load run");
      });
    return () => {
      active = false;
    };
  }, [runSlug]);

  const update = (agent: AgentName, patch: Partial<PanelState>) =>
    setPanels((current) => ({ ...current, [agent]: { ...current[agent], ...patch } }));

  async function run(
    agent: AgentName,
    inputOverride?: string,
    progressLog?: unknown[],
    directorSteeringOverride?: string,
    signal?: AbortSignal,
  ): Promise<RunResult | null> {
    const panel = panels[agent];
    const input = inputOverride ?? panel.input;
    if (agent === "artist") setImages([]);
    update(agent, { running: true, error: "" });
    try {
      if (signal?.aborted) throw new Error(RUN_STOPPED_MESSAGE);
      const response = await fetch("/api/steer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          agent,
          input,
          limits: directorLimits,
          synopsis: agent === "director" ? directorSteeringOverride : undefined,
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "Agent failed");
      }
      if (!response.body) throw new Error("Agent stream was unavailable");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let output: string | null = null;
      let resultUsage: unknown;
      const runAssets: RunAsset[] = [];
      const process = (chunk: string) => {
        buffer += chunk;
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const parsed = parseSseBlock(block.trim());
          if (!parsed) continue;
          if (parsed.event === "progress") {
            progressLog?.push(parsed.data);
            setDebug((current) => [...current, parsed.data].slice(-100));
          } else if (parsed.event === "asset") {
            const asset = parsed.data as {
              type: ArtistType;
              name: string;
              assetId?: string;
              imageDataUrls?: string[];
              frames?: Array<{ frameKey: string; dataUrl: string }>;
              metadata?: unknown;
            };
            const generated = asset.frames?.length
              ? asset.frames.map(({ frameKey, dataUrl }) => ({
                  type: asset.type,
                  name: asset.name,
                  frameKey,
                  url: dataUrl,
                  assetId: asset.assetId,
                  metadata: asset.metadata,
                }))
              : (asset.imageDataUrls ?? []).map((url) => ({
                  type: asset.type,
                  name: asset.name,
                  url,
                  assetId: asset.assetId,
                  metadata: asset.metadata,
                }));
            runAssets.push(...generated);
            setImages((current) => [...current, ...generated]);
            const assetEvent = { kind: "asset", type: asset.type, name: asset.name, imageCount: generated.length, metadata: asset.metadata };
            progressLog?.push(assetEvent);
            setDebug((current) => [...current, assetEvent].slice(-100));
          } else if (parsed.event === "result") {
            const result = parsed.data as {
              output: unknown;
              imageDataUrls?: string[];
              usage?: { total?: { totalTokens?: number } };
            };
            output = pretty(result.output);
            resultUsage = result.usage;
            update(agent, {
              output,
              tokens: result.usage?.total?.totalTokens ?? null,
              running: false,
            });
            if (agent === "researcher") update("director", { input: output });
            if (agent === "director") {
              update("writer", { input: output });
            }
          } else if (parsed.event === "error") {
            const error = parsed.data as { message?: string };
            throw new Error(error.message || "Agent failed");
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        process(decoder.decode(value, { stream: true }));
      }
      process(decoder.decode());
      if (buffer.trim()) process("\n\n");
      if (!output) throw new Error(`${agent} completed without a result`);
      return output ? { output, assets: runAssets, usage: resultUsage } : null;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        update(agent, { running: false });
        throw new Error(RUN_STOPPED_MESSAGE);
      }
      const message = error instanceof Error ? error.message : "Agent failed";
      const errorEvent = { agent, phase: "error", message };
      progressLog?.push(errorEvent);
      setDebug((current) => [...current, errorEvent].slice(-100));
      update(agent, { running: false, error: message });
      return null;
    }
  }

  async function runAll() {
    if (viewingRun) return;
    const researcherInput = runAllHistoricalEvent.trim();
    if (!researcherInput) {
      toast.error("Error: enter a historical event in Run all inputs!");
      return;
    }

    setRunAllRunning(true);
    const abortController = new AbortController();
    runAllAbortController.current = abortController;
    setImages([]);
    setDebug([]);
    const runProgress: unknown[] = [];
    let runSlug: string | null = null;
    const steering = {
      historicalEvent: researcherInput,
      synopsisDirection: runAllSynopsis.trim() || null,
    };
    const persistRun = async (outputs: Record<string, unknown> = {}, error?: string) => {
      if (!runSlug) return;
      await fetch("/api/steer/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: runSlug, progress: runProgress, outputs, error: error ?? null }),
      });
    };
    try {
      const runResponse = await fetch("/api/steer/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steering, storyConfig: directorLimits }),
      });
      if (runResponse.ok) {
        const run = await runResponse.json() as { slug?: string };
        runSlug = run.slug ?? null;
      }
      if (abortController.signal.aborted) {
        await persistRun({}, RUN_STOPPED_MESSAGE);
        return;
      }
      update("researcher", { input: researcherInput });
      const researcherResult = await run(
        "researcher",
        researcherInput,
        runProgress,
        undefined,
        abortController.signal,
      );
      if (!researcherResult) {
        await persistRun({}, "Researcher failed");
        return;
      }
      const researcherOutput = JSON.parse(researcherResult.output);
      await persistRun({ researcher: researcherOutput });

      const directorResult = await run(
        "director",
        researcherResult.output,
        runProgress,
        runAllSynopsis.trim() || undefined,
        abortController.signal,
      );
      if (!directorResult) {
        await persistRun({ researcher: researcherOutput }, "Director failed");
        return;
      }
      const directorOutput = JSON.parse(directorResult.output);
      await persistRun({ researcher: researcherOutput, director: directorOutput });

      const writerResult = await run(
        "writer",
        directorResult.output,
        runProgress,
        undefined,
        abortController.signal,
      );
      if (!writerResult) {
        await persistRun({ researcher: researcherOutput, director: directorOutput }, "Writer failed");
        toast.error("Run all stopped: writer failed. Check the panel error.");
        return;
      }
      const writerOutput = JSON.parse(writerResult.output);

      const writerPayload = JSON.parse(writerResult.output) as {
        need_assets?: {
          characters?: Array<{ name: string; desc: string }>;
          starCharacter?: { name: string; desc: string } | null;
        };
      };
      if (!writerPayload.need_assets) {
        await persistRun({ researcher: researcherOutput, director: directorOutput, writer: writerOutput }, "Writer did not return need_assets");
        toast.error("Run all stopped: writer did not return need_assets.");
        return;
      }
      const filteredDirector = {
        ...directorOutput,
        characters: writerPayload.need_assets.characters ?? [],
        starCharacter: writerPayload.need_assets.starCharacter ?? null,
      };
      const artistResult = await run(
        "artist",
        JSON.stringify(writerPayload.need_assets),
        runProgress,
        undefined,
        abortController.signal,
      );
      if (!artistResult) {
        await persistRun({ researcher: researcherOutput, director: directorOutput, writer: writerOutput }, "Artist failed");
        toast.error("Run all stopped: artist failed. Check the panel error.");
        return;
      }
      const artistOutput = JSON.parse(artistResult.output);
      await persistRun({ researcher: researcherOutput, director: directorOutput, writer: writerOutput, artist: artistOutput });

      setDebug((current) => [...current, { agent: "system", phase: "save", message: "Saving story to the database…" }].slice(-100));
      const director = filteredDirector as {
        characters: Array<{ name: string; desc: string }>;
        starCharacter: { name: string; desc: string } | null;
        collectible: { name: string; desc: string };
      };
      const assets = artistResult.assets.filter((asset, index, all) =>
        all.findIndex((candidate) => candidate.type === asset.type && candidate.name === asset.name) === index,
      );
      const saveProgress = [
        ...runProgress,
        { agent: "system", phase: "save", message: "Saving story to the database…" },
      ];
      const writerStory = JSON.parse(writerResult.output) as { dialogue?: unknown };
      const storyJson = writerStory.dialogue ?? writerStory;
      const usage = {
        researcher: researcherResult.usage,
        director: directorResult.usage,
        writer: writerResult.usage,
        artist: artistResult.usage,
      };
      const response = await fetch("/api/stories/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyJson,
          synopsis: directorOutput.synopsis,
          runSlug,
          steering,
          storyConfig: directorLimits,
          outputs: {
            researcher: researcherOutput,
            director: directorOutput,
            writer: writerOutput,
            artist: artistOutput,
          },
          // Finalize derives these fields from the agent snapshots so UI steering
          // cannot overwrite the historical topic or Director synopsis.
          director,
          assets: assets.map((asset) => ({ type: asset.type, name: asset.name, frameKey: asset.frameKey, dataUrl: asset.url, assetId: asset.assetId, metadata: asset.metadata })),
          progress: saveProgress,
          usage,
        }),
      });
      const result = (await response.json()) as { error?: string; slug?: string; genRunSlug?: string; savedEvent?: unknown };
      if (!response.ok) throw new Error(result.error || "Could not save story");
      if (!result.slug) throw new Error("Story saved without a slug");
      const openingEvent = {
        agent: "system",
        phase: "save",
        message: "Saved story to database! Opening story…",
      };
      setDebug((current) => [...current, openingEvent].slice(-100));
      const storyUrl = `/sail/${result.slug}`;
      const storyWindow = window.open(storyUrl, "_blank");
      if (!storyWindow) {
        toast.error("New tab blocked! Allow pop-ups for this site in your browser settings, then try again.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Run failed";
      await persistRun({}, message);
      const statusMessage = message === RUN_STOPPED_MESSAGE ? "Run stopped. Progress saved." : message;
      setDebug((current) => [...current, { agent: "system", phase: "save", message: statusMessage }].slice(-100));
      if (message === RUN_STOPPED_MESSAGE) toast.success(statusMessage);
      else toast.error(message);
    } finally {
      if (runAllAbortController.current === abortController) {
        runAllAbortController.current = null;
      }
      setRunAllRunning(false);
    }
  }

  function stopRunAll() {
    if (!runAllAbortController.current) return;
    setDebug((current) => [
      ...current,
      { agent: "system", phase: "stop", message: "Stopping run and saving progress…" },
    ].slice(-100));
    runAllAbortController.current.abort();
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(null), 1400);
  }

  const panel = (agent: AgentName, title: string, label: string, placeholder: string) => (
    <section className="rounded-xl border border-white/15 bg-slate-950/35 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.25em] text-cyan-200/80">{agent}</p>
          <h2 className="mt-1 font-display text-xl text-white">{title}</h2>
        </div>
        <button onClick={() => run(agent)} disabled={viewingRun || runAllRunning || panels[agent].running} className="inline-flex items-center gap-2 rounded-lg border border-cyan-100/20 bg-cyan-100/10 px-3 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-100/20 disabled:cursor-wait disabled:grayscale disabled:opacity-30">
          {panels[agent].running ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
          {panels[agent].running ? "Running" : "Run"}
        </button>
      </div>
      <label className="mb-2 block font-mono text-[11px] uppercase tracking-[.12em] text-white/55">{label} <span className="normal-case tracking-normal text-white/30">(editable override)</span></label>
      <TextArea value={panels[agent].input} onChange={(value) => update(agent, { input: value })} placeholder={placeholder} readOnly={viewingRun} />
      {panels[agent].error && <p className="mt-2 whitespace-pre-wrap text-xs text-red-300">{panels[agent].error}</p>}
      {panels[agent].output && (
        <div className="mt-3">
          <div className="mb-2 flex justify-between text-xs text-white/60"><span>Output{panels[agent].tokens !== null ? ` (${panels[agent].tokens.toLocaleString()} tokens used)` : ""}</span><button onClick={() => copy(panels[agent].output)} className="inline-flex items-center gap-1 text-cyan-200 transition hover:text-white">{copied === panels[agent].output ? <Check size={13} /> : <Clipboard size={13} />} {copied === panels[agent].output ? "Copied" : "Copy"}</button></div>
          <pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/35 p-3 text-xs leading-5 text-white/80">{panels[agent].output}</pre>
        </div>
      )}
      {agent === "artist" && images.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-3 text-xs text-white/55">Generated image gallery</p>
          <div className="grid grid-cols-2 gap-3">
            {images.map((image, index) => (
              <div key={`${image.name}-${image.url.slice(0, 16)}-${index}`} className="space-y-2">
                <Image src={image.url} alt={image.name} width={128} height={128} unoptimized className="w-full rounded-lg border border-white/10 bg-white/10" />
                <div className="text-[10px] leading-4 text-cyan-100/70"><span className="mr-1 font-mono uppercase tracking-[.12em] text-cyan-200/45">{image.type}</span>{image.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );

  return (
    <main className="relative h-dvh overflow-hidden bg-[#06111f] font-space text-white">
      <Toaster position="top-right" />
      <SteerShaderBackground />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,71,86,.18),transparent_45%),linear-gradient(180deg,rgba(2,12,27,.22),rgba(2,8,18,.76))]" />
      <div className="relative z-10 flex h-full min-h-0 flex-col px-5 py-6 md:px-8 lg:px-10">
        <header className="mx-auto mb-6 flex w-full max-w-[1700px] shrink-0 items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.35em] text-cyan-200/80">Sapiens / steer</p>
            <h1 className="mt-2 font-display text-4xl tracking-tight text-white md:text-5xl">Agent test console</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">Run one stage at a time. Outputs automatically feed the next stage, but every input remains editable.</p>
          </div>
            <Link href="/steer/voyages" aria-label="Open previous voyages" title="Previous voyages" className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[.2em] text-cyan-100 transition hover:bg-cyan-200/20"><Ship size={15} /> <span className="hidden sm:inline">Previous voyages</span></Link>
          </header>
        {storedRunLoading && <p className="mx-auto mb-4 w-full max-w-[1700px] rounded-xl border border-cyan-200/15 bg-cyan-100/[.04] px-4 py-3 text-sm text-cyan-100/70">Loading saved run…</p>}
        {storedRunError && <p className="mx-auto mb-4 w-full max-w-[1700px] rounded-xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 font-mono text-xs text-rose-100">Could not load run: {storedRunError}</p>}
        <div className={`mx-auto grid min-h-0 w-full max-w-[1700px] flex-1 gap-5 ${debugOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(420px,42vw)]" : "grid-cols-1"}`}>
          <div className="scrollbar-pill min-h-0 space-y-4 overflow-y-auto pr-1">
            <section className="rounded-xl border border-white/15 bg-slate-950/35 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-md">
              <div className="mb-4">
                <p className="font-mono text-[10px] uppercase tracking-[.25em] text-cyan-200/80">Run all inputs</p>
                <h2 className="mt-1 font-display text-xl text-white">Shape the story</h2>
              </div>
              <div className="space-y-3">
                <label className="block font-mono text-[10px] uppercase tracking-[.12em] text-white/50">Historical event</label>
                <TextArea value={runAllHistoricalEvent} onChange={setRunAllHistoricalEvent} placeholder="American Civil War" readOnly={viewingRun} />
                <label className="block font-mono text-[10px] uppercase tracking-[.12em] text-white/50">Synopsis direction <span className="normal-case tracking-normal text-white/30">(optional)</span></label>
                <TextArea value={runAllSynopsis} onChange={setRunAllSynopsis} placeholder="A reflective journal that connects military strategy to emancipation and Reconstruction." readOnly={viewingRun} />
              </div>
            </section>
            {runAllRunning ? (
              <button onClick={stopRunAll} disabled={viewingRun} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200/30 bg-red-200/15 px-4 py-3 text-sm font-semibold text-red-50 transition hover:bg-red-200/25">
                <Square size={14} fill="currentColor" />
                Stop run
              </button>
            ) : (
              <button onClick={runAll} disabled={viewingRun} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-100/25 bg-cyan-100/15 px-4 py-3 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-100/25 disabled:cursor-not-allowed disabled:opacity-30">
                <Play size={14} fill="currentColor" />
                Run all
              </button>
            )}
            <section className="rounded-xl border border-white/15 bg-slate-950/35 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-md">
              <div className="mb-4">
                <p className="font-mono text-[10px] uppercase tracking-[.25em] text-cyan-200/80">Configuration</p>
                <h2 className="mt-1 font-display text-xl text-white">Settings</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="font-mono text-[10px] uppercase tracking-[.12em] text-white/50">Max turns<input type="number" min={1} max={100} value={directorLimits.maxTurns} readOnly={viewingRun} onChange={(event) => setDirectorLimits((current) => ({ ...current, maxTurns: Number(event.target.value) }))} className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-xs normal-case tracking-normal text-white outline-none focus:border-cyan-200/50" /></label>
                <label className="font-mono text-[10px] uppercase tracking-[.12em] text-white/50">Max characters<input type="number" min={1} max={100} value={directorLimits.maxCharacters} readOnly={viewingRun} onChange={(event) => setDirectorLimits((current) => ({ ...current, maxCharacters: Number(event.target.value) }))} className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-xs normal-case tracking-normal text-white outline-none focus:border-cyan-200/50" /></label>
                <label className="font-mono text-[10px] uppercase tracking-[.12em] text-white/50">Max tries<input type="number" min={1} max={10} value={directorLimits.maxTries} readOnly={viewingRun} onChange={(event) => setDirectorLimits((current) => ({ ...current, maxTries: Number(event.target.value) }))} className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-xs normal-case tracking-normal text-white outline-none focus:border-cyan-200/50" /></label>
                <label className="font-mono text-[10px] uppercase tracking-[.12em] text-white/50"><span className="inline-flex items-center gap-1">Max output tokens<span title="Only applies to Claude. The OpenAI client does not send a max output token limit." aria-label="Claude only"><Info size={12} className="text-cyan-200/65" /></span></span><input type="number" min={1} max={128000} value={directorLimits.maxOutputTokens} readOnly={viewingRun} onChange={(event) => setDirectorLimits((current) => ({ ...current, maxOutputTokens: Number(event.target.value) }))} className="mt-2 w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-xs normal-case tracking-normal text-white outline-none focus:border-cyan-200/50" /></label>
              </div>
            </section>
            {panel("researcher", "Research facts", "Historical event", "American Civil War")}
            {panel("director", "Plan the adventure", "Researcher JSON", '{"topic": "...", "articleUrl": "https://en.wikipedia.org/wiki/..."}')}
            {panel("writer", "Write dialogue", "Director JSON", '{"synopsis": {}, "characters": [], "endings": [], "collectible": {}, "scenes": []}')}
            {panel("artist", "Artist", "Asset needs JSON", '{"characters": [{"name": "...", "desc": "..."}], "collectible": {"name": "...", "desc": "..."}}')}
          </div>
          {debugOpen && <aside className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/15 bg-slate-950/45 p-5 shadow-2xl backdrop-blur-xl">
            <button onClick={() => setDebugOpen(false)} aria-label="Close debug trace" className="absolute right-4 top-1/2 z-20 flex h-20 w-10 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-r-0 border-white/20 bg-slate-950/75 text-cyan-100 shadow-xl backdrop-blur-md transition hover:bg-cyan-100/15 hover:text-white"><ArrowRight size={28} strokeWidth={1.5} /></button>
            <div className="shrink-0 pr-8"><div className="flex items-center gap-2"><PanelRight size={16} className="text-cyan-200" /><h2 className="font-display text-xl">Live progress</h2></div><p className="mt-2 text-xs leading-5 text-white/45">Short agent and tool updates appear here while the run is active.</p></div>
            <div className="scrollbar-pill mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
              {debug.length ? <div className="space-y-2">{debug.map((entry, index) => {
                const asset = entry as { kind?: string; type?: ArtistType; name?: string; imageCount?: number };
                if (asset.kind === "asset") {
                  const assetImages = images.filter((image) => image.type === asset.type && image.name === asset.name);
                  return <div key={`asset-${asset.name ?? index}-${index}`} className="rounded-lg border border-cyan-200/15 bg-cyan-100/[.04] p-3"><p className="mb-2 text-xs text-cyan-100"><span className="mr-2 font-mono text-[9px] uppercase tracking-[.14em] text-cyan-200/50">{asset.type}</span>{asset.name}</p>{asset.type === "character_sprite" ? <AnimatedSpritePreview frames={assetImages} name={asset.name ?? "Generated character"} /> : <div className="grid grid-cols-2 gap-2">{assetImages.map((image, imageIndex) => <Image key={`${image.url.slice(0, 16)}-${imageIndex}`} src={image.url} alt={asset.name ?? "Generated pixel art"} width={128} height={128} unoptimized className="w-full rounded-lg border border-white/10 bg-white/10" />)}</div>}</div>;
                }
                const progress = entry as { agent?: string; message?: string; phase?: string };
                return <div key={`${progress.agent ?? "event"}-${index}`} className="whitespace-pre-wrap rounded-lg border border-white/8 bg-white/[.03] px-3 py-2 text-xs leading-4 text-cyan-50/75"><span className="mr-2 font-mono text-[9px] uppercase tracking-[.14em] text-cyan-200/50">{progress.agent ?? "system"}</span>{progress.message ?? "Progress update"}</div>;
              })}</div> : <p className="text-xs text-white/40">No progress yet.</p>}
            </div>
          </aside>}
          {!debugOpen && <button onClick={() => setDebugOpen(true)} aria-label="Open debug trace" className="fixed right-0 top-1/2 z-30 flex h-24 w-14 -translate-y-1/2 items-center justify-center rounded-l-3xl border border-r-0 border-white/25 bg-slate-950/75 text-cyan-100 shadow-2xl shadow-black/40 backdrop-blur-md transition hover:w-16 hover:bg-cyan-100/15 hover:text-white"><ArrowLeft size={32} strokeWidth={1.5} /></button>}
        </div>
      </div>
    </main>
  );
}
