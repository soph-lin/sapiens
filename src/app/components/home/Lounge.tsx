"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import type { Presentable } from "@/lib/dialogue";
import {
  CURATOR_GENRES,
  type CuratorIdea,
} from "@/lib/orchestrator/agent/curator-shared";
import { Coco } from "@/app/components/coco";
import {
  DialoguePanel,
  THEMES,
  useDialogueSession,
  type DialogueDropdownChoice,
} from "@/app/components/dialogue";
import { COCO_CX, COCO_CY } from "@/app/components/coco/placement";
import HomeBackground from "@/app/components/home/HomeBackground";
import PixelHouseIcon from "@/app/components/home/PixelHouseIcon";
import ShopPanel from "@/app/components/home/ShopPanel";
import LoadingScreen from "@/app/components/loading/LoadingScreen";
import ProgressLogPanel from "@/app/components/progress/ProgressLogPanel";
import {
  progressEntriesForStorage,
  type ProgressLogEntry,
} from "@/app/components/progress/ProgressLog";
import intro from "@/lib/content/canon/intro.json";
import {
  COCO_DESTINATION_OPTIONS,
  COCO_GENERATION_CONFIRMATIONS,
} from "@/lib/curate/coco";

const theme = THEMES.space;
const RUN_STOPPED_MESSAGE = "Run stopped by user";
const COCO_WAKE_TAPS = 3;
const COCO_WAKE_QUESTIONS = [
  "yup yup?",
  "in the mood for fun?",
  "what are you curious about?",
  "want to run something?",
  "anything on your mind?",
] as const;
const COCO_GENRES = CURATOR_GENRES;

type CocoRequestMode = "genre" | "destination";
type CocoDialogueStep = "offer" | "story" | "ideas" | "confirm";
type CocoIdea = CuratorIdea | string;
type CocoPendingGeneration =
  | { kind: "curator"; query: string; message: string }
  | { kind: "idea"; idea: CocoIdea; steering?: string; message: string };
type SteerAgent = "researcher" | "director" | "writer" | "artist";
type PipelineAsset = {
  type: "character" | "character_sprite" | "collectible";
  name: string;
  assetId?: string;
  imageDataUrls?: string[];
  frames?: Array<{ frameKey: string; dataUrl: string }>;
  metadata?: unknown;
  ageRange?: string;
};
type AgentRunResult = {
  output: unknown;
  assets: PipelineAsset[];
  usage?: unknown;
};
type HomeFlourishPolicy = {
  sourceMode: "free" | "restricted";
  approvedDomains: string[];
};

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionWithExclamation(value: string): string {
  return value.endsWith("!") ? value : `${value}!`;
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split("\n");
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice(6)
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!event || !data) return null;
  try {
    return { event, data: JSON.parse(data) as unknown };
  } catch {
    return null;
  }
}

function normalizeCuratorIdea(payload: unknown): CuratorIdea | null {
  const root = asRecord(payload);
  const output = asRecord(root?.output) ?? root;
  const idea = asRecord(output?.idea);
  if (!idea) return null;
  const historicalEvent = textValue(idea.historicalEvent);
  const name = textValue(idea.name) ?? historicalEvent;
  if (!name || !historicalEvent) return null;
  return {
    name,
    historicalEvent,
    era: textValue(idea.era) ?? "",
    region: textValue(idea.region) ?? "",
    whyItFits: textValue(idea.whyItFits) ?? "",
    plotDirection: textValue(idea.plotDirection) ?? "",
    sourceSearchTerms: textValue(idea.sourceSearchTerms) ?? historicalEvent,
  };
}

async function runSteerAgent(
  agent: SteerAgent,
  input: string,
  options: {
    signal: AbortSignal;
    onProgress: (entry: ProgressLogEntry) => void;
    plotDirection?: string;
    flourish?: HomeFlourishPolicy;
  },
): Promise<AgentRunResult> {
  const response = await fetch("/api/steer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      agent,
      input,
      limits: { maxTurns: 10, maxCharacters: 3 },
      plotDirection: options.plotDirection,
      flourish: options.flourish,
    }),
  });
  if (!response.ok) {
    const body = asRecord(await response.json().catch(() => null));
    throw new Error(textValue(body?.error) ?? `${agent} failed to start`);
  }
  if (!response.body) throw new Error(`${agent} stream was unavailable`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output: unknown;
  let receivedResult = false;
  let usage: unknown;
  const assets: PipelineAsset[] = [];

  const process = (chunk: string) => {
    buffer += chunk;
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const rawBlock of blocks) {
      const parsed = parseSseBlock(rawBlock.trim());
      if (!parsed) continue;
      const data = asRecord(parsed.data);
      if (parsed.event === "progress") {
        options.onProgress({
          agent: textValue(data?.agent) ?? agent,
          phase: textValue(data?.phase) ?? "agent",
          message: textValue(data?.message) ?? "Progress update",
          details: data?.details && typeof data.details === "object" && !Array.isArray(data.details)
            ? data.details as Record<string, unknown>
            : undefined,
        });
      } else if (parsed.event === "asset" && data) {
        const type = textValue(data.type);
        const name = textValue(data.name);
        if (
          (type === "character" ||
            type === "character_sprite" ||
            type === "collectible") &&
          name
        ) {
          const frames = Array.isArray(data.frames)
            ? data.frames.flatMap((value) => {
                const frame = asRecord(value);
                const frameKey = textValue(frame?.frameKey);
                const dataUrl = textValue(frame?.dataUrl);
                return frameKey && dataUrl ? [{ frameKey, dataUrl }] : [];
              })
            : [];
          const imageDataUrls = Array.isArray(data.imageDataUrls)
            ? data.imageDataUrls.filter(
                (value): value is string => typeof value === "string",
              )
            : frames.map((frame) => frame.dataUrl);
          const assetId = textValue(data.assetId) ?? undefined;
          const metadata = data.metadata;
          assets.push({
            type,
            name,
            assetId,
            imageDataUrls,
            frames: frames.length ? frames : undefined,
            metadata,
            ageRange: textValue(data.ageRange) ?? undefined,
          });
          options.onProgress({
            agent,
            phase: "asset",
            kind: "asset",
            type,
            name,
            assetId,
            imageDataUrls,
            frames: frames.length ? frames : undefined,
            imageCount: imageDataUrls.length,
            metadata,
          });
        }
      } else if (parsed.event === "result" && data) {
        output = data.output;
        usage = data.usage;
        receivedResult = true;
      } else if (parsed.event === "error") {
        throw new Error(textValue(data?.message) ?? `${agent} failed`);
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    process(decoder.decode(value, { stream: true }));
  }
  process(decoder.decode());
  if (buffer.trim()) process(`\n\n${buffer}`);
  if (!receivedResult) throw new Error(`${agent} completed without a result`);
  return { output, assets, usage };
}

/** Ship scene: wake is black; atmosphere from ship-1 onward. */
function onShipScene(nodeId: string): boolean {
  return /^(ship-|escort-|play-|tv-|survey-|bedtime-)/.test(nodeId);
}

/** Coco enters at ship-2 and stays for the rest of the lounge scene. */
function cocoOnStage(nodeId: string): boolean {
  return nodeId !== "ship-1" && onShipScene(nodeId);
}

function subscribeToTutorialDone(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getTutorialDone(): boolean {
  return window.localStorage.getItem("tutorialDone") === "true";
}

export default function Lounge() {
  const [shopOpen, setShopOpen] = useState(false);
  const [cocoTapCount, setCocoTapCount] = useState(0);
  const [cocoDialogueOpen, setCocoDialogueOpen] = useState(false);
  const [cocoDialogueStep, setCocoDialogueStep] =
    useState<CocoDialogueStep>("offer");
  const [cocoDialogueQuestion, setCocoDialogueQuestion] = useState<string>();
  const [cocoRequestMode, setCocoRequestMode] =
    useState<CocoRequestMode>("genre");
  const [cocoGenreDropdownOpen, setCocoGenreDropdownOpen] = useState(false);
  const [cocoInlineQuery, setCocoInlineQuery] = useState("");
  const [cocoIdeas, setCocoIdeas] = useState<CocoIdea[]>([]);
  const [cocoPendingGeneration, setCocoPendingGeneration] =
    useState<CocoPendingGeneration>();
  const [cocoRequestError, setCocoRequestError] = useState<string>();
  const [cocoCuratorRunning, setCocoCuratorRunning] = useState(false);
  const [cocoPipelineRunning, setCocoPipelineRunning] = useState(false);
  const [homeFlourish, setHomeFlourish] = useState<HomeFlourishPolicy>();
  const [cocoPipelineProgress, setCocoPipelineProgress] = useState(0);
  const [progressEntries, setProgressEntries] = useState<ProgressLogEntry[]>(
    [],
  );
  const progressEntriesRef = useRef<ProgressLogEntry[]>([]);
  const pipelineAbortRef = useRef<AbortController | null>(null);
  const storyRunSlugRef = useRef<string | null>(null);
  const storyRunOutputsRef = useRef<Record<string, unknown>>({});
  const storyRunUsageRef = useRef<Record<string, unknown>>({});
  const storyRunPersistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [cocoDialogueRevealKey, setCocoDialogueRevealKey] = useState(0);
  const cocoTypingGateRef = useRef({ done: true, skip: () => {} });
  // localStorage is unavailable during SSR; hold the lounge behind a loading
  // screen until mount so returning players don't flash the intro dialogue.
  const [tutorialReady, setTutorialReady] = useState(false);
  const tutorialDone = useSyncExternalStore(
    subscribeToTutorialDone,
    getTutorialDone,
    () => false,
  );
  const { view, revealKey, typingGateRef, advance, choose, restart } =
    useDialogueSession({
      scenarioId: "intro",
      story: intro,
    });
  const tutorialFinished =
    view.kind === "end" || (view.kind === "text" && !view.canAdvance);
  const postTutorial = tutorialDone || tutorialFinished;
  const cocoAwake = cocoTapCount >= COCO_WAKE_TAPS;
  const showCoco = postTutorial || cocoOnStage(view.id);

  useEffect(() => {
    startTransition(() => setTutorialReady(true));
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/classrooms/current")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load classroom policy");
        return response.json() as Promise<{ classroom?: HomeFlourishPolicy | null }>;
      })
      .then((payload) => {
        if (active && payload.classroom) setHomeFlourish(payload.classroom);
      })
      .catch(() => {
        // The steer route also resolves the policy server-side. Keep Home usable
        // if this informational read is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (tutorialFinished) {
      window.localStorage.setItem("tutorialDone", "true");
    }
  }, [tutorialFinished]);

  const openCocoDialogue = () => {
    setCocoDialogueQuestion(pickRandom(COCO_WAKE_QUESTIONS));
    setCocoDialogueStep("offer");
    setCocoIdeas([]);
    setCocoPendingGeneration(undefined);
    setCocoGenreDropdownOpen(false);
    setCocoInlineQuery("");
    setCocoRequestError(undefined);
    setCocoDialogueRevealKey((key) => key + 1);
    setCocoDialogueOpen(true);
  };

  const wakeCoco = () => {
    if (!postTutorial || cocoAwake) return;
    const nextTapCount = Math.min(cocoTapCount + 1, COCO_WAKE_TAPS);
    setCocoTapCount(nextTapCount);
    if (nextTapCount < COCO_WAKE_TAPS) return;
    openCocoDialogue();
  };
  const closeCocoDialogue = () => {
    pipelineAbortRef.current?.abort();
    setCocoDialogueOpen(false);
    setCocoCuratorRunning(false);
    setCocoPipelineRunning(false);
  };
  const returnCocoToSleep = () => {
    setCocoDialogueOpen(false);
    setCocoTapCount(0);
    setCocoDialogueStep("offer");
    setCocoIdeas([]);
    setCocoPendingGeneration(undefined);
    setCocoGenreDropdownOpen(false);
    setCocoInlineQuery("");
    setCocoRequestError(undefined);
  };

  const addProgress = (entry: ProgressLogEntry) => {
    const next = [...progressEntriesRef.current, entry].slice(-100);
    progressEntriesRef.current = next;
    setProgressEntries(next);
  };

  const resetStoryGenRun = () => {
    storyRunSlugRef.current = null;
    storyRunOutputsRef.current = {};
    storyRunUsageRef.current = {};
    storyRunPersistQueueRef.current = Promise.resolve();
  };

  const createStoryGenRun = async (
    steering: string,
    storyConfig: Record<string, unknown>,
  ): Promise<string> => {
    const response = await fetch("/api/steer/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steering,
        storyConfig,
        progress: progressEntriesForStorage(progressEntriesRef.current),
      }),
    });
    const body = asRecord(await response.json().catch(() => null));
    if (!response.ok) {
      throw new Error(textValue(body?.error) ?? "Could not create story generation run.");
    }
    const slug = textValue(body?.slug);
    if (!slug) throw new Error("Story generation run was created without a slug.");
    storyRunSlugRef.current = slug;
    return slug;
  };

  const persistStoryGenRun = (
    nextOutputs: Record<string, unknown> = {},
    options: { error?: string; status?: "ongoing" | "fail" | "succeed"; usage?: unknown } = {},
  ): Promise<void> => {
    const slug = storyRunSlugRef.current;
    if (!slug) return Promise.resolve();
    Object.assign(storyRunOutputsRef.current, nextOutputs);
    const usage = asRecord(options.usage);
    if (usage) Object.assign(storyRunUsageRef.current, usage);
    const payload = {
      slug,
      progress: progressEntriesForStorage(progressEntriesRef.current),
      outputs: { ...storyRunOutputsRef.current },
      error: options.error ?? null,
      status: options.status,
      usage: Object.keys(storyRunUsageRef.current).length
        ? { ...storyRunUsageRef.current }
        : undefined,
    };
    const request = storyRunPersistQueueRef.current.then(async () => {
      const response = await fetch("/api/steer/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return;
    });
    storyRunPersistQueueRef.current = request.catch(() => undefined);
    return storyRunPersistQueueRef.current;
  };

  /** Abort the active pipeline. Progress and completed fields are already persisted incrementally. */
  const terminateCocoGeneration = () => {
    if (!pipelineAbortRef.current) return;
    addProgress({
      agent: "system",
      phase: "stop",
      message: "Stopping run…",
    });
    pipelineAbortRef.current.abort();
  };

  const goBackCocoDialogue = () => {
    if (cocoDialogueStep === "confirm") {
      setCocoPendingGeneration(undefined);
      setCocoDialogueStep("ideas");
    } else if (cocoDialogueStep === "ideas") {
      setCocoDialogueStep("story");
    } else if (cocoDialogueStep === "story") {
      setCocoDialogueStep("offer");
    }
    setCocoRequestError(undefined);
    setCocoDialogueRevealKey((key) => key + 1);
  };

  const confirmCocoGeneration = (
    request:
      | { kind: "curator"; query: string }
      | { kind: "idea"; idea: CocoIdea; steering?: string },
  ) => {
    setCocoPendingGeneration({
      ...request,
      message: pickRandom(COCO_GENERATION_CONFIRMATIONS),
    });
    setCocoGenreDropdownOpen(false);
    setCocoDialogueStep("confirm");
    setCocoDialogueRevealKey((key) => key + 1);
  };

  const advanceCocoDialogue = () => {
    if (cocoDialogueStep !== "confirm" || !cocoPendingGeneration) return;
    const pending = cocoPendingGeneration;
    setCocoPendingGeneration(undefined);
    if (pending.kind === "curator") {
      void requestCurator(pending.query);
    } else {
      void runIdea(pending.idea, pending.steering);
    }
  };

  const requestCurator = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || cocoPipelineRunning || cocoCuratorRunning) return;
    const criteria = trimmed;
    setCocoRequestError(undefined);
    progressEntriesRef.current = [];
    setProgressEntries([]);
    resetStoryGenRun();
    const abortController = new AbortController();
    pipelineAbortRef.current = abortController;
    setCocoCuratorRunning(true);
    setCocoPipelineProgress(0.08);
    addProgress({
      agent: "curator",
      phase: "agent",
      message: "Starting agent…",
    });
    try {
      const runSlug = await createStoryGenRun(criteria, {
        maxTurns: 10,
        maxCharacters: 3,
      });
      void persistStoryGenRun();
      const response = await fetch("/api/home/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ stage: "curate", input: criteria }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const error = asRecord(body);
        throw new Error(
          textValue(error?.error) ?? "Curator could not find an idea.",
        );
      }
      if (!response.body) throw new Error("Curator stream was unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: unknown;
      let usage: unknown;
      let failed: string | undefined;
      const process = (chunk: string) => {
        buffer += chunk;
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const rawBlock of blocks) {
          const parsed = parseSseBlock(rawBlock.trim());
          if (!parsed) continue;
          const data = asRecord(parsed.data);
          if (parsed.event === "progress" && data) {
            const entry = {
              agent: textValue(data.agent) ?? "curator",
              phase: textValue(data.phase) ?? "agent",
              message: textValue(data.message) ?? "Progress update",
            } satisfies ProgressLogEntry;
            addProgress(entry);
            void persistStoryGenRun();
          } else if (parsed.event === "result" && data) {
            result = data.output;
            usage = data.usage;
            void persistStoryGenRun(
              { curator: result },
              { usage: { curator: usage } },
            );
          } else if (parsed.event === "error" && data) {
            failed = textValue(data.message) ?? "Curator failed";
          }
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        process(decoder.decode(value, { stream: true }));
      }
      process(decoder.decode());
      if (buffer.trim()) process(`\n\n${buffer}`);
      if (failed) throw new Error(failed);
      if (abortController.signal.aborted) {
        addProgress({
          agent: "system",
          phase: "stop",
          message: "Run stopped.",
        });
        toast.success("Run stopped.");
        setCocoDialogueOpen(false);
        return;
      }
      const idea = normalizeCuratorIdea(result);
      if (!idea) throw new Error("Curator did not return one story idea.");
      setCocoPipelineProgress(0.2);
      addProgress({
        agent: "curator",
        phase: "agent",
        message: "One story idea is ready. Starting the voyage pipeline…",
      });
      await persistStoryGenRun(
        { curator: result },
        { usage: { curator: usage } },
      );
      void runIdea(idea, criteria, result, runSlug);
    } catch (error) {
      if (abortController.signal.aborted) {
        addProgress({
          agent: "system",
          phase: "stop",
          message: "Run stopped.",
        });
        toast.success("Run stopped.");
        setCocoDialogueOpen(false);
        return;
      }
      const message = error instanceof Error ? error.message : "Curator failed";
      setCocoRequestError(message);
      addProgress({ agent: "curator", phase: "agent", message });
      if (!abortController.signal.aborted) {
        await persistStoryGenRun({}, { error: message });
      }
    } finally {
      if (pipelineAbortRef.current === abortController) {
        pipelineAbortRef.current = null;
      }
      setCocoCuratorRunning(false);
    }
  };

  const runIdea = async (
    idea: CocoIdea,
    steeringInput?: string,
    curatorOutput?: unknown,
    existingRunSlug?: string,
  ) => {
    if (cocoPipelineRunning) return;
    const historicalEvent =
      typeof idea === "string" ? idea : idea.historicalEvent;
    const researcherInput =
      typeof idea === "string"
        ? idea
        : JSON.stringify({
            historicalEvent: idea.historicalEvent,
            sourceSearchTerms: idea.sourceSearchTerms,
            plotDirection: idea.plotDirection,
          });
    if (!existingRunSlug) {
      progressEntriesRef.current = [];
      setProgressEntries([]);
      resetStoryGenRun();
    }
    const abortController = new AbortController();
    pipelineAbortRef.current = abortController;
    setCocoPipelineRunning(true);
    setCocoPipelineProgress(0.04);
    setCocoRequestError(undefined);
    addProgress({
      agent: "system",
      phase: "run",
      message: "Starting the voyage pipeline…",
    });

    const steering = (steeringInput ?? historicalEvent).trim();

    try {
      const runSlug = existingRunSlug ?? await createStoryGenRun(steering, {
        maxTurns: 10,
        maxCharacters: 3,
      });
      if (existingRunSlug) storyRunSlugRef.current = existingRunSlug;
      if (curatorOutput !== undefined) {
        await persistStoryGenRun({ curator: curatorOutput });
      }
      void persistStoryGenRun();
      if (abortController.signal.aborted) {
        return;
      }

      const onProgress = (entry: ProgressLogEntry) => {
        addProgress(entry);
        void persistStoryGenRun();
      };
      const research = await runSteerAgent("researcher", researcherInput, {
        signal: abortController.signal,
        onProgress,
        flourish: homeFlourish,
      });
      setCocoPipelineProgress(0.22);
      await persistStoryGenRun(
        { researcher: research.output },
        { usage: { researcher: research.usage } },
      );

      const director = await runSteerAgent(
        "director",
        JSON.stringify(research.output),
        {
          signal: abortController.signal,
          onProgress,
          flourish: homeFlourish,
          plotDirection:
            typeof idea === "string"
              ? steeringInput ?? idea
              : idea.plotDirection,
        },
      );
      setCocoPipelineProgress(0.42);
      await persistStoryGenRun({ director: director.output }, { usage: { director: director.usage } });

      const writer = await runSteerAgent(
        "writer",
        JSON.stringify(director.output),
        { signal: abortController.signal, onProgress, flourish: homeFlourish },
      );
      setCocoPipelineProgress(0.64);
      const writerOutput = asRecord(writer.output);
      const needAssets = asRecord(writerOutput?.need_assets);
      if (!writerOutput || !needAssets) {
        await persistStoryGenRun(
          { writer: writer.output },
          { error: "Writer did not return asset requirements." },
        );
        throw new Error("Writer did not return asset requirements.");
      }
      await persistStoryGenRun({ writer: writer.output }, { usage: { writer: writer.usage } });

      const artist = await runSteerAgent("artist", JSON.stringify(needAssets), {
        signal: abortController.signal,
        onProgress,
        flourish: homeFlourish,
      });
      setCocoPipelineProgress(0.84);
      await persistStoryGenRun({ artist: artist.output }, { usage: { artist: artist.usage } });

      const directorOutput = asRecord(director.output);
      if (!directorOutput) throw new Error("Director returned invalid output.");
      const writerStory = writerOutput.dialogue ?? writerOutput;
      const storyAssets = artist.assets.flatMap((asset) => {
        if (asset.frames?.length) {
          return asset.frames.map((frame) => ({
            type: asset.type,
            name: asset.name,
            frameKey: frame.frameKey,
            dataUrl: frame.dataUrl,
            assetId: asset.assetId,
            metadata: asset.metadata,
            ageRange: asset.ageRange,
          }));
        }
        return (asset.imageDataUrls ?? []).map((dataUrl) => ({
          type: asset.type,
          name: asset.name,
          dataUrl,
          assetId: asset.assetId,
          metadata: asset.metadata,
          ageRange: asset.ageRange,
        }));
      });
      addProgress({
        agent: "system",
        phase: "complete",
        message: "Pipeline complete. Saving the finished story…",
      });
      await persistStoryGenRun(
        {
          curator: curatorOutput,
          researcher: research.output,
          director: director.output,
          writer: writer.output,
          artist: artist.output,
        },
        {
          status: "succeed",
          usage: {
            researcher: research.usage,
            director: director.usage,
            writer: writer.usage,
            artist: artist.usage,
          },
        },
      );
      const finalizeResponse = await fetch("/api/stories/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          storyJson: writerStory,
          synopsis: directorOutput.synopsis,
          runSlug,
          steering,
          period:
            typeof idea === "string"
              ? undefined
              : idea.era?.trim() || undefined,
          storyConfig: { maxTurns: 10, maxCharacters: 3 },
          outputs: {
            curator: curatorOutput,
            researcher: research.output,
            director: director.output,
            writer: writer.output,
            artist: artist.output,
          },
          director: {
            ...directorOutput,
            characters: needAssets.characters ?? [],
            starCharacter: needAssets.starCharacter ?? null,
          },
          assets: storyAssets,
          progress: progressEntriesForStorage(progressEntriesRef.current),
          usage: {
            researcher: research.usage,
            director: director.usage,
            writer: writer.usage,
            artist: artist.usage,
          },
        }),
      });
      const finalizeBody = asRecord(
        await finalizeResponse.json().catch(() => null),
      );
      if (!finalizeResponse.ok) {
        throw new Error(
          textValue(finalizeBody?.error) ?? "Could not save the story.",
        );
      }
      const slug = textValue(finalizeBody?.slug);
      if (!slug) throw new Error("Story saved without a destination.");
      addProgress({
        agent: "system",
        phase: "save",
        message: "Story saved. Opening the voyage…",
      });
      setCocoPipelineProgress(1);
      // Reset Home before opening the new tab so popup handling cannot leave
      // the original page on the final Coco confirmation beat.
      returnCocoToSleep();
      const voyageTab = window.open(
        `/sail/${encodeURIComponent(slug)}`,
        "_blank",
        "noopener,noreferrer",
      );
      if (!voyageTab) {
        toast.error("Ship failed to start! Try again later.");
      }
    } catch (error) {
      const stopped =
        abortController.signal.aborted ||
        (error instanceof Error && error.message === RUN_STOPPED_MESSAGE);
      const message = stopped
        ? RUN_STOPPED_MESSAGE
        : error instanceof Error
          ? error.message
          : "Voyage failed";
      if (stopped) {
        addProgress({
          agent: "system",
          phase: "stop",
          message: "Run stopped.",
        });
        toast.success("Run stopped.");
        setCocoDialogueOpen(false);
        return;
      }
      await persistStoryGenRun({}, { error: message });
      toast.error("Ship failed to start! Try again later.");
      addProgress({ agent: "system", phase: "error", message });
    } finally {
      if (pipelineAbortRef.current === abortController) {
        pipelineAbortRef.current = null;
      }
      setCocoPipelineRunning(false);
    }
  };

  const submitCocoInlineChoice = (valueOverride?: string) => {
    const value = (valueOverride ?? cocoInlineQuery).trim();
    if (!value) return;
    setCocoInlineQuery("");
    if (cocoDialogueStep === "story" || cocoRequestMode === "destination") {
      confirmCocoGeneration({ kind: "idea", idea: value, steering: value });
    }
  };

  const handleCocoDialogueChoice = (index: number) => {
    if (cocoDialogueStep === "offer") {
      if (index !== 0) return;
      setCocoDialogueStep("story");
      setCocoRequestError(undefined);
      setCocoDialogueRevealKey((key) => key + 1);
      return;
    }
    if (cocoDialogueStep === "story") {
      if (index !== 0 && index !== 1) return;
      setCocoRequestError(undefined);
      if (index === 0) {
        setCocoRequestMode("genre");
        setCocoInlineQuery("");
        setCocoGenreDropdownOpen(false);
        const first = pickRandom(COCO_GENRES);
        const remaining = COCO_GENRES.filter((option) => option !== first);
        setCocoIdeas([first, pickRandom(remaining)]);
        setCocoDialogueStep("ideas");
        setCocoDialogueRevealKey((key) => key + 1);
      } else {
        setCocoRequestMode("destination");
        setCocoInlineQuery("");
        setCocoGenreDropdownOpen(false);
        const first = pickRandom(COCO_DESTINATION_OPTIONS);
        const remaining = COCO_DESTINATION_OPTIONS.filter(
          (option) => option !== first,
        );
        setCocoIdeas([first, pickRandom(remaining)]);
        setCocoDialogueStep("ideas");
        setCocoDialogueRevealKey((key) => key + 1);
      }
      return;
    }
    if (cocoDialogueStep === "ideas") {
      const idea = cocoIdeas[index];
      if (!idea) return;
      if (cocoRequestMode === "genre" && typeof idea === "string") {
        confirmCocoGeneration({ kind: "curator", query: idea });
      } else {
        confirmCocoGeneration({ kind: "idea", idea });
      }
    }
  };

  const cocoDialogueView: Presentable =
    cocoDialogueStep === "confirm"
      ? {
          kind: "text" as const,
          id: "coco-generation-confirm",
          speaker: "Coco",
          text: cocoPendingGeneration?.message ?? "Here we go!",
          canAdvance: true,
        }
      : cocoDialogueStep === "ideas" && cocoIdeas.length
        ? {
            kind: "choice",
            id: "coco-curator-ideas",
            prompt: cocoRequestMode === "genre" ? "what about?" : "where to?",
            choices: cocoIdeas.map((idea, index) => ({
              index,
              label:
                typeof idea === "string"
                  ? optionWithExclamation(idea)
                  : cocoRequestMode === "destination"
                    ? optionWithExclamation(idea.name)
                    : idea.era
                      ? `${idea.name} · ${idea.region || "somewhere"} in the ${idea.era}`
                      : idea.name,
            })),
          }
        : cocoDialogueStep === "story"
          ? {
              kind: "choice",
              id: "coco-story-offer",
              prompt: "what about?",
              choices: [
                { index: 0, label: "Something..." },
                { index: 1, label: "Take me to..." },
              ],
            }
          : {
              kind: "choice",
              id: "coco-wake-offer",
              prompt: cocoDialogueQuestion ?? "need something?",
              choices: [{ index: 0, label: "Tell me a story" }],
            };

  if (!tutorialReady) {
    return (
      <div className="relative min-h-dvh w-full overflow-hidden bg-black text-white font-space">
        <LoadingScreen />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black text-white font-space">
      {postTutorial || onShipScene(view.id) ? <HomeBackground /> : null}
      {showCoco ? (
        <Coco
          expression={
            postTutorial
              ? cocoAwake && !cocoCuratorRunning && !cocoPipelineRunning
                ? "idle"
                : "sleeping"
              : view.kind === "text" && view.speaker?.toLowerCase() === "coco"
                ? "talking"
                : "idle"
          }
        />
      ) : null}

      {postTutorial ? (
        <button
          type="button"
          onClick={cocoAwake ? openCocoDialogue : wakeCoco}
          aria-label={
            cocoAwake
              ? "Talk to Coco"
              : `Wake Coco — ${COCO_WAKE_TAPS - cocoTapCount} taps remaining`
          }
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          style={{
            left: `${COCO_CX * 100}%`,
            top: `${COCO_CY * 100}%`,
            width: "min(48vw, 48vh)",
            height: "min(48vw, 48vh)",
          }}
        />
      ) : null}

      {cocoDialogueOpen ? (
        cocoPipelineRunning || cocoCuratorRunning ? (
          <div className="fixed inset-0 z-50">
            <LoadingScreen
              progress={cocoPipelineProgress}
              pipelineProgress={progressEntries}
              onTerminate={terminateCocoGeneration}
            />
          </div>
        ) : (
          <main className="pointer-events-none relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-end px-6 pb-10 pt-[48vh] sm:px-8 sm:pb-14">
            <DialoguePanel
              className="pointer-events-auto flex min-h-[28vh] flex-col"
              view={cocoDialogueView}
              theme="space"
              size="md"
              typingGateRef={cocoTypingGateRef}
              onAdvance={advanceCocoDialogue}
              onChoose={handleCocoDialogueChoice}
              onRestart={closeCocoDialogue}
              onEscape={closeCocoDialogue}
              onBack={
                cocoDialogueStep === "offer" ? undefined : goBackCocoDialogue
              }
              dropdownChoice={
                cocoDialogueStep === "ideas" && cocoRequestMode === "genre"
                  ? ({
                      label: "Something...",
                      options: COCO_GENRES,
                      placeholder: "choose a genre…",
                      expanded: cocoGenreDropdownOpen,
                      onToggle: () => setCocoGenreDropdownOpen((open) => !open),
                      onSelect: (value) => {
                        if (!COCO_GENRES.some((option) => option === value)) return;
                        confirmCocoGeneration({ kind: "curator", query: value });
                      },
                    } satisfies DialogueDropdownChoice)
                  : undefined
              }
              editableChoice={
                (cocoDialogueStep === "story" ||
                  (cocoDialogueStep === "ideas" &&
                    cocoRequestMode === "destination"))
                  ? {
                      label:
                        cocoDialogueStep === "story"
                          ? "Tell a story about..."
                          : "Take me to...",
                      value: cocoInlineQuery,
                      placeholder:
                        cocoDialogueStep === "story"
                          ? "type a topic, person, place, or moment..."
                          : "type a country, continent, or period...",
                      onChange: setCocoInlineQuery,
                      onSubmit: submitCocoInlineChoice,
                    }
                  : undefined
              }
              revealKey={cocoDialogueRevealKey}
            >
              {cocoRequestError ? (
                <p className="mt-5 rounded-sm border border-rose-200/20 bg-rose-300/10 px-3 py-3 text-xs leading-5 text-rose-100">
                  {cocoRequestError}
                </p>
              ) : null}
            </DialoguePanel>
          </main>
        )
      ) : null}

      {postTutorial ? (
        <>
          {!cocoPipelineRunning && !cocoCuratorRunning && (
            <ProgressLogPanel
              entries={progressEntries}
              onTerminate={
                cocoCuratorRunning ? terminateCocoGeneration : undefined
              }
            />
          )}
          <ShopPanel isOpen={shopOpen} onClose={() => setShopOpen(false)} />
          <div className="pointer-events-auto fixed bottom-6 right-6 z-30 flex flex-col items-center gap-3 sm:bottom-8 sm:right-8">
            <Link
              href="/home-2d"
              aria-label="Enter 2D home"
              className="group relative flex size-14 items-center justify-center rounded-full border border-cyan-100/20 bg-slate-950/90 text-cyan-100 shadow-[0_0_30px_rgba(103,232,249,0.15)] backdrop-blur transition hover:border-cyan-100/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
            >
              <PixelHouseIcon size={22} />
              <span className="pointer-events-none absolute right-[calc(100%+0.55rem)] top-1/2 -translate-y-1/2 rounded-md border border-cyan-100/15 bg-slate-950/95 px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-cyan-100/80 opacity-0 shadow-[0_0_20px_rgba(103,232,249,0.12)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                Home
              </span>
            </Link>
            <div className="group relative">
              <button
                type="button"
                onClick={() => setShopOpen((open) => !open)}
                aria-expanded={shopOpen}
                aria-controls="shop-panel"
                aria-label={shopOpen ? "Close shop" : "Open shop"}
                className="flex size-14 items-center justify-center rounded-full border border-cyan-100/20 bg-slate-950/90 text-cyan-100 shadow-[0_0_30px_rgba(103,232,249,0.15)] backdrop-blur transition hover:border-cyan-100/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
              >
                <ShoppingBag size={22} aria-hidden />
              </button>
              <span className="pointer-events-none absolute right-[calc(100%+0.55rem)] top-1/2 -translate-y-1/2 rounded-md border border-cyan-100/15 bg-slate-950/95 px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-cyan-100/80 opacity-0 shadow-[0_0_20px_rgba(103,232,249,0.12)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                Shop
              </span>
            </div>
          </div>
        </>
      ) : null}

      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{
          duration: 2800,
          className: theme.toastClass,
          style: theme.toastStyle,
        }}
      />

      {!postTutorial ? (
        <main className="pointer-events-none relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-end px-6 pb-10 pt-[48vh] sm:px-8 sm:pb-14">
          <DialoguePanel
            className="pointer-events-auto flex min-h-[28vh] flex-col"
            view={view}
            theme="space"
            size="md"
            typingGateRef={typingGateRef}
            onAdvance={advance}
            onChoose={choose}
            onRestart={restart}
            revealKey={revealKey}
          />
        </main>
      ) : null}
    </div>
  );
}
