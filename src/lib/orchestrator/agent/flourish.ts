import { ORCHESTRATOR_CONFIG } from "../config";

export type FlourishSourceMode = "free" | "restricted";
export type FlourishSourceKind = "article" | "video";

export type GroundingSource = {
  title: string;
  url: string;
  domain: string;
  kind: FlourishSourceKind;
  keyPoints?: string[];
};

export type FlourishConfig = {
  sourceMode: FlourishSourceMode;
  approvedDomains: string[];
  approvedSourceUrls: string[];
  requiredSources: number;
  maxFollowupSources: number;
  furtherReading: boolean;
};

export type StoryReport = {
  reportText: string;
  sources: GroundingSource[];
  furtherReading: GroundingSource[];
};

export function validateReportText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("reportText must be a non-empty Markdown string");
  if (!value.includes("What was Fact?") || !value.includes("What was Fiction?")) {
    throw new Error("reportText must include What was Fact? and What was Fiction? sections");
  }
  return value.trim();
}

export const DEFAULT_FLOURISH_CONFIG: FlourishConfig = {
  sourceMode: "free",
  // Free mode has no allowlist. Wikipedia is required via the Researcher prompt, not domains.
  approvedDomains: [],
  approvedSourceUrls: [],
  requiredSources: ORCHESTRATOR_CONFIG.REQUIRED_SOURCES,
  maxFollowupSources: ORCHESTRATOR_CONFIG.MAX_FOLLOWUP_SOURCES,
  furtherReading: false,
};

export function normalizeDomain(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

/** Normalize a classroom `approvedDomains` JSON value into host names. */
export function parseApprovedDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((domain): domain is string => typeof domain === "string" && Boolean(domain.trim()))
        .map(normalizeDomain),
    ),
  );
}

/**
 * Teacher Settings rule: any approved domain means Restricted; an empty list means Free.
 * Prefer domains over a stale `sourceMode` so voyage generation cannot ignore classroom policy.
 */
export function sourcePolicyFromClassroom(
  classroom:
    | {
        sourceMode?: unknown;
        approvedDomains?: unknown;
      }
    | null
    | undefined,
): Pick<FlourishConfig, "sourceMode" | "approvedDomains"> {
  const approvedDomains = parseApprovedDomains(classroom?.approvedDomains);
  if (approvedDomains.length > 0) {
    return { sourceMode: "restricted", approvedDomains };
  }
  return { sourceMode: "free", approvedDomains: [] };
}

export function sourceDomain(url: string): string {
  return normalizeDomain(new URL(url).hostname);
}

function canonicalSourceUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("approved source URLs must use https");
  return url.toString();
}

export function isAllowedSourceUrl(url: string, config: FlourishConfig): boolean {
  try {
    const canonical = canonicalSourceUrl(url);
    if (config.approvedSourceUrls.length > 0) return config.approvedSourceUrls.includes(canonical);
    const parsed = new URL(canonical);
    // Free mode or an empty domain list means any HTTPS source is allowed.
    if (config.sourceMode === "free" || config.approvedDomains.length === 0) return true;
    const domain = normalizeDomain(parsed.hostname);
    return config.approvedDomains.some((approved) => {
      const normalized = normalizeDomain(approved);
      return domain === normalized || domain.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function sourceKind(value: unknown): FlourishSourceKind {
  return value === "video" ? "video" : "article";
}

export function normalizeSource(value: unknown, label: string): GroundingSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const source = value as Record<string, unknown>;
  if (typeof source.title !== "string" || !source.title.trim()) {
    throw new Error(`${label}.title must be a non-empty string`);
  }
  if (typeof source.url !== "string" || !source.url.trim()) {
    throw new Error(`${label}.url must be a non-empty string`);
  }
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`${label}.url must be a valid URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label}.url must use https`);
  const keyPoints = Array.isArray(source.keyPoints)
    ? source.keyPoints.filter((point): point is string => typeof point === "string" && Boolean(point.trim())).map((point) => point.trim())
    : undefined;
  return {
    title: source.title.trim(),
    url: url.toString(),
    domain: sourceDomain(url.toString()),
    kind: sourceKind(source.kind),
    ...(keyPoints?.length ? { keyPoints } : {}),
  };
}

export function validateGroundingSources(
  values: unknown,
  config: FlourishConfig,
  label: string,
  minimum = config.requiredSources,
): GroundingSource[] {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const sources = values.map((value, index) => normalizeSource(value, `${label}[${index}]`));
  if (sources.length < minimum) {
    throw new Error(`${label} must contain at least ${minimum} sources`);
  }
  const duplicate = sources.find((source, index) => sources.findIndex((candidate) => candidate.url === source.url) !== index);
  if (duplicate) throw new Error(`${label} contains duplicate source URL ${duplicate.url}`);
  const disallowed = sources.find((source) => !isAllowedSourceUrl(source.url, config));
  if (disallowed) throw new Error(`${label} contains a source outside the approved domains: ${disallowed.url}`);
  return sources;
}

export function validateFurtherReading(values: unknown, config: FlourishConfig, excludedUrls: string[] = []): GroundingSource[] {
  if (!config.furtherReading) return [];
  if (!Array.isArray(values)) throw new Error("furtherReading must be an array");
  const sources = values.map((value, index) => normalizeSource(value, `furtherReading[${index}]`));
  if (sources.length > config.maxFollowupSources) {
    throw new Error(`furtherReading cannot contain more than ${config.maxFollowupSources} sources`);
  }
  if (sources.length === 0 && config.sourceMode === "free") {
    throw new Error("furtherReading must include at least one source, including a video");
  }
  const disallowed = sources.find((source) => !isAllowedSourceUrl(source.url, config));
  if (disallowed) throw new Error(`furtherReading contains a source outside the approved domains: ${disallowed.url}`);
  const duplicatePrimary = sources.find((source) => excludedUrls.includes(source.url));
  if (duplicatePrimary) throw new Error(`furtherReading must not duplicate a primary source: ${duplicatePrimary.url}`);
  if (sources.length > 0 && !sources.some((source) => source.kind === "video")) {
    throw new Error("furtherReading must contain at least one video source");
  }
  return sources;
}

export function normalizeFlourishConfig(value: unknown): FlourishConfig {
  if (value === undefined || value === null) return { ...DEFAULT_FLOURISH_CONFIG };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("flourish config must be an object");
  const record = value as Record<string, unknown>;
  const rawMode = record.sourceMode ?? "free";
  if (rawMode !== "free" && rawMode !== "restricted") throw new Error("sourceMode must be free or restricted");
  const approvedDomains = Array.isArray(record.approvedDomains)
    ? parseApprovedDomains(record.approvedDomains)
    : DEFAULT_FLOURISH_CONFIG.approvedDomains;
  // Settings rule wins over a stale sourceMode: any domain ⇒ Restricted; empty ⇒ Free.
  const sourceMode: FlourishSourceMode = approvedDomains.length > 0 ? "restricted" : "free";
  if (rawMode === "restricted" && approvedDomains.length === 0) {
    throw new Error("restricted mode requires at least one approved domain");
  }
  const approvedSourceUrls = Array.isArray(record.approvedSourceUrls)
    ? record.approvedSourceUrls.filter((url): url is string => typeof url === "string" && Boolean(url.trim())).map(canonicalSourceUrl)
    : DEFAULT_FLOURISH_CONFIG.approvedSourceUrls;
  const requiredSources = approvedSourceUrls.length > 0
    ? 1
    : typeof record.requiredSources === "number" ? record.requiredSources : DEFAULT_FLOURISH_CONFIG.requiredSources;
  const maxFollowupSources = typeof record.maxFollowupSources === "number" ? record.maxFollowupSources : DEFAULT_FLOURISH_CONFIG.maxFollowupSources;
  if (!Number.isInteger(requiredSources) || requiredSources < 1 || requiredSources > 10) throw new Error("requiredSources must be an integer from 1 to 10");
  if (!Number.isInteger(maxFollowupSources) || maxFollowupSources < 0 || maxFollowupSources > 10) throw new Error("maxFollowupSources must be an integer from 0 to 10");
  return {
    sourceMode,
    approvedDomains,
    approvedSourceUrls: Array.from(new Set(approvedSourceUrls)),
    requiredSources,
    maxFollowupSources,
    furtherReading: record.furtherReading === true,
  };
}
