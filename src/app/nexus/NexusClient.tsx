"use client";

import {
  Activity,
  ArrowUpRight,
  BookMarked,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Command,
  Compass,
  FileText,
  Heart,
  LoaderCircle,
  Menu,
  MessageCircle,
  Plus,
  Send,
  Settings,
  Ship,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { SparklingStars } from "@/app/components/effects";
import LoadingScreen from "@/app/components/loading/LoadingScreen";
import { AppNavbar } from "@/app/components/nav";
import ProgressLogPanel from "@/app/components/progress/ProgressLogPanel";
import { ReportMarkdown } from "@/app/components/report";
import {
  progressEntriesForStorage,
  type ProgressLogEntry,
} from "@/app/components/progress/ProgressLog";
import { useUser } from "@/app/components/user/UserProvider";
import { VISITOR_NOTE_HEADER } from "@/lib/learning/starstream-constants";
import type { DemoUser } from "@/lib/demo-auth";
import type { CuratorOutput } from "@/lib/orchestrator/agent/curator-shared";
import { isConcreteHistoricalPeriod } from "@/lib/orchestrator/agent/curator-shared";
import {
  normalizeFlourishConfig,
  sourcePolicyFromClassroom,
  type FlourishConfig,
} from "@/lib/orchestrator/agent/flourish";
import { formatRelativeTime } from "@/lib/util";
import {
  type Assignment,
  type CadetProgress,
  type ClassroomSettings,
  type CrewMember,
  type FieldNote,
  type NexusSnapshot,
  type PublishState,
  type StarstreamLogPost,
  type Voyage,
  assignmentKeyForVoyage,
  classroomCadetTotal,
  cloneSnapshot,
  EMPTY_SNAPSHOT,
  makeId,
  requestDomainSnapshot,
  roleLabel,
  sendDomainMutation,
  userInitials,
} from "./data";
import {
  TOXICITY_BLOCKED,
  TOXICITY_RESUBMIT_MESSAGE,
  STARSTREAM_REPLY_MAX_LENGTH,
} from "@/lib/learning/starstream-constants";
type Section =
  | "Overview"
  | "Voyages"
  | "Starstream"
  | "Discoveries"
  | "Cadets"
  | "Crew"
  | "Settings";
type ComposerMode = "manual" | "imagine";
type ComposerStatus = "idle" | "saving" | "saved" | "error";
type ImagineStatus = "idle" | "curating" | "ready" | "error";
type VoyageGenerationStatus = "running" | "succeeded" | "failed";

type VoyageGeneration = {
  title: string;
  progress: number;
  status: VoyageGenerationStatus;
  entries: ProgressLogEntry[];
  request: {
    form: VoyageForm;
    flourish: FlourishConfig;
  };
  runSlug?: string;
  error?: string;
};

type AssignmentEditorData = {
  id: string;
  targetTitle: string;
  title: string;
  status: PublishState;
  lessonPlan: string;
  sources: string[];
  readOnly?: boolean;
};

type PipelineAsset = {
  type: "character" | "character_sprite" | "collectible";
  name: string;
  assetId?: string;
  imageDataUrls?: string[];
  frames?: Array<{ frameKey: string; dataUrl: string }>;
  metadata?: unknown;
  ageRange?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceUrlsFromReport(value: unknown): string[] {
  const report = asRecord(value);
  const sources = report?.sources;
  if (!Array.isArray(sources)) return [];
  return Array.from(
    new Set(
      sources.flatMap((source) => {
        if (typeof source === "string" && source.trim()) return [source.trim()];
        const record = asRecord(source);
        const url = record ? textValue(record.url) : null;
        return url ? [url] : [];
      }),
    ),
  );
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
  const data = block.match(/^data:\s*(.+)$/m)?.[1];
  if (!event || !data) return null;
  try {
    return { event, data: JSON.parse(data) as unknown };
  } catch {
    return null;
  }
}

function generationProgress(
  agent: string | undefined,
  current: number,
): number {
  const milestones: Record<string, number> = {
    curator: 0.08,
    researcher: 0.25,
    director: 0.45,
    writer: 0.65,
    artist: 0.84,
    system: 0.92,
  };
  return Math.max(current, milestones[agent ?? ""] ?? current);
}

type VoyageForm = {
  title: string;
  topic: string;
  period: string;
  scene: string;
  lessonPlan: string;
  sources: string[];
};

const navItems: { label: Section; icon: typeof Compass }[] = [
  { label: "Overview", icon: Compass },
  { label: "Voyages", icon: BookOpen },
  { label: "Starstream", icon: BookMarked },
  { label: "Cadets", icon: Activity },
  { label: "Crew", icon: Users },
  { label: "Settings", icon: Settings },
];

const studentNavItems: { label: Section; icon: typeof Compass }[] = [
  { label: "Overview", icon: Compass },
  { label: "Starstream", icon: BookMarked },
  { label: "Discoveries", icon: Sparkles },
  { label: "Crew", icon: Users },
];

/** Require an absolute http(s) URL; stored as a normalized hostname. */
const APPROVED_DOMAIN_URL_RE =
  /^https?:\/\/(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/:?#][^\s]*)?$/i;

function normalizeApprovedDomainUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!APPROVED_DOMAIN_URL_RE.test(trimmed)) return null;
  try {
    const hostname = new URL(trimmed).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
    return hostname || null;
  } catch {
    return null;
  }
}

const emptyVoyageForm: VoyageForm = {
  title: "",
  topic: "",
  period: "",
  scene: "",
  lessonPlan: "",
  sources: [],
};

function Tooltip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.55rem)] z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-cyan-100/15 bg-slate-950/95 px-2 py-1 font-space text-[9px] uppercase tracking-[0.14em] text-cyan-100/80 opacity-0 shadow-[0_0_20px_rgba(103,232,249,0.12)] transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </span>
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white/60 transition motion-reduce:transition-none hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Avatar({
  initials,
  className = "",
}: {
  initials: string;
  className?: string;
}) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full border border-[#071014] bg-cyan-200/10 font-space text-[9px] font-bold tracking-[-0.05em] text-cyan-100 ${className}`}
    >
      {initials}
    </span>
  );
}

function StatusPill({ state }: { state: PublishState }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-space text-[9px] uppercase tracking-[0.14em] ${state === "published" ? "border-cyan-200/20 bg-cyan-200/10 text-cyan-100/80" : "border-orange-200/20 bg-orange-200/10 text-orange-100/75"}`}
    >
      {state}
    </span>
  );
}

function ProgressBar({
  value,
  tone = "cyan",
  ariaLabel = "Progress",
}: {
  value: number;
  tone?: "cyan" | "ember";
  ariaLabel?: string;
}) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalized)}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${tone === "ember" ? "bg-orange-200" : "bg-cyan-200"}`}
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

function NexusShell({
  user,
  onSignOut,
  section,
  onSectionChange,
  sidebarOpen,
  setSidebarOpen,
  children,
}: {
  user: DemoUser;
  onSignOut: () => void;
  section: Section;
  onSectionChange: (section: Section) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const label = roleLabel(user.role);
  return (
    <div className="nexus-page flex min-h-dvh w-full max-w-full flex-col overflow-x-clip bg-[#071014] text-[#f4f1ea]">
      <AppNavbar theme="space" onSignOut={onSignOut} />
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <SparklingStars />
        <div
          className="pointer-events-none fixed inset-0 top-14 opacity-80"
          aria-hidden="true"
        >
          <div className="absolute -left-24 -top-32 size-[32rem] rounded-full bg-cyan-400/[0.07] blur-[110px]" />
          <div className="absolute right-[-14rem] top-[18rem] size-[34rem] rounded-full bg-orange-400/[0.045] blur-[120px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(178,232,232,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(178,232,232,0.028)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
        </div>
        <header className="sticky top-14 z-40 flex min-h-14 items-center border-b border-white/10 bg-[#071014]/90 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="grid size-10 place-items-center rounded-xl border border-white/10 text-white/70 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
            >
              <Menu size={19} />
            </button>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-cyan-200 text-[#071014]">
                <Command size={17} />
              </span>
              <span className="font-space text-[11px] font-bold uppercase tracking-[0.2em]">
                Nexus
              </span>
            </div>
          </div>
        </header>
        <aside
          className={`fixed bottom-0 left-0 top-14 z-50 flex w-[17rem] shrink-0 flex-col border-r border-white/10 bg-[#081217]/95 px-4 py-5 backdrop-blur-xl transition-transform duration-300 motion-reduce:transition-none lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex justify-end px-2 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setSidebarOpen(false)}
              className="grid size-9 place-items-center rounded-lg text-white/35 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
            >
              <X size={17} />
            </button>
          </div>
          <div className="mt-4 rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.04] p-4 lg:mt-0">
            <div className="flex items-center gap-3">
              <Avatar
                initials={userInitials(user.displayName)}
                className="size-10 border-cyan-200/20"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {label} {user.displayName}
                </p>
                <p className="mt-0.5 font-space text-[9px] uppercase tracking-[0.12em] text-cyan-100/40">
                  {label}
                </p>
              </div>
            </div>
          </div>
          <nav className="mt-8" aria-label="Nexus navigation">
            <p className="px-3 font-space text-[9px] uppercase tracking-[0.22em] text-white/25">
              Workspace
            </p>
            <div className="mt-3 space-y-1">
              {(user.role === "teacher" ? navItems : studentNavItems).map(
                ({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      onSectionChange(label);
                      setSidebarOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60 ${section === label ? "bg-cyan-200/10 text-cyan-100" : "text-white/48 hover:bg-white/[0.045] hover:text-white/85"}`}
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span>{label}</span>
                  </button>
                ),
              )}
              {user.role === "student" ? (
                <Link
                  href="/ship"
                  onClick={() => setSidebarOpen(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/48 transition motion-reduce:transition-none hover:bg-white/[0.045] hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60"
                >
                  <Ship size={17} strokeWidth={1.8} />
                  <span>Ship</span>
                </Link>
              ) : null}
            </div>
          </nav>
          <div className="mt-auto flex items-center justify-between px-2 pt-8">
            <span className="font-space text-[9px] uppercase tracking-[0.14em] text-white/25">
              Sapiens · 0.1
            </span>
            <Tooltip label="Help">
              <button
                type="button"
                aria-label="Help"
                className="text-white/30 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
              >
                <CircleHelp size={16} />
              </button>
            </Tooltip>
          </div>
        </aside>
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-x-0 bottom-0 top-14 z-40 bg-black/55 lg:hidden"
          />
        )}
        <main className="relative z-10 min-h-0 flex-1 lg:pl-[17rem]">
          <div className="mx-auto max-w-[1500px] px-4 pb-16 pt-7 sm:px-7 lg:px-10 lg:pt-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  titleId,
  action,
}: {
  eyebrow?: string;
  title: string;
  titleId?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow ? (
          <p className="font-space text-[9px] uppercase tracking-[0.22em] text-white/30">
            {eyebrow}
          </p>
        ) : null}
        <h2
          id={titleId}
          className={`font-display text-3xl tracking-[-0.04em] text-white ${eyebrow ? "mt-2" : ""}`}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "cyan",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: "cyan" | "ember";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
      <div className="flex items-center justify-between text-white/35">
        <span className="font-space text-[9px] uppercase tracking-[0.16em]">
          {label}
        </span>
        <Icon size={15} />
      </div>
      <p className="mt-5 font-display text-3xl tracking-[-0.04em] text-white">
        {value}
      </p>
      <p
        className={`mt-1 text-xs ${tone === "ember" ? "text-orange-100/65" : "text-cyan-100/55"}`}
      >
        {detail}
      </p>
    </div>
  );
}

function voyageMetaLine(voyage: Pick<Voyage, "topic" | "period">): string {
  return isConcreteHistoricalPeriod(voyage.period)
    ? `${voyage.topic} · ${voyage.period}`
    : voyage.topic;
}

function VoyageActionIcons({
  voyage,
  onReport,
}: {
  voyage: Voyage;
  onReport?: () => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <a
        href={`/sail/${encodeURIComponent(voyage.slug)}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Read ${voyage.title}`}
        className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.035] text-white/55 transition hover:border-cyan-200/25 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
      >
        <BookOpen size={14} />
      </a>
      <button
        type="button"
        aria-label={
          voyage.report
            ? `View report for ${voyage.title}`
            : `No report available for ${voyage.title}`
        }
        disabled={!voyage.report || !onReport}
        onClick={() => onReport?.()}
        className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.035] text-white/55 transition hover:border-cyan-200/25 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
      >
        <FileText size={14} />
      </button>
    </div>
  );
}

function VoyageCard({
  assignment,
  voyage,
  onEdit,
  onReport,
  cadetTotal = 0,
}: {
  assignment?: Assignment;
  voyage: Voyage;
  onEdit?: () => void;
  onReport?: () => void;
  cadetTotal?: number;
}) {
  const title = assignment?.title || voyage.title;
  const status = assignment?.status ?? voyage.status;
  const lessonPlan = assignment?.lessonPlan || voyage.lessonPlan;
  const sources = assignment?.sources?.length
    ? assignment.sources
    : voyage.sources;
  const cadetsCompleted = voyage.cadetsCompleted ?? 0;
  const cadetDenominator = Math.max(cadetTotal, 0);
  const cadetProgressPercent =
    cadetDenominator > 0
      ? Math.min(100, (cadetsCompleted / cadetDenominator) * 100)
      : 0;
  const editable = Boolean(onEdit);
  return (
    <article
      className={`group relative rounded-2xl border border-white/10 bg-[#0d151a]/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)] transition motion-reduce:transition-none ${editable ? "hover:-translate-y-0.5 hover:border-cyan-200/25" : "hover:-translate-y-0.5 hover:border-white/20"}`}
    >
      {editable ? (
        <button
          type="button"
          aria-label={`Edit assignment ${title}`}
          onClick={onEdit}
          className="absolute inset-0 z-[1] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
        />
      ) : null}
      <div
        className={editable ? "relative z-[2] pointer-events-none" : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-space text-[9px] uppercase tracking-[0.16em] text-cyan-200/55">
              {voyageMetaLine(voyage)}
            </p>
            <h3 className="mt-3 font-display text-[1.55rem] leading-[1.08] tracking-[-0.035em] text-white">
              {title}
            </h3>
          </div>
          <div
            className={`flex shrink-0 items-center gap-2 ${editable ? "pointer-events-auto" : ""}`}
            onClick={editable ? undefined : (event) => event.stopPropagation()}
            onKeyDown={
              editable ? undefined : (event) => event.stopPropagation()
            }
          >
            <StatusPill state={status} />
            <VoyageActionIcons voyage={voyage} onReport={onReport} />
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-white/45">{voyage.scene}</p>
        <div className="mt-5 border-t border-white/10 pt-4">
          {status === "published" ? (
            <>
              <div className="flex items-center justify-between font-space text-[9px] uppercase tracking-[0.14em] text-white/30">
                <span>Cadet Progress</span>
                <span className="text-cyan-100/70">
                  {cadetsCompleted}/{cadetDenominator}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={cadetProgressPercent}
                  ariaLabel="Cadet progress"
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between font-space text-[9px] uppercase tracking-[0.14em] text-white/30">
              <span>Planning</span>
              <span className="text-orange-100/70">Not ready</span>
            </div>
          )}
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="font-space text-[9px] uppercase tracking-[0.14em] text-white/28">
            Lesson plan
          </p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/60">
            {lessonPlan}
          </p>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="font-space text-[9px] uppercase tracking-[0.12em] text-white/30">
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </article>
  );
}

function VoyageGenerationAssignmentCard({
  generation,
  onTerminate,
  onRegenerate,
}: {
  generation: VoyageGeneration;
  onTerminate: () => void;
  onRegenerate: () => void;
}) {
  const failed = generation.status === "failed";
  return (
    <article
      className={`rounded-2xl border p-5 ${failed ? "border-rose-200/25 bg-rose-300/[0.07]" : "border-cyan-200/15 bg-[#0d151a]/90"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-space text-[9px] uppercase tracking-[0.16em] text-orange-100/65">
            {failed ? "Assignment needs attention" : "Planning assignment"}
          </p>
          <h3 className="mt-3 font-display text-[1.55rem] leading-[1.08] tracking-[-0.035em] text-white">
            {generation.title}
          </h3>
        </div>
        {generation.status === "running" ? (
          <LoaderCircle
            size={18}
            className="animate-spin text-cyan-100"
            aria-label="Creating"
          />
        ) : null}
      </div>
      <div className="mt-5 flex items-center justify-between font-space text-[9px] uppercase tracking-[0.14em] text-white/30">
        <span>{failed ? "Creation stopped" : "Creating voyage"}</span>
        <span className={failed ? "text-rose-100/80" : "text-cyan-100/70"}>
          {Math.round(generation.progress * 100)}%
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={generation.progress * 100} />
      </div>
      <div className="mt-4 flex gap-2">
        {generation.status === "running" ? (
          <button
            type="button"
            onClick={onTerminate}
            className="min-h-9 rounded-lg border border-rose-200/25 px-3 text-xs text-rose-100/75 transition hover:border-rose-100/45 hover:text-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-100/70"
          >
            Terminate
          </button>
        ) : (
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-cyan-200 px-3 text-xs font-semibold text-[#071014] transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80"
          >
            Regenerate <Sparkles size={13} />
          </button>
        )}
      </div>
      {generation.error ? (
        <p className="mt-3 text-xs leading-5 text-rose-100/75">
          {generation.error}
        </p>
      ) : null}
    </article>
  );
}

function VoyageReportDialog({
  voyage,
  onClose,
}: {
  voyage: Voyage;
  onClose: () => void;
}) {
  if (!voyage.report) return null;
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[#020608]/80 px-4 py-6 backdrop-blur-md"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="scrollbar-no-track max-h-[85vh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-3xl border border-cyan-100/15 bg-[#0c171c] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.6)] sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voyage-report-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-space text-[9px] uppercase tracking-[0.25em] text-cyan-200/55">
              Voyage report
            </p>
            <h2
              id="voyage-report-title"
              className="mt-2 font-display text-3xl text-white"
            >
              {voyage.title}
            </h2>
          </div>
          <IconButton label="Close voyage report" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </div>
        <ReportMarkdown className="mt-6" sources={voyage.report.sources}>
          {voyage.report.reportText}
        </ReportMarkdown>
        <h3 className="mt-6 font-space text-[9px] uppercase tracking-[0.18em] text-white/35">
          Sources
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-cyan-100/70">
          {voyage.report.sources.map((source) => (
            <li key={source}>
              <a
                href={source}
                target="_blank"
                rel="noreferrer"
                className="break-all underline decoration-cyan-100/25 underline-offset-2 hover:text-cyan-50"
              >
                {source}
              </a>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function AssignmentEditorDialog({
  assignment,
  onClose,
  onSave,
  onDelete,
}: {
  assignment: AssignmentEditorData;
  onClose: () => void;
  onSave: (
    values: Pick<AssignmentEditorData, "title" | "lessonPlan" | "sources">,
  ) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const readOnly = Boolean(assignment.readOnly);
  const [title, setTitle] = useState(assignment.title);
  const [lessonPlan, setLessonPlan] = useState(assignment.lessonPlan);
  const [sources, setSources] = useState(assignment.sources.join("\n"));
  const [state, setState] = useState<"idle" | "saving" | "deleting" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const submit = async () => {
    if (readOnly || !title.trim()) return;
    setState("saving");
    setError("");
    try {
      await onSave({
        title: title.trim(),
        lessonPlan: lessonPlan.trim(),
        sources: sources
          .split("\n")
          .map((source) => source.trim())
          .filter(Boolean),
      });
    } catch (cause) {
      setState("error");
      setError(
        cause instanceof Error ? cause.message : "Could not save assignment.",
      );
    }
  };
  const remove = async () => {
    if (readOnly) return;
    if (!window.confirm(`Delete the assignment “${assignment.title}”?`)) return;
    setState("deleting");
    setError("");
    try {
      await onDelete();
    } catch (cause) {
      setState("error");
      setError(
        cause instanceof Error ? cause.message : "Could not delete assignment.",
      );
    }
  };
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[#020608]/80 px-4 py-6 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="w-full max-w-xl rounded-3xl border border-cyan-100/15 bg-[#0c171c] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.6)] sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-editor-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-space text-[9px] uppercase tracking-[0.25em] text-cyan-200/55">
              {readOnly ? "Assignment brief" : "Assignment editor"}
            </p>
            <h2
              id="assignment-editor-title"
              className="mt-2 font-display text-3xl tracking-[-0.03em] text-white"
            >
              {readOnly ? "Assignment" : "Edit assignment"}
            </h2>
            <p className="mt-2 text-sm text-white/40">
              Voyage · {assignment.targetTitle} ·{" "}
              {assignment.status === "published" ? "Ready" : "Planning"}
            </p>
          </div>
          <IconButton
            label={readOnly ? "Close assignment" : "Close assignment editor"}
            onClick={onClose}
          >
            <X size={17} />
          </IconButton>
        </div>
        <div className="mt-7 space-y-4">
          <Field label="Assignment title">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={`${inputClass}${readOnly ? " cursor-default opacity-90" : ""}`}
              autoFocus={!readOnly}
              readOnly={readOnly}
            />
          </Field>
          <Field label="Lesson plan">
            <textarea
              value={lessonPlan}
              onChange={(event) => setLessonPlan(event.target.value)}
              rows={4}
              className={`${textareaClass}${readOnly ? " cursor-default opacity-90" : ""}`}
              readOnly={readOnly}
            />
          </Field>
          <Field label="Sources" hint="One source or search direction per line">
            <textarea
              value={sources}
              onChange={(event) => setSources(event.target.value)}
              rows={3}
              className={`${textareaClass}${readOnly ? " cursor-default opacity-90" : ""}`}
              readOnly={readOnly}
            />
          </Field>
        </div>
        {error ? (
          <p role="alert" className="mt-4 text-xs leading-5 text-rose-100/80">
            {error}
          </p>
        ) : null}
        {readOnly ? (
          <div className="mt-7 flex justify-end border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-xl border border-white/15 px-3 text-xs text-white/65 transition hover:border-white/25 hover:text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={state !== "idle"}
              className="min-h-10 text-left text-xs text-rose-100/65 transition hover:text-rose-50 disabled:opacity-30"
            >
              Delete assignment
            </button>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={state !== "idle"}
                className="min-h-10 rounded-xl border border-white/15 px-3 text-xs text-white/65 disabled:opacity-30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!title.trim() || state !== "idle"}
                className="min-h-10 rounded-xl bg-cyan-200 px-3 text-xs font-semibold text-[#071014] disabled:opacity-30"
              >
                {state === "saving"
                  ? "Saving…"
                  : state === "deleting"
                    ? "Deleting…"
                    : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function TeacherView({
  snapshot,
  section,
  onCreate,
  onClassroomUpdate,
  onOpenAssignment,
  onOpenReport,
  onTerminateGeneration,
  onRegenerateGeneration,
  generation,
  onToggleLike,
  onReply,
  focusPostId,
}: {
  snapshot: NexusSnapshot;
  section: Section;
  onCreate: () => void;
  onClassroomUpdate: (classroom: ClassroomSettings) => void;
  onOpenAssignment: (assignmentId: string) => void;
  onOpenReport: (voyageId: string) => void;
  onTerminateGeneration: () => void;
  onRegenerateGeneration: () => void;
  generation: VoyageGeneration | null;
  onToggleLike: (logId: string) => Promise<boolean>;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  focusPostId?: string | null;
}) {
  const remoteApprovedDomains = snapshot.classroom?.approvedDomains ?? [];
  const remoteDomainsKey = remoteApprovedDomains.join("\0");
  const [approvedDomains, setApprovedDomains] = useState<string[]>(
    remoteApprovedDomains,
  );
  const [syncedDomainsKey, setSyncedDomainsKey] = useState(remoteDomainsKey);
  if (syncedDomainsKey !== remoteDomainsKey) {
    setSyncedDomainsKey(remoteDomainsKey);
    setApprovedDomains(remoteApprovedDomains);
  }
  const [domainDraft, setDomainDraft] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [sourceSaveState, setSourceSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const saveApprovedDomains = async (domains: string[]) => {
    if (!snapshot.classroom) return false;
    setSourceSaveState("saving");
    try {
      const response = await fetch(`/api/classrooms/${snapshot.classroom.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceMode: domains.length ? "restricted" : "free",
          approvedDomains: domains,
        }),
      });
      const payload = (await response.json()) as {
        classroom?: ClassroomSettings;
      };
      if (!response.ok || !payload.classroom)
        throw new Error("Could not save approved domains");
      const nextDomains = Array.isArray(payload.classroom.approvedDomains)
        ? payload.classroom.approvedDomains
        : domains;
      onClassroomUpdate({
        ...payload.classroom,
        cadetCount:
          typeof payload.classroom.cadetCount === "number"
            ? payload.classroom.cadetCount
            : (snapshot.classroom?.cadetCount ?? 0),
        approvedDomains: nextDomains,
        sourceMode: nextDomains.length ? "restricted" : "free",
      });
      setApprovedDomains(nextDomains);
      setSourceSaveState("saved");
      return true;
    } catch {
      setSourceSaveState("error");
      return false;
    }
  };

  const addApprovedDomain = async () => {
    const hostname = normalizeApprovedDomainUrl(domainDraft);
    if (!hostname) {
      setDomainError("Enter a valid URL (https://example.com).");
      return;
    }
    if (approvedDomains.includes(hostname)) {
      setDomainError("That domain is already approved.");
      return;
    }
    setDomainError(null);
    const next = [...approvedDomains, hostname];
    const saved = await saveApprovedDomains(next);
    if (saved) setDomainDraft("");
  };

  const removeApprovedDomain = async (domain: string) => {
    setDomainError(null);
    await saveApprovedDomains(
      approvedDomains.filter((item) => item !== domain),
    );
  };
  const published = snapshot.voyages.filter(
    (voyage) => voyage.status === "published",
  );
  const notes = snapshot.starstreamLogs;
  const classroomNotes = notes.filter(
    (note) =>
      snapshot.voyages.find((voyage) => voyage.id === note.voyageId)?.stream !==
      "solo",
  );
  const starstreamActivity = classroomNotes.slice(0, 5);
  const pendingGeneration =
    generation &&
    (generation.status === "running" || generation.status === "failed") &&
    !snapshot.voyages.some(
      (voyage) => voyage.title.trim() === generation.title.trim(),
    )
      ? generation
      : null;
  const heading = section === "Overview" ? "Good morning, Captain." : section;
  const showComposerActions =
    section === "Overview" || section === "Voyages" || section === "Starstream";
  const sectionBlurb =
    section === "Cadets"
      ? "See how each cadet is progressing through assignments and what they last shared to Starstream."
      : section === "Crew"
        ? "Everyone aboard this classroom ship."
        : section === "Settings" || section === "Starstream"
          ? null
          : "Build the route, set the question, and send your cadets into the evidence.";
  return (
    <>
      <div className="mt-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="font-space text-[10px] uppercase tracking-[0.25em] text-cyan-200/55">
            Teacher workspace
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.5rem,5vw,4.8rem)] leading-[0.97] tracking-[-0.055em] text-white">
            {heading}
          </h1>
          {sectionBlurb ? (
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/45 sm:text-base">
              {sectionBlurb}
            </p>
          ) : null}
        </div>
        {showComposerActions ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-200 px-4 text-sm font-semibold text-[#071014] transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80"
            >
              <Sparkles size={16} /> Imagine
            </button>
          </div>
        ) : null}
      </div>
      {section === "Settings" && snapshot.classroom ? (
        <section
          className="mt-10 max-w-xl"
          aria-labelledby="approved-domains-heading"
        >
          <h2
            id="approved-domains-heading"
            className="font-display text-2xl tracking-[-0.035em] text-white"
          >
            Approved Domains
          </h2>
          <ul className="mt-5 space-y-2">
            {approvedDomains.map((domain) => (
              <li
                key={domain}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white/75">
                  {domain}
                </span>
                <Tooltip label="Remove domain">
                  <button
                    type="button"
                    aria-label={`Remove ${domain}`}
                    onClick={() => void removeApprovedDomain(domain)}
                    disabled={sourceSaveState === "saving"}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                  >
                    <X size={15} />
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-1 focus-within:border-cyan-200/45 focus-within:ring-2 focus-within:ring-cyan-200/10">
            <label className="sr-only" htmlFor="approved-domain-input">
              Add approved domain URL
            </label>
            <input
              id="approved-domain-input"
              type="url"
              value={domainDraft}
              onChange={(event) => {
                setDomainDraft(event.target.value);
                setDomainError(null);
                setSourceSaveState("idle");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addApprovedDomain();
                }
              }}
              placeholder="https://en.wikipedia.org"
              className="min-h-8 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
            />
            <Tooltip label="Add domain">
              <button
                type="button"
                aria-label="Add domain"
                onClick={() => void addApprovedDomain()}
                disabled={sourceSaveState === "saving" || !domainDraft.trim()}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-cyan-100/70 transition hover:bg-cyan-200/10 hover:text-cyan-50 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
              >
                <Plus size={16} />
              </button>
            </Tooltip>
          </div>
          {domainError || sourceSaveState === "error" ? (
            <p className="mt-2 text-xs text-rose-200/80" role="alert">
              {domainError ?? "Could not save. Try again."}
            </p>
          ) : null}
        </section>
      ) : null}
      {section === "Overview" && (
        <>
          <section
            className="mt-10 grid grid-cols-2 gap-3 xl:grid-cols-4"
            aria-label="Captain workspace overview"
          >
            <StatCard
              label="Published voyages"
              value={String(published.length).padStart(2, "0")}
              detail="Ready for cadets"
              icon={BookOpen}
            />
            <StatCard
              label="Drafts on deck"
              value={String(
                snapshot.voyages.length - published.length,
              ).padStart(2, "0")}
              detail="Still yours to shape"
              icon={FileText}
              tone="ember"
            />
            <StatCard
              label="Cadets in orbit"
              value={String(classroomCadetTotal(snapshot)).padStart(2, "0")}
              detail={snapshot.classroom?.name ?? "Demo class"}
              icon={Users}
            />
            <StatCard
              label="Starstream"
              value={String(notes.length).padStart(2, "0")}
              detail="Published to Starstream"
              icon={BookMarked}
              tone="ember"
            />
          </section>
          <div className="mt-12 grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
            <section aria-labelledby="what-is-moving-heading">
              <SectionHeading
                title="What is moving?"
                titleId="what-is-moving-heading"
              />
              {snapshot.voyages.length || pendingGeneration ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {pendingGeneration ? (
                    <VoyageGenerationAssignmentCard
                      generation={pendingGeneration}
                      onTerminate={onTerminateGeneration}
                      onRegenerate={onRegenerateGeneration}
                    />
                  ) : null}
                  {snapshot.voyages.map((voyage) => {
                    const assignmentId = assignmentKeyForVoyage(
                      snapshot,
                      voyage.id,
                    );
                    return (
                      <VoyageCard
                        key={voyage.id}
                        voyage={voyage}
                        cadetTotal={classroomCadetTotal(snapshot)}
                        onEdit={
                          assignmentId
                            ? () => onOpenAssignment(assignmentId)
                            : undefined
                        }
                        onReport={() => onOpenReport(voyage.id)}
                      />
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="Your deck is clear"
                  body="Start with a specific voyage prompt for your cadets."
                  action="Imagine a voyage"
                  onAction={onCreate}
                />
              )}
            </section>
            <section aria-labelledby="whats-up-heading">
              <SectionHeading title="What's up?" titleId="whats-up-heading" />
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                {starstreamActivity.length ? (
                  <ul className="space-y-4">
                    {starstreamActivity.map((note) => {
                      const voyageTitle =
                        snapshot.voyages.find(
                          (voyage) => voyage.id === note.voyageId,
                        )?.title ?? "Unknown voyage";
                      return (
                        <li
                          key={note.id}
                          className="font-space text-[10px] uppercase leading-5 tracking-[0.08em] text-white/65"
                        >
                          Cadet{" "}
                          <span className="text-white">{note.authorName}</span>{" "}
                          has added a field note to{" "}
                          <span className="text-white">{voyageTitle}</span>.
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="font-space text-[10px] uppercase leading-5 tracking-[0.08em] text-white/45">
                    Starstream is quiet. No cadets have reported back yet.
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
      {section === "Voyages" && (
        <section className="mt-10" aria-labelledby="voyages-heading">
          <SectionHeading
            eyebrow="Your constellation"
            title="Voyages"
            action={
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs text-cyan-100 transition hover:bg-cyan-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
              >
                <Sparkles size={14} /> Imagine
              </button>
            }
          />
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pendingGeneration ? (
              <VoyageGenerationAssignmentCard
                generation={pendingGeneration}
                onTerminate={onTerminateGeneration}
                onRegenerate={onRegenerateGeneration}
              />
            ) : null}
            {snapshot.voyages.map((voyage) => {
              const assignmentId = assignmentKeyForVoyage(snapshot, voyage.id);
              return (
                <VoyageCard
                  key={voyage.id}
                  voyage={voyage}
                  cadetTotal={classroomCadetTotal(snapshot)}
                  onEdit={
                    assignmentId
                      ? () => onOpenAssignment(assignmentId)
                      : undefined
                  }
                  onReport={() => onOpenReport(voyage.id)}
                />
              );
            })}
          </div>
        </section>
      )}
      {section === "Starstream" && (
        <section
          className="mt-10 max-w-3xl"
          aria-labelledby="teacher-notes-heading"
        >
          <h2 id="teacher-notes-heading" className="sr-only">
            Starstream
          </h2>
          <StarstreamFeed
            posts={notes}
            voyages={snapshot.voyages}
            onToggleLike={onToggleLike}
            onReply={onReply}
            focusPostId={focusPostId}
            emptyTitle="Starstream is quiet"
            emptyBody="Published notes from your fleet will appear here, attached to their voyage."
          />
        </section>
      )}
      {section === "Cadets" && (
        <section className="mt-10 max-w-2xl" aria-labelledby="cadets-heading">
          <h2 id="cadets-heading" className="sr-only">
            Cadets
          </h2>
          {snapshot.cadets.length ? (
            <ul className="divide-y divide-white/[0.08]">
              {snapshot.cadets.map((cadet) => (
                <li key={cadet.id}>
                  <CadetProgressCard cadet={cadet} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No cadets yet"
              body="When cadets join this classroom, their assignment progress will appear here."
            />
          )}
        </section>
      )}
      {section === "Crew" && <CrewSection members={snapshot.crew} />}
    </>
  );
}

function CadetProgressCard({ cadet }: { cadet: CadetProgress }) {
  const initials = userInitials(cadet.displayName);
  const assignmentLabel =
    cadet.assignmentsTotal === 0
      ? "No assignments yet"
      : `${cadet.assignmentsComplete}/${cadet.assignmentsTotal} complete`;
  return (
    <article className="flex gap-4 py-5">
      <Avatar
        initials={initials}
        className="size-10 bg-orange-200/90 text-[#071014]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="font-display text-xl tracking-[-0.03em] text-white">
            {cadet.displayName}
          </h3>
          <p className="font-space text-[9px] uppercase tracking-[0.14em] text-white/35">
            {assignmentLabel}
          </p>
        </div>
        {cadet.assignmentsTotal > 0 ? (
          <div className="mt-3">
            <ProgressBar
              value={cadet.progress}
              ariaLabel={`${cadet.displayName} assignment progress`}
            />
          </div>
        ) : null}
        {cadet.lastPost ? (
          <div className="mt-4">
            <p className="font-space text-[9px] uppercase tracking-[0.14em] text-cyan-200/45">
              Last on Starstream
              {cadet.lastPost.voyageTitle
                ? ` · ${cadet.lastPost.voyageTitle}`
                : ""}
              <span className="text-white/25">
                {" "}
                · {formatRelativeTime(cadet.lastPost.createdAt)}
              </span>
            </p>
            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-white/50">
              {cadet.lastPost.body}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/30">No Starstream posts yet.</p>
        )}
      </div>
    </article>
  );
}

function CrewSection({ members }: { members: CrewMember[] }) {
  return (
    <section className="mt-10 max-w-xl" aria-labelledby="crew-heading">
      <h2 id="crew-heading" className="sr-only">
        Crew
      </h2>
      {members.length ? (
        <ul className="divide-y divide-white/[0.08]">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 py-4">
              <Avatar
                initials={userInitials(member.displayName)}
                className={
                  member.role === "teacher"
                    ? "size-9 bg-cyan-200 text-[#071014]"
                    : "size-9 bg-orange-200/85 text-[#071014]"
                }
              />
              <div className="min-w-0">
                <p className="truncate text-sm text-white">
                  {member.displayName}
                </p>
                <p className="mt-0.5 font-space text-[9px] uppercase tracking-[0.14em] text-white/30">
                  {roleLabel(member.role)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Crew is empty"
          body="Join or create a classroom to see who is sailing with you."
        />
      )}
    </section>
  );
}

function DiscoveriesSection({
  snapshot,
  username,
}: {
  snapshot: NexusSnapshot;
  username: string;
}) {
  const notesByVoyage = new Map<string, FieldNote[]>();
  for (const note of snapshot.fieldNotes) {
    if (note.authorId !== username) continue;
    const list = notesByVoyage.get(note.voyageId) ?? [];
    list.push(note);
    notesByVoyage.set(note.voyageId, list);
  }
  for (const notes of notesByVoyage.values()) {
    notes.sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || 0,
    );
  }
  const discoveries = snapshot.voyages
    .filter((voyage) => voyage.completed || notesByVoyage.has(voyage.id))
    .sort((a, b) => {
      const aTime = a.completedAt
        ? Date.parse(a.completedAt)
        : Math.max(
            0,
            ...(notesByVoyage.get(a.id) ?? []).map((note) =>
              Date.parse(note.createdAt),
            ),
          );
      const bTime = b.completedAt
        ? Date.parse(b.completedAt)
        : Math.max(
            0,
            ...(notesByVoyage.get(b.id) ?? []).map((note) =>
              Date.parse(note.createdAt),
            ),
          );
      return bTime - aTime;
    });

  return (
    <section
      className="mt-10 max-w-3xl"
      aria-labelledby="student-discoveries-heading"
    >
      <h2 id="student-discoveries-heading" className="sr-only">
        Discoveries
      </h2>
      {discoveries.length ? (
        <ul className="divide-y divide-white/[0.08]">
          {discoveries.map((voyage) => {
            const notes = notesByVoyage.get(voyage.id) ?? [];
            return (
              <li key={voyage.id} className="py-8 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-display text-2xl tracking-[-0.035em] text-white">
                    {voyage.title}
                  </h3>
                  {voyage.completedAt ? (
                    <p className="font-space text-[9px] uppercase tracking-[0.14em] text-white/30">
                      {formatRelativeTime(voyage.completedAt)}
                    </p>
                  ) : null}
                </div>
                {voyage.collectible ? (
                  <div className="mt-5 flex items-start gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL from nexus snapshot */}
                    <img
                      src={voyage.collectible.assetUrl}
                      alt={voyage.collectible.name}
                      width={48}
                      height={48}
                      className="size-12 shrink-0 object-contain [image-rendering:pixelated]"
                    />
                    <div className="min-w-0">
                      <p className="font-space text-[9px] uppercase tracking-[0.16em] text-cyan-200/55">
                        Collectible
                      </p>
                      <p className="mt-1 text-sm text-white/85">
                        {voyage.collectible.name}
                      </p>
                      {voyage.collectible.description ? (
                        <p className="mt-1 text-sm leading-6 text-white/40">
                          {voyage.collectible.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {notes.length ? (
                  <div className={voyage.collectible ? "mt-6" : "mt-5"}>
                    <p className="font-space text-[9px] uppercase tracking-[0.16em] text-orange-100/55">
                      Field notes
                    </p>
                    <ul className="mt-3 space-y-4">
                      {notes.map((note) => (
                        <li key={note.id}>
                          <p className="text-sm leading-6 text-white/70 whitespace-pre-wrap">
                            {note.body || "Empty note."}
                          </p>
                          <p className="mt-1.5 font-space text-[9px] uppercase tracking-[0.12em] text-white/25">
                            {note.authorType === "bot"
                              ? note.authorName
                              : note.status === "published"
                                ? "Published"
                                : "Draft"}
                            {" · "}
                            {formatRelativeTime(note.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p
                    className={`text-sm text-white/30 ${voyage.collectible ? "mt-5" : "mt-4"}`}
                  >
                    No field notes from this voyage yet.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No discoveries yet"
          body="Complete a voyage to collect its find and keep your field notes here."
        />
      )}
    </section>
  );
}

function StarstreamFeed({
  posts,
  voyages,
  onToggleLike,
  onReply,
  focusPostId,
  emptyTitle = "Starstream is quiet",
  emptyBody = "Published notes will appear here, attached to their voyage.",
}: {
  posts: StarstreamLogPost[];
  voyages: Voyage[];
  onToggleLike: (logId: string) => Promise<boolean>;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  focusPostId?: string | null;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [filterId, setFilterId] = useState<string>("class");
  const voyageById = new Map(voyages.map((voyage) => [voyage.id, voyage]));
  /** Solo stream voyages, or any post with no classroom assignment (e.g. home visitor notes). */
  const isSoloPost = (post: StarstreamLogPost) =>
    !post.assignmentId || voyageById.get(post.voyageId)?.stream === "solo";
  const focusedPost = focusPostId
    ? posts.find((post) => post.id === focusPostId)
    : undefined;
  const focusedFilterId = focusedPost
    ? isSoloPost(focusedPost)
      ? "solo"
      : "class"
    : null;
  const [syncedFocusKey, setSyncedFocusKey] = useState<string | null>(null);
  const focusKey = focusedPost
    ? `${focusedPost.id}:${focusedPost.voyageId}:${focusedPost.assignmentId ?? ""}`
    : null;
  if (focusKey && syncedFocusKey !== focusKey && focusedFilterId) {
    setSyncedFocusKey(focusKey);
    setFilterId(focusedFilterId);
  }

  const classroomVoyageOptions = (() => {
    const seen = new Set<string>();
    const options: Voyage[] = [];
    for (const post of posts) {
      if (seen.has(post.voyageId) || isSoloPost(post)) continue;
      seen.add(post.voyageId);
      const voyage = voyageById.get(post.voyageId);
      if (voyage) options.push(voyage);
    }
    return options.sort((a, b) => a.title.localeCompare(b.title));
  })();
  const hasSoloPosts = posts.some(isSoloPost);
  const classPosts = posts.filter((post) => !isSoloPost(post));
  const showFilters = posts.length > 0;
  const activeFilter =
    filterId === "class" ||
    filterId === "solo" ||
    classroomVoyageOptions.some((voyage) => voyage.id === filterId)
      ? filterId
      : "class";
  const filtered =
    activeFilter === "class"
      ? classPosts
      : activeFilter === "solo"
        ? posts.filter(isSoloPost)
        : posts.filter(
            (post) => !isSoloPost(post) && post.voyageId === activeFilter,
          );
  const pillClass = (selected: boolean) =>
    `min-h-9 rounded-full border px-3.5 font-space text-[10px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 ${
      selected
        ? "border-cyan-200/35 bg-cyan-200/15 text-cyan-50"
        : "border-white/12 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/70"
    }`;

  return (
    <div>
      {showFilters ? (
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Filter Starstream by voyage"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "class"}
            onClick={() => setFilterId("class")}
            className={pillClass(activeFilter === "class")}
          >
            Class
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "solo"}
            onClick={() => setFilterId("solo")}
            className={pillClass(activeFilter === "solo")}
          >
            Solo
          </button>
          {classroomVoyageOptions.map((voyage) => {
            const selected = activeFilter === voyage.id;
            return (
              <button
                key={voyage.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilterId(voyage.id)}
                className={`${pillClass(selected)} max-w-[14rem] truncate tracking-[0.12em]`}
                title={voyage.title}
              >
                {voyage.title}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className={showFilters ? "mt-5 space-y-3" : "space-y-3"}>
        {filtered.length ? (
          filtered.map((post) => (
            <StarstreamPostCard
              key={post.id}
              post={post}
              voyage={voyageById.get(post.voyageId)}
              onToggleLike={onToggleLike}
              onReply={onReply}
              highlighted={focusPostId === post.id}
            />
          ))
        ) : (
          <EmptyState
            title={
              activeFilter === "solo" && !hasSoloPosts
                ? "No solo posts yet"
                : activeFilter === "class" && !classPosts.length
                  ? "No class posts yet"
                  : emptyTitle
            }
            body={
              activeFilter === "solo" && !hasSoloPosts
                ? "Solo voyage notes and home visitor shares show up here."
                : activeFilter === "class" && !classPosts.length
                  ? "Published classroom voyage notes will appear here."
                  : emptyBody
            }
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
      <Compass size={24} className="mx-auto text-white/25" />
      <p className="mt-4 font-display text-xl text-white/75">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/35">
        {body}
      </p>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-3 text-xs text-cyan-100 transition hover:bg-cyan-200/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
        >
          {action} <ArrowUpRight size={13} />
        </button>
      )}
    </div>
  );
}

function StarstreamPostCard({
  post,
  voyage,
  onToggleLike,
  onReply,
  nested = false,
  highlighted = false,
}: {
  post: StarstreamLogPost;
  voyage?: Voyage;
  onToggleLike: (logId: string) => Promise<boolean>;
  onReply?: (parentId: string, body: string) => Promise<boolean>;
  nested?: boolean;
  highlighted?: boolean;
}) {
  const [likeState, setLikeState] = useState<"idle" | "saving">("idle");
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyState, setReplyState] = useState<"idle" | "saving">("idle");
  const articleRef = useRef<HTMLElement>(null);
  const replyButtonRef = useRef<HTMLButtonElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyCountAtSubmitRef = useRef(0);
  const pendingFocusNewestRef = useRef(false);
  const initials = userInitials(post.authorName);
  const replyCount = post.replies.length;
  const replyLabel = `${replyCount} repl${replyCount === 1 ? "y" : "ies"}`;
  const canReply = !nested && post.allowReplies && Boolean(onReply);
  const threadOpen = repliesOpen || composeOpen;
  const showThread = threadOpen && (replyCount > 0 || composeOpen);

  useEffect(() => {
    if (!highlighted || !articleRef.current) return;
    const node = articleRef.current;
    const timer = window.setTimeout(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  useEffect(() => {
    if (!composeOpen) return;
    const timer = window.setTimeout(
      () => replyTextareaRef.current?.focus(),
      40,
    );
    return () => window.clearTimeout(timer);
  }, [composeOpen]);

  useEffect(() => {
    if (!pendingFocusNewestRef.current) return;
    if (replyCount <= replyCountAtSubmitRef.current) return;
    const newest = post.replies[post.replies.length - 1];
    pendingFocusNewestRef.current = false;
    if (!newest) return;
    const node = document.getElementById(`starstream-post-${newest.id}`);
    if (!node) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    node.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
    if (node instanceof HTMLElement) node.focus({ preventScroll: true });
  }, [replyCount, post.replies]);

  const toggleLike = async () => {
    if (likeState === "saving") return;
    setLikeState("saving");
    await onToggleLike(post.id);
    setLikeState("idle");
  };

  const closeCompose = (returnFocus = true) => {
    if (replyState === "saving") return;
    setComposeOpen(false);
    setReplyBody("");
    setReplyError(null);
    setReplyState("idle");
    if (replyCount === 0) setRepliesOpen(false);
    if (returnFocus) {
      window.setTimeout(() => replyButtonRef.current?.focus(), 40);
    }
  };

  const openCompose = () => {
    setComposeOpen(true);
    setRepliesOpen(true);
    setReplyError(null);
  };

  const toggleCompose = () => {
    if (replyState === "saving") return;
    if (composeOpen) {
      closeCompose();
      return;
    }
    openCompose();
  };

  const toggleReplies = () => {
    if (replyState === "saving") return;
    setRepliesOpen((open) => !open);
  };

  const submitReply = async () => {
    if (!onReply || replyState === "saving") return;
    const body = replyBody.trim();
    if (!body) return;
    if (body.length > STARSTREAM_REPLY_MAX_LENGTH) {
      setReplyError("Reply is too long.");
      return;
    }
    setReplyState("saving");
    setReplyError(null);
    try {
      replyCountAtSubmitRef.current = replyCount;
      pendingFocusNewestRef.current = true;
      const ok = await onReply(post.id, body);
      if (!ok) {
        pendingFocusNewestRef.current = false;
        setReplyError("Couldn’t post reply. Try again.");
        setReplyState("idle");
        return;
      }
      setReplyBody("");
      setComposeOpen(false);
      setRepliesOpen(true);
      setReplyState("idle");
    } catch (error) {
      pendingFocusNewestRef.current = false;
      if (error instanceof Error && error.message === TOXICITY_BLOCKED) {
        setReplyError(TOXICITY_RESUBMIT_MESSAGE);
      } else if (
        error instanceof Error &&
        error.message === "replies_disabled"
      ) {
        toast.error("Replies are turned off for this post.");
        setReplyState("idle");
        setComposeOpen(false);
        setReplyBody("");
        setReplyError(null);
        if (replyCount === 0) setRepliesOpen(false);
        window.setTimeout(() => replyButtonRef.current?.focus(), 40);
        return;
      } else {
        setReplyError("Couldn’t post reply. Try again.");
      }
      setReplyState("idle");
    }
  };
  return (
    <article
      ref={articleRef}
      id={`starstream-post-${post.id}`}
      tabIndex={-1}
      className={
        nested
          ? "rounded-xl border border-white/10 bg-black/20 p-4 outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
          : highlighted
            ? "rounded-2xl border border-cyan-200/40 bg-cyan-200/[0.08] p-5 shadow-[0_0_0_1px_rgba(165,243,252,0.12)] outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
            : "rounded-2xl border border-white/10 bg-white/[0.035] p-5 outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid shrink-0 place-items-center rounded-full border border-white/15 bg-black font-space text-[9px] font-bold tracking-[-0.05em] text-white ${
            nested ? "size-7" : "size-8"
          }`}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white/80">
              <span className="text-white">{post.authorName}</span>
              {!nested && post.type !== "visitorNote" ? (
                <> · {voyage?.title ?? "Unknown voyage"}</>
              ) : null}
            </p>
            <time
              className="font-space text-[9px] tracking-[0.08em] text-white/25"
              dateTime={post.createdAt}
              title={post.createdAt}
            >
              {formatRelativeTime(post.createdAt)}
            </time>
          </div>
          {post.type === "visitorNote" && post.visitorNote ? (
            <div className="mt-3 space-y-3">
              <p className="text-base font-bold leading-6 text-white/85">
                {VISITOR_NOTE_HEADER}
              </p>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-sm text-cyan-50">
                  {post.visitorNote.characterName}
                </p>
                <p className="mt-1 font-space text-[9px] uppercase tracking-[0.12em] text-white/30">
                  {post.visitorNote.voyageTopic}
                </p>
                <p className="mt-3 text-xs leading-5 text-white/65">
                  {post.visitorNote.fact}
                </p>
                {post.visitorNote.sources.length ? (
                  <ul className="mt-3 space-y-1 border-t border-white/10 pt-2">
                    {post.visitorNote.sources.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-[11px] leading-4 text-cyan-100/70 underline-offset-2 hover:underline"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {post.visitorNote.commentary ? (
                <p className="text-sm leading-6 text-white/60">
                  {post.visitorNote.commentary}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-white/60">
                {post.body}
              </p>
              {post.attachments.length ? (
                <ul className="mt-3 space-y-1">
                  {post.attachments.map((attachment) => (
                    <li key={attachment.url}>
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-xs text-cyan-100/70 underline-offset-2 hover:underline"
                      >
                        {attachment.label ?? attachment.url}
                        {attachment.kind === "video" ? " · video" : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void toggleLike()}
              disabled={likeState === "saving"}
              aria-pressed={post.likedByMe}
              aria-label={post.likedByMe ? "Unlike post" : "Like post"}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:opacity-50 ${
                post.likedByMe
                  ? "bg-orange-200/15 text-orange-100"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              <Heart
                size={14}
                className={post.likedByMe ? "fill-current" : undefined}
              />
              <span>{post.likeCount}</span>
            </button>
            {canReply ? (
              <button
                ref={replyButtonRef}
                type="button"
                onClick={toggleCompose}
                disabled={replyState === "saving"}
                aria-label="Reply"
                aria-pressed={composeOpen}
                title="Reply"
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:opacity-50 ${
                  composeOpen
                    ? "bg-white/10 text-white/70"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                <MessageCircle size={14} />
              </button>
            ) : null}
            {!nested && replyCount ? (
              <button
                type="button"
                onClick={toggleReplies}
                aria-expanded={repliesOpen}
                aria-controls={`starstream-replies-${post.id}`}
                className={`rounded-lg px-2 py-1.5 font-space text-[9px] uppercase tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 ${
                  repliesOpen || composeOpen
                    ? "bg-white/10 text-white/70"
                    : "text-white/30 hover:bg-white/5 hover:text-white/55"
                }`}
              >
                {replyLabel}
              </button>
            ) : null}
          </div>
          {!nested && showThread ? (
            <div
              id={`starstream-replies-${post.id}`}
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                threadOpen ? "mt-4 grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="flex gap-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (replyState === "saving") return;
                      setRepliesOpen(false);
                      if (composeOpen) closeCompose(false);
                    }}
                    disabled={replyState === "saving"}
                    aria-label="Hide replies"
                    title="Hide replies"
                    className="group relative w-3 shrink-0 self-stretch rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/15 transition group-hover:bg-white/40"
                    />
                  </button>
                  <div className="min-w-0 flex-1 space-y-2 pl-2">
                    {post.replies.map((reply) => (
                      <StarstreamPostCard
                        key={reply.id}
                        post={reply}
                        onToggleLike={onToggleLike}
                        nested
                      />
                    ))}
                    {composeOpen && canReply ? (
                      <form
                        aria-label={`Reply to ${post.authorName}`}
                        className="rounded-xl border border-white/10 bg-black/25 p-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitReply();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            if (replyState === "saving") return;
                            closeCompose();
                          }
                        }}
                      >
                        <label className="block">
                          <span className="font-space text-[9px] uppercase tracking-[0.14em] text-white/35">
                            Reply
                          </span>
                          <textarea
                            ref={replyTextareaRef}
                            value={replyBody}
                            onChange={(event) => {
                              setReplyBody(
                                event.target.value.slice(
                                  0,
                                  STARSTREAM_REPLY_MAX_LENGTH,
                                ),
                              );
                              if (replyError) setReplyError(null);
                            }}
                            rows={3}
                            readOnly={replyState === "saving"}
                            placeholder="Write a reply…"
                            className={`${textareaClass} mt-1.5`}
                          />
                        </label>
                        {replyError ? (
                          <p
                            role="alert"
                            className="mt-2 text-xs text-rose-100/80"
                          >
                            {replyError}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => closeCompose()}
                            disabled={replyState === "saving"}
                            className="min-h-9 rounded-lg px-3 text-xs text-white/40 transition hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={
                              replyState === "saving" || !replyBody.trim()
                            }
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-cyan-200 px-3 text-xs font-medium text-[#071014] transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:opacity-50"
                          >
                            {replyState === "saving" ? (
                              <LoaderCircle
                                size={13}
                                className="animate-spin"
                              />
                            ) : (
                              <Send size={13} />
                            )}
                            Reply
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function parseCuratorOutput(value: unknown): CuratorOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Curator returned an invalid idea.");
  }
  const output = value as Record<string, unknown>;
  const idea = output.idea;
  if (!idea || typeof idea !== "object" || Array.isArray(idea)) {
    throw new Error("Curator did not return a complete idea.");
  }
  const ideaRecord = idea as Record<string, unknown>;
  const requiredIdeaFields = [
    "name",
    "historicalEvent",
    "era",
    "region",
    "whyItFits",
    "plotDirection",
    "sourceSearchTerms",
  ];
  if (
    !requiredIdeaFields.every((key) => {
      const field = ideaRecord[key];
      return typeof field === "string" && Boolean(field.trim());
    })
  ) {
    throw new Error("Curator did not return a complete idea.");
  }
  return value as CuratorOutput;
}

async function requestCuratorIdea(
  prompt: string,
  signal: AbortSignal,
): Promise<CuratorOutput> {
  const response = await fetch("/api/home/pipeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage: "curate", input: prompt }),
    signal,
  });
  const responseText = await response.text();
  if (!response.ok) {
    let message = "Curator could not shape this voyage.";
    try {
      const payload = JSON.parse(responseText) as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim())
        message = payload.error;
    } catch {
      // Keep the fallback when the boundary does not return JSON.
    }
    throw new Error(message);
  }

  let output: unknown;
  for (const block of responseText.split(/\r?\n\r?\n/)) {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const data = block.match(/^data:\s*(.+)$/m)?.[1];
    if (!event || !data) continue;
    const payload = JSON.parse(data) as { output?: unknown; message?: unknown };
    if (event === "error") {
      throw new Error(
        typeof payload.message === "string"
          ? payload.message
          : "Curator could not shape this voyage.",
      );
    }
    if (event === "result") output = payload.output;
  }
  return parseCuratorOutput(output);
}

function voyageFormFromCurator(
  output: CuratorOutput,
  sourceUrls: string[],
): VoyageForm {
  const { idea } = output;
  const draft = output.voyage;
  const period =
    draft?.period && isConcreteHistoricalPeriod(draft.period)
      ? draft.period
      : idea.era;
  return {
    title: draft?.title ?? idea.name,
    topic: draft?.topic ?? idea.historicalEvent,
    period,
    scene: draft?.scene ?? idea.plotDirection,
    lessonPlan: draft?.lessonPlan ?? idea.whyItFits,
    // Source URLs are supplied by the Captain, never invented by Curator.
    sources: sourceUrls,
  };
}

function SourceUrlList({
  value,
  onChange,
  optional = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  optional?: boolean;
}) {
  const rows = value.length ? value : [""];
  const update = (index: number, next: string) => {
    onChange(
      rows.map((source, rowIndex) => (rowIndex === index ? next : source)),
    );
  };
  const remove = (index: number) => {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/65">
            Source URLs
          </p>
          <p className="mt-1 text-xs leading-5 text-white/35">
            {optional ? "Optional. " : ""}Paste exact URLs to use as the voyage
            grounding set.
          </p>
        </div>
        <Tooltip label="Add source URL">
          <button
            type="button"
            aria-label="Add source URL"
            onClick={() => onChange([...rows, ""])}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-100/15 text-cyan-100/70 transition hover:border-cyan-100/35 hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
          >
            <Plus size={15} />
          </button>
        </Tooltip>
      </div>
      <div className="space-y-2">
        {rows.map((source, index) => (
          <div className="flex items-center gap-2" key={`source-url-${index}`}>
            <input
              value={source}
              onChange={(event) => update(index, event.target.value)}
              placeholder="https://..."
              inputMode="url"
              className={inputClass}
              aria-label={`Source URL ${index + 1}`}
            />
            {rows.length > 1 && (
              <Tooltip label="Remove source URL">
                <button
                  type="button"
                  aria-label={`Remove source URL ${index + 1}`}
                  onClick={() => remove(index)}
                  className="grid size-9 shrink-0 place-items-center text-white/35 transition hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                >
                  <X size={15} />
                </button>
              </Tooltip>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreationDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (values: VoyageForm, status: PublishState) => Promise<void>;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const [mode, setMode] = useState<ComposerMode>("imagine");
  const [voyage, setVoyage] = useState(emptyVoyageForm);
  const [status, setStatus] = useState<ComposerStatus>("idle");
  const [imaginePrompt, setImaginePrompt] = useState("");
  const [imagineStatus, setImagineStatus] = useState<ImagineStatus>("idle");
  const [imagineError, setImagineError] = useState("");
  const imagineAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => imagineAbortRef.current?.abort(), []);
  const updateVoyage = (
    key: Exclude<keyof VoyageForm, "sources">,
    value: string,
  ) => setVoyage((current) => ({ ...current, [key]: value }));
  const canSubmit = Boolean(
    voyage.title.trim() &&
      voyage.topic.trim() &&
      voyage.period.trim() &&
      voyage.scene.trim() &&
      voyage.lessonPlan.trim(),
  );
  const imagine = async () => {
    const prompt = imaginePrompt.trim();
    if (!prompt || imagineStatus === "curating") return;
    imagineAbortRef.current?.abort();
    const controller = new AbortController();
    imagineAbortRef.current = controller;
    setImagineStatus("curating");
    setImagineError("");
    try {
      const output = await requestCuratorIdea(prompt, controller.signal);
      setVoyage((current) => voyageFormFromCurator(output, current.sources));
      setImagineStatus("ready");
      setMode("manual");
    } catch (error) {
      if (controller.signal.aborted) return;
      setImagineStatus("error");
      setImagineError(
        error instanceof Error
          ? error.message
          : "Curator could not shape this voyage.",
      );
    } finally {
      if (imagineAbortRef.current === controller)
        imagineAbortRef.current = null;
    }
  };
  const submit = async (publishState: PublishState) => {
    if (mode !== "manual" || !canSubmit) return;
    setStatus("saving");
    if (publishState === "published") {
      onClose();
      void onSave(voyage, publishState).catch(() => undefined);
      return;
    }
    try {
      await onSave(voyage, publishState);
      setStatus("saved");
      window.setTimeout(onClose, 450);
    } catch {
      setStatus("error");
    }
  };
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[#020608]/80 px-4 py-6 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-cyan-100/15 bg-[#0c171c] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.6)] scrollbar-pill sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="creation-dialog-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-space text-[9px] uppercase tracking-[0.25em] text-cyan-200/55">
              Captain&apos;s publishing desk
            </p>
            <h2
              id="creation-dialog-title"
              className="mt-2 font-display text-3xl tracking-[-0.03em] text-white"
            >
              Create a voyage
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-white/40">
              Give one historical scene a clear question and a path through the
              evidence.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              label={`Switch to ${mode === "imagine" ? "Manual" : "Imagine"} mode`}
              onClick={() =>
                setMode((current) =>
                  current === "imagine" ? "manual" : "imagine",
                )
              }
            >
              {mode === "imagine" ? (
                <FileText size={16} />
              ) : (
                <Sparkles size={16} />
              )}
            </IconButton>
            <IconButton label="Close creation dialog" onClick={onClose}>
              <X size={17} />
            </IconButton>
          </div>
        </div>
        {mode === "imagine" ? (
          <div className="mt-7 space-y-4">
            <Field label="Explore...">
              <textarea
                value={imaginePrompt}
                onChange={(event) => {
                  setImaginePrompt(event.target.value);
                  if (imagineStatus === "error") setImagineStatus("idle");
                }}
                placeholder="Describe the whole voyage you want your cadets to experience..."
                rows={8}
                autoFocus
                className={textareaClass}
              />
            </Field>
            <SourceUrlList
              value={voyage.sources}
              onChange={(sources) =>
                setVoyage((current) => ({ ...current, sources }))
              }
              optional
            />
            <div className="flex flex-col gap-3 rounded-xl border border-cyan-200/10 bg-cyan-200/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-white/45">
                Curator will turn your description into a bounded historical
                voyage for you to review.
              </p>
              <button
                type="button"
                onClick={() => void imagine()}
                disabled={!imaginePrompt.trim() || imagineStatus === "curating"}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-200 px-3 text-xs font-semibold text-[#071014] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80"
              >
                {imagineStatus === "curating" ? "Shaping…" : "Shape voyage"}
                <Sparkles size={13} />
              </button>
            </div>
            {imagineStatus === "error" && (
              <p role="alert" className="text-xs leading-5 text-orange-100/80">
                {imagineError}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-7 space-y-4">
            <Field label="Voyage title" hint="Shown to cadets">
              <input
                value={voyage.title}
                onChange={(event) => updateVoyage("title", event.target.value)}
                placeholder="e.g. The Weight of a Grain"
                autoFocus
                className={inputClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Topic">
                <input
                  value={voyage.topic}
                  onChange={(event) => updateVoyage("topic", event.target.value)}
                  placeholder="e.g. Ancient trade"
                  className={inputClass}
                />
              </Field>
              <Field label="Historical period">
                <input
                  value={voyage.period}
                  onChange={(event) =>
                    updateVoyage("period", event.target.value)
                  }
                  placeholder="e.g. 5th century BCE"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Scene prompt" hint="Where does the cadet arrive?">
              <textarea
                value={voyage.scene}
                onChange={(event) => updateVoyage("scene", event.target.value)}
                placeholder="Describe the moment, place, and tension…"
                rows={3}
                className={textareaClass}
              />
            </Field>
            <Field label="Lesson plan" hint="What should they investigate?">
              <textarea
                value={voyage.lessonPlan}
                onChange={(event) =>
                  updateVoyage("lessonPlan", event.target.value)
                }
                placeholder="A short prompt for evidence-led exploration…"
                rows={3}
                className={textareaClass}
              />
            </Field>
            {imagineStatus === "ready" && (
              <SourceUrlList
                value={voyage.sources}
                onChange={(sources) =>
                  setVoyage((current) => ({ ...current, sources }))
                }
              />
            )}
            {imagineStatus === "ready" && (
              <p className="rounded-xl border border-cyan-200/10 bg-cyan-200/[0.04] px-4 py-3 text-xs leading-5 text-cyan-50/65">
                Curator filled this draft from your description. Review the
                details, then optionally add exact sources before publishing.
              </p>
            )}
          </div>
        )}
        <div className="mt-7 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="text-xs text-white/35">
            {status === "saving"
              ? "Saving to the deck…"
              : status === "saved"
                ? "Saved. Closing the desk…"
                : status === "error"
                  ? "Could not sync this draft."
                  : mode === "imagine"
                    ? "Describe the voyage, then let Curator shape the details."
                    : !canSubmit
                      ? "Complete the required fields to continue."
                      : "Choose a draft or publish state."}
          </div>
          {mode === "manual" ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => submit("draft")}
                disabled={!canSubmit || status === "saving"}
                className="min-h-10 rounded-xl border border-white/15 px-3 text-xs text-white/65 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={() => submit("published")}
                disabled={!canSubmit || status === "saving"}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-cyan-200 px-3 text-xs font-semibold text-[#071014] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80"
              >
                Publish <Send size={13} />
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}


const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-cyan-200/50 focus:ring-2 focus:ring-cyan-200/10";
const textareaClass =
  "mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 transition focus:border-cyan-200/50 focus:ring-2 focus:ring-cyan-200/10";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-space text-[9px] uppercase tracking-[0.15em] text-white/45">
        {label}
      </span>
      {hint && <span className="ml-2 text-[10px] text-white/25">{hint}</span>}
      {children}
    </label>
  );
}

function StudentView({
  snapshot,
  section,
  username,
  displayName,
  onCommit,
  onToggleLike,
  onReply,
  onOpenAssignment,
  focusPostId,
}: {
  snapshot: NexusSnapshot;
  section: Section;
  username: string;
  displayName: string;
  onCommit: (
    next: NexusSnapshot,
    action: string,
    payload: unknown,
  ) => Promise<boolean>;
  onToggleLike: (logId: string) => Promise<boolean>;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  onOpenAssignment: (
    assignmentId: string,
    options?: { readOnly?: boolean },
  ) => void;
  focusPostId?: string | null;
}) {
  const assignedVoyages = snapshot.assignments
    .filter(
      (assignment) =>
        assignment.kind === "voyage" &&
        assignment.voyageId &&
        assignment.assignedTo === username,
    )
    .map((assignment) =>
      snapshot.voyages.find((voyage) => voyage.id === assignment.voyageId),
    )
    .filter((voyage): voyage is Voyage => Boolean(voyage));
  const orderedVoyages = Array.from(
    new Map(assignedVoyages.map((voyage) => [voyage.id, voyage])).values(),
  );
  const readyVoyages = orderedVoyages.filter(
    (voyage) => voyage.status === "published",
  );
  const overallProgress = readyVoyages.length
    ? Math.round(
        readyVoyages.reduce((sum, voyage) => {
          const assignment = snapshot.assignments.find(
            (item) =>
              item.voyageId === voyage.id && item.assignedTo === username,
          );
          return sum + (assignment?.progress ?? 0);
        }, 0) / readyVoyages.length,
      )
    : 0;
  const soloVoyages = snapshot.voyages.filter(
    (voyage) =>
      voyage.status === "published" &&
      voyage.stream === "solo" &&
      voyage.ownerId === username,
  );
  const selectableVoyages = [
    ...readyVoyages,
    ...soloVoyages.filter(
      (voyage) => !readyVoyages.some((assigned) => assigned.id === voyage.id),
    ),
  ];
  const completedVoyages = readyVoyages.filter((voyage) =>
    snapshot.assignments.some(
      (assignment) =>
        assignment.voyageId === voyage.id &&
        assignment.assignedTo === username &&
        assignment.state === "complete",
    ),
  );
  const [selectedVoyageId, setSelectedVoyageIdState] = useState(
    selectableVoyages[0]?.id ?? "",
  );
  const selectedVoyage =
    snapshot.voyages.find((voyage) => voyage.id === selectedVoyageId) ??
    selectableVoyages[0];
  const ownNote = snapshot.fieldNotes.find(
    (note) =>
      note.authorId === username &&
      note.voyageId === selectedVoyage?.id &&
      note.authorType !== "bot",
  );
  const [noteBody, setNoteBody] = useState(ownNote?.body ?? "");
  const [noteState, setNoteState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const currentAssignment = snapshot.assignments.find(
    (assignment) =>
      assignment.voyageId === selectedVoyage?.id &&
      assignment.assignedTo === username,
  );
  const setSelectedVoyageId = (id: string) => {
    const existing = snapshot.fieldNotes.find(
      (note) =>
        note.authorId === username &&
        note.voyageId === id &&
        note.authorType !== "bot",
    );
    setSelectedVoyageIdState(id);
    setNoteBody(existing?.body ?? "");
    setNoteState("idle");
  };
  const saveNote = async (status: PublishState) => {
    if (!selectedVoyage || !noteBody.trim()) return;
    setNoteState("saving");
    const next = cloneSnapshot(snapshot);
    const existingIndex = next.fieldNotes.findIndex(
      (note) => note.id === ownNote?.id,
    );
    const note: FieldNote = {
      id: ownNote?.id ?? makeId("note"),
      voyageId: selectedVoyage.id,
      authorId: username,
      authorName: displayName,
      authorType: "user",
      body: noteBody.trim(),
      status,
      createdAt: ownNote?.createdAt ?? "Just now",
    };
    if (existingIndex >= 0) next.fieldNotes[existingIndex] = note;
    else next.fieldNotes.unshift(note);
    const synced = await onCommit(
      next,
      status === "published" ? "publish-field-note" : "save-field-note",
      note,
    );
    setNoteState(synced ? "saved" : "error");
  };
  const openAssignmentBrief = (voyageId: string) => {
    const assignmentId = assignmentKeyForVoyage(snapshot, voyageId);
    if (!assignmentId) return;
    onOpenAssignment(assignmentId, { readOnly: true });
  };
  return (
    <>
      <div className="mt-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.5rem,5vw,4.8rem)] leading-[0.97] tracking-[-0.055em] text-white">
            {section === "Starstream" ? (
              "Starstream"
            ) : section === "Discoveries" ? (
              "Discoveries"
            ) : section === "Crew" ? (
              "Crew"
            ) : (
              <>
                Your next expedition,{" "}
                <span className="text-orange-100/80">Cadet.</span>
              </>
            )}
          </h1>
          {section === "Starstream" || section === "Discoveries" ? null : (
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/45 sm:text-base">
              {section === "Crew"
                ? "Your Captain and fellow cadets on this voyage."
                : "Embark on voyages to the past and share your discoveries with fellow cadets."}
            </p>
          )}
        </div>
        {section === "Overview" ? (
          <div className="text-right">
            <p className="font-space text-[9px] uppercase tracking-[0.14em] text-orange-100/55">
              Progress
            </p>
            <p className="mt-1 font-display text-3xl text-white">
              {overallProgress}
              <span className="text-lg text-white/35">%</span>
            </p>
          </div>
        ) : null}
      </div>
      {section === "Crew" ? (
        <CrewSection members={snapshot.crew} />
      ) : section === "Discoveries" ? (
        <DiscoveriesSection snapshot={snapshot} username={username} />
      ) : section === "Starstream" ? (
        <section
          className="mt-10 max-w-3xl"
          aria-labelledby="student-starstream-heading"
        >
          <h2 id="student-starstream-heading" className="sr-only">
            Starstream
          </h2>
          <StarstreamFeed
            posts={snapshot.starstreamLogs}
            voyages={snapshot.voyages}
            onToggleLike={onToggleLike}
            onReply={onReply}
            focusPostId={focusPostId}
            emptyTitle="Starstream is quiet"
            emptyBody="Published class notes from assigned voyages will appear here."
          />
        </section>
      ) : !orderedVoyages.length && !soloVoyages.length ? (
        <div className="mt-12">
          <EmptyState
            title="No assignment in orbit"
            body="Your Captain has not published a voyage yet. Check back soon."
          />
        </div>
      ) : (
        <div className="mt-10 grid gap-5 xl:grid-cols-[0.86fr_1.35fr]">
          <section
            className="space-y-5"
            aria-labelledby="student-assignments-heading"
          >
            <SectionHeading
              eyebrow="Assigned Voyages"
              title="Your voyages"
              titleId="student-assignments-heading"
            />
            {orderedVoyages.map((voyage) => (
                <div
                  key={voyage.id}
                  className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-2"
                >
                  {voyage.status === "published" ? (
                    <a
                      href={`/sail/${encodeURIComponent(voyage.slug)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Read ${voyage.title}`}
                      title="Read voyage"
                      className="grid size-10 shrink-0 place-items-center rounded-lg text-cyan-100/65 transition hover:bg-cyan-200/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                    >
                      <BookOpen size={16} />
                    </a>
                  ) : (
                    <span
                      className="grid size-10 shrink-0 place-items-center text-orange-100/65"
                      aria-hidden
                    >
                      <BookOpen size={16} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (voyage.status !== "published") return;
                      setSelectedVoyageId(voyage.id);
                      openAssignmentBrief(voyage.id);
                    }}
                    disabled={voyage.status !== "published"}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                      {voyage.title}
                    </span>
                    {voyage.completed ? (
                      <Check
                        size={17}
                        className="shrink-0 text-white"
                        aria-label="Completed"
                      />
                    ) : (
                      <>
                        <span className="font-space text-[9px] uppercase tracking-[0.14em] text-white/40">
                          {voyage.status === "published" ? "Ready" : "Planning"}
                        </span>
                        <ChevronRight size={14} className="text-white/25" />
                      </>
                    )}
                  </button>
                </div>
              ))}
            {soloVoyages.length ? (
              <section
                className="mt-6 space-y-3"
                aria-labelledby="solo-voyages-heading"
              >
                <div>
                  <p className="font-space text-[9px] uppercase tracking-[0.2em] text-orange-100/60">
                    Personal route
                  </p>
                  <h2
                    id="solo-voyages-heading"
                    className="mt-2 font-display text-2xl tracking-[-0.035em] text-white"
                  >
                    Solo Voyages
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-white/35">
                    Your own voyages and the notes you publish from them.
                  </p>
                </div>
                {soloVoyages.map((voyage) => (
                  <button
                    key={voyage.id}
                    type="button"
                    onClick={() => setSelectedVoyageId(voyage.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200/70 ${selectedVoyage?.id === voyage.id ? "border-orange-200/30 bg-orange-200/[0.09]" : "border-white/10 bg-white/[0.035] hover:border-white/20"}`}
                  >
                    <Compass size={16} className="text-orange-100/65" />
                    <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                      {voyage.title}
                    </span>
                    {voyage.completed ? (
                      <Check
                        size={17}
                        className="shrink-0 text-white"
                        aria-label="Completed"
                      />
                    ) : (
                      <ChevronRight size={14} className="text-white/25" />
                    )}
                  </button>
                ))}
              </section>
            ) : null}
          </section>
          <section aria-labelledby="voyage-stream-heading">
            <section
              className="mb-5 rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.04] p-5"
              aria-labelledby="completed-voyages-heading"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-space text-[9px] uppercase tracking-[0.22em] text-cyan-200/55">
                    Field log
                  </p>
                  <h2
                    id="completed-voyages-heading"
                    className="mt-2 font-display text-2xl tracking-[-0.035em] text-white"
                  >
                    Completed Voyages
                  </h2>
                </div>
                <span className="font-space text-[9px] uppercase tracking-[0.14em] text-white/30">
                  {completedVoyages.length}
                </span>
              </div>
              {completedVoyages.length ? (
                <div className="mt-4 space-y-2">
                  {completedVoyages.map((voyage) => (
                    <button
                      key={voyage.id}
                      type="button"
                      onClick={() => {
                        setSelectedVoyageId(voyage.id);
                        openAssignmentBrief(voyage.id);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-3 text-left text-sm text-white/75 transition hover:border-cyan-200/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                    >
                      <Check size={14} className="text-cyan-200" />
                      <span className="min-w-0 flex-1 truncate">
                        {voyage.title}
                      </span>
                      <ChevronRight size={14} className="text-white/25" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-white/35">
                  Your completed voyages and their reports will live here.
                </p>
              )}
            </section>
            {selectedVoyage ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-space text-[9px] uppercase tracking-[0.22em] text-cyan-200/55">
                      Current voyage
                    </p>
                    <h2
                      id="voyage-stream-heading"
                      className="mt-2 font-display text-3xl tracking-[-0.04em] text-white"
                    >
                      {selectedVoyage?.title}
                    </h2>
                    <p className="mt-2 text-sm text-white/40">
                      {selectedVoyage
                        ? voyageMetaLine({
                            topic: selectedVoyage.scene,
                            period: selectedVoyage.period,
                          })
                        : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {selectedVoyage.status === "published" ? (
                      <Tooltip label="Read voyage">
                        <a
                          href={`/sail/${encodeURIComponent(selectedVoyage.slug)}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Read ${selectedVoyage.title}`}
                          className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white/60 transition hover:border-cyan-200/25 hover:bg-white/[0.08] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                        >
                          <BookOpen size={16} />
                        </a>
                      </Tooltip>
                    ) : null}
                    {selectedVoyage.stream === "solo" ? (
                      <span className="rounded-full border border-orange-200/20 bg-orange-200/[0.08] px-3 py-2 font-space text-[9px] uppercase tracking-[0.16em] text-orange-100/70">
                        Solo voyage
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-7 border-t border-white/10 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-space text-[9px] uppercase tracking-[0.18em] text-orange-100/60">
                        Your field note
                      </p>
                      <p className="mt-1 text-sm text-white/65">
                        Cadet, any takeaways from that voyage?
                      </p>
                    </div>
                    {noteState === "saved" && (
                      <span className="font-space text-[9px] uppercase tracking-[0.1em] text-cyan-100/70">
                        Saved
                      </span>
                    )}
                  </div>
                  <textarea
                    value={noteBody}
                    onChange={(event) => {
                      setNoteBody(event.target.value);
                      setNoteState("idle");
                    }}
                    disabled={!selectedVoyage}
                    rows={5}
                    placeholder={
                      selectedVoyage
                        ? "Share a takeaway, question, or piece of evidence with your class."
                        : "Choose a voyage to start writing."
                    }
                    className="mt-4 w-full resize-y rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 transition focus:border-orange-200/45 focus:ring-2 focus:ring-orange-200/10 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs text-white/30">
                      {noteState === "saving"
                        ? "Saving…"
                        : ownNote?.status === "published"
                          ? "Published. You can still add to it anytime."
                          : noteBody.trim()
                            ? `${noteBody.trim().length} characters`
                            : "Drafts stay private until published."}
                    </span>
                    <div className="flex justify-end gap-2">
                      {ownNote?.status !== "published" ? (
                        <button
                          type="button"
                          onClick={() => saveNote("draft")}
                          disabled={!noteBody.trim() || noteState === "saving"}
                          className="min-h-10 rounded-xl border border-white/15 px-3 text-xs text-white/65 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                        >
                          Save draft
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => saveNote("published")}
                        disabled={!noteBody.trim() || noteState === "saving"}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-200 px-3 text-xs font-semibold text-[#071014] transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-100/80"
                      >
                        {ownNote?.status === "published"
                          ? "Update"
                          : "Publish to voyage"}{" "}
                        <Send size={13} />
                      </button>
                    </div>
                  </div>
                </div>
                {currentAssignment?.state === "complete" &&
                selectedVoyage?.report ? (
                  <div
                    className="mt-7 border-t border-white/10 pt-6"
                    aria-labelledby="voyage-report-heading"
                  >
                    <p className="font-space text-[9px] uppercase tracking-[0.18em] text-cyan-200/55">
                      Voyage report
                    </p>
                    <h3
                      id="voyage-report-heading"
                      className="mt-2 font-display text-2xl text-white"
                    >
                      What did we learn?
                    </h3>
                    <ReportMarkdown
                      scrollable
                      className="mt-4"
                      sources={selectedVoyage.report.sources}
                    >
                      {selectedVoyage.report.reportText}
                    </ReportMarkdown>
                    <h4 className="mt-6 font-space text-[9px] uppercase tracking-[0.18em] text-white/35">
                      Sources
                    </h4>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-cyan-100/70">
                      {selectedVoyage.report.sources.map((source) => (
                        <li key={source}>
                          <a
                            href={source}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-cyan-100/25 underline-offset-2 hover:text-cyan-50"
                          >
                            {source}
                          </a>
                        </li>
                      ))}
                    </ol>
                    {selectedVoyage.report.furtherReading.length ? (
                      <>
                        <h4 className="mt-6 font-space text-[9px] uppercase tracking-[0.18em] text-white/35">
                          Further reading
                        </h4>
                        <ul className="mt-3 space-y-2 text-xs text-cyan-100/70">
                          {selectedVoyage.report.furtherReading.map(
                            (source) => (
                              <li key={source}>
                                <a
                                  href={source}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline decoration-cyan-100/25 underline-offset-2 hover:text-cyan-50"
                                >
                                  {source}
                                </a>
                              </li>
                            ),
                          )}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-orange-200/15 bg-orange-200/[0.05] p-6 sm:p-8">
                <p className="font-space text-[9px] uppercase tracking-[0.2em] text-orange-100/60">
                  Assigned Voyages
                </p>
                <h2 className="mt-2 font-display text-3xl text-white">
                  Your Captain is still preparing the route.
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/45">
                  Planning voyages will appear on the left. A voyage becomes
                  playable when its status changes to Ready.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function NexusClient() {
  const router = useRouter();
  const { user, setUser } = useUser();
  const [snapshot, setSnapshot] = useState<NexusSnapshot>(() =>
    cloneSnapshot(EMPTY_SNAPSHOT),
  );
  const [snapshotStatus, setSnapshotStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [section, setSection] = useState<Section>("Overview");
  const [focusPostId, setFocusPostId] = useState<string | null>(null);
  const [urlBootstrapped, setUrlBootstrapped] = useState(false);
  if (typeof window !== "undefined" && !urlBootstrapped) {
    setUrlBootstrapped(true);
    const params = new URLSearchParams(window.location.search);
    const sectionParam = params.get("section");
    const postParam = params.get("post");
    if (
      sectionParam === "Starstream" ||
      sectionParam === "Discoveries" ||
      sectionParam === "Overview" ||
      sectionParam === "Voyages" ||
      sectionParam === "Cadets" ||
      sectionParam === "Crew" ||
      sectionParam === "Settings"
    ) {
      setSection(sectionParam);
    } else if (postParam) {
      setSection("Starstream");
    }
    if (postParam) setFocusPostId(postParam);
  }
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [assignmentEditor, setAssignmentEditor] =
    useState<AssignmentEditorData | null>(null);
  const [reportVoyage, setReportVoyage] = useState<Voyage | null>(null);
  const [voyageGeneration, setVoyageGeneration] =
    useState<VoyageGeneration | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationTerminationRef = useRef(false);
  const userId = user?.id ?? null;
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  if (userId !== loadedForUserId) {
    setLoadedForUserId(userId);
    setSnapshotStatus(userId ? "loading" : "idle");
    if (!userId) setSnapshot(cloneSnapshot(EMPTY_SNAPSHOT));
  }

  useEffect(() => {
    if (!user) {
      router.replace("/roll-call?view=returning");
      return;
    }
    let active = true;
    (async () => {
      const remote = await requestDomainSnapshot();
      if (!active) return;
      if (remote) {
        setSnapshot(remote);
        setSnapshotStatus("ready");
        return;
      }
      setSnapshot(cloneSnapshot(EMPTY_SNAPSHOT));
      setSnapshotStatus("error");
    })();
    return () => {
      active = false;
    };
  }, [router, user]);

  const commitSnapshot = async (
    next: NexusSnapshot,
    action: string,
    payload: unknown,
  ): Promise<boolean> => {
    setSnapshot(next);
    try {
      const remote = await sendDomainMutation(action, payload);
      if (!remote) return false;
      setSnapshot(remote);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === TOXICITY_BLOCKED) {
        toast.error(TOXICITY_RESUBMIT_MESSAGE);
        const remote = await requestDomainSnapshot();
        if (remote) setSnapshot(remote);
      }
      return false;
    }
  };

  const toggleStarstreamLike = async (logId: string): Promise<boolean> => {
    const remote = await sendDomainMutation("toggle-starstream-like", {
      logId,
    });
    if (!remote) return false;
    setSnapshot(remote);
    return true;
  };

  const createStarstreamReply = async (
    parentId: string,
    body: string,
  ): Promise<boolean> => {
    try {
      const remote = await sendDomainMutation("create-starstream-reply", {
        parentId,
        body,
      });
      if (!remote) return false;
      setSnapshot(remote);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === TOXICITY_BLOCKED) {
        toast.error(TOXICITY_RESUBMIT_MESSAGE);
      }
      if (error instanceof Error && error.message === "replies_disabled") {
        const remote = await requestDomainSnapshot();
        if (remote) setSnapshot(remote);
      }
      throw error;
    }
  };

  const openAssignmentEditor = (
    assignmentId: string,
    options?: { readOnly?: boolean },
  ) => {
    const assignment =
      snapshot.assignments.find((item) => item.id === assignmentId) ??
      snapshot.assignments.find((item) => item.assignmentId === assignmentId);
    if (!assignment) return;
    const voyage = assignment.voyageId
      ? snapshot.voyages.find((item) => item.id === assignment.voyageId)
      : undefined;
    const targetTitle = voyage?.title ?? assignment.title ?? "Assignment";
    setAssignmentEditor({
      id: assignment.assignmentId ?? assignment.id,
      targetTitle,
      title: assignment.title ?? targetTitle,
      status: assignment.status ?? voyage?.status ?? "draft",
      lessonPlan: assignment.lessonPlan || voyage?.lessonPlan || "",
      sources: assignment.sources?.length
        ? assignment.sources
        : (voyage?.sources ?? []),
      readOnly: Boolean(options?.readOnly),
    });
  };

  const refreshSnapshot = async () => {
    const remote = await requestDomainSnapshot();
    if (remote) {
      setSnapshot(remote);
      setSnapshotStatus("ready");
    }
  };

  const saveAssignment = async (
    values: Pick<AssignmentEditorData, "title" | "lessonPlan" | "sources">,
  ) => {
    if (!assignmentEditor) return;
    const response = await fetch(`/api/assignments/${assignmentEditor.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = asRecord(await response.json().catch(() => null));
    if (!response.ok)
      throw new Error(
        textValue(payload?.error) ?? "Could not save assignment.",
      );
    await refreshSnapshot();
    setAssignmentEditor(null);
  };

  const deleteAssignment = async () => {
    if (!assignmentEditor) return;
    const response = await fetch(`/api/assignments/${assignmentEditor.id}`, {
      method: "DELETE",
    });
    const payload = asRecord(await response.json().catch(() => null));
    if (!response.ok)
      throw new Error(
        textValue(payload?.error) ?? "Could not delete assignment.",
      );
    await refreshSnapshot();
    setAssignmentEditor(null);
  };

  const generateAndPublishVoyage = async (
    form: VoyageForm,
    replayFlourish?: FlourishConfig,
  ) => {
    const generationForm: VoyageForm = {
      ...form,
      sources: [...form.sources],
    };
    const title = generationForm.title.trim();
    // Capture the resolved policy on the first attempt; regeneration replays it exactly.
    const flourish: FlourishConfig = replayFlourish
      ? {
          ...replayFlourish,
          approvedDomains: [...replayFlourish.approvedDomains],
          approvedSourceUrls: [...replayFlourish.approvedSourceUrls],
        }
      : normalizeFlourishConfig({
          ...sourcePolicyFromClassroom(snapshot.classroom),
          approvedSourceUrls: generationForm.sources,
        });
    const request = { form: generationForm, flourish };
    const entries: ProgressLogEntry[] = [];
    let progress = 0;
    let runSlug: string | undefined;
    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    generationTerminationRef.current = false;
    const updateGeneration = (patch: Partial<VoyageGeneration>) => {
      setVoyageGeneration((current) =>
        current ? { ...current, ...patch } : current,
      );
    };
    const addProgress = (entry: ProgressLogEntry, milestone?: number) => {
      entries.push(entry);
      progress = Math.max(
        progress,
        milestone ?? generationProgress(entry.agent, progress),
      );
      updateGeneration({ entries: [...entries], progress });
      if (runSlug) void persistRun();
    };
    const persistRun = async (
      patch: {
        outputs?: Record<string, unknown>;
        status?: "ongoing" | "fail" | "succeed";
        error?: string;
      } = {},
    ) => {
      if (!runSlug) return;
      await fetch("/api/steer/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: runSlug,
          progress: progressEntriesForStorage(entries),
          outputs: patch.outputs,
          status: patch.status,
          error: patch.error,
        }),
      }).catch(() => undefined);
    };
    setVoyageGeneration({
      title,
      progress: 0.02,
      status: "running",
      entries: [],
      request,
    });
    addProgress(
      {
        agent: "system",
        phase: "run",
        message: "Starting the voyage pipeline…",
      },
      0.02,
    );

    try {
      const runResponse = await fetch("/api/steer/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steering: generationForm.topic.trim(),
          storyConfig: flourish,
          progress: progressEntriesForStorage(entries),
        }),
        signal: abortController.signal,
      });
      const runBody = asRecord(await runResponse.json().catch(() => null));
      if (!runResponse.ok)
        throw new Error(
          textValue(runBody?.error) ?? "Could not create the voyage run.",
        );
      runSlug = textValue(runBody?.slug) ?? undefined;
      if (!runSlug)
        throw new Error("Voyage run was created without a debug slug.");
      updateGeneration({ runSlug });
      await persistRun();

      const idea = {
        name: title,
        historicalEvent: generationForm.topic.trim(),
        era: generationForm.period.trim(),
        region: generationForm.period.trim(),
        whyItFits: generationForm.lessonPlan.trim(),
        lessonPlan: generationForm.lessonPlan.trim(),
        plotDirection: generationForm.scene.trim(),
        sourceSearchTerms: `${generationForm.topic.trim()} ${title}`,
        sourceUrls: generationForm.sources,
      };
      const pipelineResponse = await fetch("/api/home/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "story", idea, flourish }),
        signal: abortController.signal,
      });
      if (!pipelineResponse.ok) {
        const body = asRecord(await pipelineResponse.json().catch(() => null));
        throw new Error(
          textValue(body?.error) ?? "Voyage pipeline could not start.",
        );
      }
      if (!pipelineResponse.body)
        throw new Error("Voyage pipeline stream was unavailable.");
      const reader = pipelineResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let outputs: Record<string, unknown> | undefined;
      const assets: PipelineAsset[] = [];
      const process = (chunk: string) => {
        buffer += chunk;
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const rawBlock of blocks) {
          const parsed = parseSseBlock(rawBlock.trim());
          if (!parsed) continue;
          const data = asRecord(parsed.data);
          if (parsed.event === "progress" && data) {
            addProgress({
              agent: textValue(data.agent) ?? "system",
              phase: textValue(data.phase) ?? "agent",
              message: textValue(data.message) ?? "Progress update",
              details: asRecord(data.details) ?? undefined,
            });
          } else if (parsed.event === "asset" && data) {
            const type = textValue(data.type);
            const name = textValue(data.name);
            if (
              type !== "character" &&
              type !== "character_sprite" &&
              type !== "collectible"
            )
              continue;
            if (!name) continue;
            const imageDataUrls = Array.isArray(data.imageDataUrls)
              ? data.imageDataUrls.filter(
                  (value): value is string => typeof value === "string",
                )
              : [];
            const frames = Array.isArray(data.frames)
              ? data.frames.flatMap((value) => {
                  const frame = asRecord(value);
                  const frameKey = textValue(frame?.frameKey);
                  const dataUrl = textValue(frame?.dataUrl);
                  return frameKey && dataUrl ? [{ frameKey, dataUrl }] : [];
                })
              : [];
            const asset: PipelineAsset = {
              type,
              name,
              assetId: textValue(data.assetId) ?? undefined,
              imageDataUrls,
              frames: frames.length ? frames : undefined,
              metadata: data.metadata,
              ageRange: textValue(data.ageRange) ?? undefined,
            };
            assets.push(asset);
            addProgress(
              {
                agent: type === "collectible" ? "artist" : "artist",
                phase: "asset",
                kind: "asset",
                type,
                name,
                assetId: asset.assetId,
                imageDataUrls,
                frames: asset.frames,
                imageCount: imageDataUrls.length || frames.length,
                metadata: asset.metadata,
              },
              0.84,
            );
          } else if (parsed.event === "result" && data) {
            outputs = asRecord(data.outputs) ?? undefined;
          } else if (parsed.event === "error") {
            throw new Error(
              textValue(data?.message) ?? "Voyage pipeline failed.",
            );
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
      if (abortController.signal.aborted) {
        throw new Error(
          generationTerminationRef.current
            ? "Voyage generation terminated by the Captain."
            : "Voyage generation stream was aborted before completion.",
        );
      }
      if (!outputs)
        throw new Error(
          "Voyage pipeline stream ended before the story result was received.",
        );
      await persistRun({ outputs });

      const researcherOutput = asRecord(outputs.researcher);
      const directorOutput = asRecord(outputs.director);
      const writerOutput = asRecord(outputs.writer);
      const needAssets = asRecord(writerOutput?.need_assets);
      if (!researcherOutput || !directorOutput || !writerOutput || !needAssets)
        throw new Error("Pipeline outputs were incomplete.");
      const reportSources = sourceUrlsFromReport(writerOutput.report);
      if (!reportSources.length)
        throw new Error(
          "The generated voyage report did not include any sources.",
        );
      addProgress(
        {
          agent: "system",
          phase: "complete",
          message: "Pipeline complete. Saving the finished voyage…",
        },
        0.92,
      );
      const storyAssets = assets.flatMap((asset) =>
        asset.frames?.length
          ? asset.frames.map((frame) => ({
              type: asset.type,
              name: asset.name,
              frameKey: frame.frameKey,
              dataUrl: frame.dataUrl,
              assetId: asset.assetId,
              metadata: asset.metadata,
              ageRange: asset.ageRange,
            }))
          : (asset.imageDataUrls ?? []).map((dataUrl) => ({
              type: asset.type,
              name: asset.name,
              dataUrl,
              assetId: asset.assetId,
              metadata: asset.metadata,
              ageRange: asset.ageRange,
            })),
      );
      const finalizeResponse = await fetch("/api/stories/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyJson: writerOutput.dialogue ?? writerOutput,
          synopsis: directorOutput.synopsis,
          runSlug,
          steering: generationForm.topic.trim(),
          period: generationForm.period.trim(),
          storyConfig: flourish,
          outputs,
          director: {
            ...directorOutput,
            characters: Array.isArray(needAssets.characters)
              ? needAssets.characters
              : [],
            starCharacter: needAssets.starCharacter ?? null,
          },
          assets: storyAssets,
          progress: progressEntriesForStorage(entries),
        }),
        signal: abortController.signal,
      });
      const finalizeBody = asRecord(
        await finalizeResponse.json().catch(() => null),
      );
      if (!finalizeResponse.ok)
        throw new Error(
          textValue(finalizeBody?.error) ??
            "Could not save the generated voyage.",
        );
      const storyId = textValue(finalizeBody?.id);
      if (!storyId)
        throw new Error("Generated voyage was saved without an id.");
      const publishResponse = await fetch("/api/nexus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish-voyage",
          payload: {
            storyId,
            title,
            topic: generationForm.topic.trim(),
            period: generationForm.period.trim(),
            scene: generationForm.scene.trim(),
            lessonPlan: generationForm.lessonPlan.trim(),
            sources: reportSources,
          },
        }),
        signal: abortController.signal,
      });
      const publishBody = (await publishResponse.json().catch(() => null)) as
        | NexusSnapshot
        | { error?: unknown };
      if (!publishResponse.ok || !("voyages" in publishBody))
        throw new Error(
          textValue((publishBody as { error?: unknown }).error) ??
            "Could not publish the generated voyage.",
        );
      setSnapshot(publishBody);
      addProgress(
        {
          agent: "system",
          phase: "save",
          message: "Voyage published and assigned to the classroom.",
        },
        1,
      );
      await persistRun({ status: "succeed" });
      updateGeneration({
        status: "succeeded",
        progress: 1,
        entries: [...entries],
      });
    } catch (error) {
      const message = generationTerminationRef.current
        ? "Voyage generation terminated by the Captain."
        : error instanceof Error
          ? error.message
          : "Voyage generation failed.";
      addProgress({ agent: "system", phase: "error", message });
      await persistRun({ status: "fail", error: message });
      updateGeneration({
        status: "failed",
        error: message,
        progress,
        entries: [...entries],
      });
      throw error;
    } finally {
      if (generationAbortRef.current === abortController)
        generationAbortRef.current = null;
    }
  };

  const regenerateVoyageGeneration = () => {
    if (voyageGeneration?.status !== "failed") return;
    const { form, flourish } = voyageGeneration.request;
    void generateAndPublishVoyage(form, flourish).catch(() => undefined);
  };

  const terminateVoyageGeneration = () => {
    if (!generationAbortRef.current || voyageGeneration?.status !== "running")
      return;
    generationTerminationRef.current = true;
    generationAbortRef.current.abort();
  };

  const saveCreation = async (values: VoyageForm, status: PublishState) => {
    if (!user) throw new Error("Sign in to save this draft.");
    if (status === "published") {
      await generateAndPublishVoyage(values);
      return;
    }
    const next = cloneSnapshot(snapshot);
    next.voyages.unshift({
      id: makeId("voyage"),
      slug: makeId("voyage"),
      title: values.title.trim(),
      topic: values.topic.trim(),
      period: values.period.trim(),
      scene: values.scene.trim(),
      lessonPlan: values.lessonPlan.trim(),
      sources: values.sources,
      status: "draft",
    });
    const synced = await commitSnapshot(next, "save-voyage", values);
    if (!synced) throw new Error("Could not sync this draft to the domain.");
  };

  if (!user) {
    return <LoadingScreen />;
  }

  if (snapshotStatus === "loading" || snapshotStatus === "idle") {
    return <LoadingScreen />;
  }

  if (snapshotStatus === "error") {
    return (
      <div className="nexus-page grid min-h-dvh place-items-center bg-[#071014] px-5 text-center text-white/65">
        <div>
          <p className="font-space text-[10px] uppercase tracking-[0.2em] text-orange-100/60">
            Could not load Nexus
          </p>
          <p className="mt-3 text-sm text-white/45">
            Sign in again, then retry loading your classroom from the database.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/roll-call?view=returning")}
            className="mt-6 inline-flex min-h-10 items-center rounded-xl border border-white/15 px-4 text-xs text-white/70 transition hover:border-white/25 hover:text-white"
          >
            Back to roll call
          </button>
        </div>
      </div>
    );
  }

  const isTeacher = user.role === "teacher";
  return (
    <NexusShell
      user={user}
      onSignOut={() => {
        void fetch("/api/demo-auth/sign-out", { method: "POST" }).catch(
          () => {},
        );
        generationTerminationRef.current = true;
        generationAbortRef.current?.abort();
        setUser(null);
        setSnapshot(cloneSnapshot(EMPTY_SNAPSHOT));
        setSnapshotStatus("idle");
        setSidebarOpen(false);
        setComposerOpen(false);
        setAssignmentEditor(null);
        setSection("Overview");
        router.replace("/roll-call?view=returning");
      }}
      section={section}
      onSectionChange={setSection}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      <Toaster
        position="top-right"
        gutter={10}
        toastOptions={{ duration: 2800 }}
      />
      {isTeacher ? (
        <TeacherView
          snapshot={snapshot}
          section={section}
          generation={voyageGeneration}
          onOpenAssignment={openAssignmentEditor}
          onOpenReport={(voyageId) =>
            setReportVoyage(
              snapshot.voyages.find((voyage) => voyage.id === voyageId) ?? null,
            )
          }
          onTerminateGeneration={terminateVoyageGeneration}
          onRegenerateGeneration={regenerateVoyageGeneration}
          onCreate={() => {
            setVoyageGeneration(null);
            setComposerOpen(true);
          }}
          onClassroomUpdate={(classroom) =>
            setSnapshot((current) => ({ ...current, classroom }))
          }
          onToggleLike={toggleStarstreamLike}
          onReply={createStarstreamReply}
          focusPostId={focusPostId}
        />
      ) : (
        <StudentView
          snapshot={snapshot}
          section={section}
          username={user.username}
          displayName={user.displayName}
          onCommit={commitSnapshot}
          onToggleLike={toggleStarstreamLike}
          onReply={createStarstreamReply}
          onOpenAssignment={openAssignmentEditor}
          focusPostId={focusPostId}
        />
      )}
      {isTeacher && voyageGeneration ? (
        <ProgressLogPanel
          entries={voyageGeneration.entries}
          label="Voyage generation debug"
          onTerminate={
            voyageGeneration.status === "running"
              ? terminateVoyageGeneration
              : undefined
          }
        />
      ) : null}
      {composerOpen && (
        <CreationDialog
          onClose={() => setComposerOpen(false)}
          onSave={saveCreation}
        />
      )}
      {assignmentEditor ? (
        <AssignmentEditorDialog
          assignment={assignmentEditor}
          onClose={() => setAssignmentEditor(null)}
          onSave={saveAssignment}
          onDelete={deleteAssignment}
        />
      ) : null}
      {reportVoyage ? (
        <VoyageReportDialog
          voyage={reportVoyage}
          onClose={() => setReportVoyage(null)}
        />
      ) : null}
    </NexusShell>
  );
}
