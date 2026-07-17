import { ORCHESTRATOR_CONFIG } from "../orchestrator/config";

export type WikipediaPage = {
  title: string;
  source: string;
  sourceUrl: string;
  revisionId?: number;
  timestamp?: string;
};

export type WikipediaHtmlPage = WikipediaPage & { html: string };

export type WikipediaSearchResult = {
  title: string;
  url: string;
  excerpt: string;
  matched_title?: string | null;
  description?: string | null;
  thumbnail?: unknown;
};

export type WikipediaSectionInfo = {
  index: number;
  line: string;
  level: number;
  number: string;
  anchor?: string;
  isLead: boolean;
};

export type WikipediaSectionContent = {
  title: string;
  sourceUrl: string;
  sectionIndex: number;
  sectionLine: string;
  level: number;
  isLead: boolean;
  /** Parsed HTML for the section (may be empty for some edge cases). */
  html: string;
  /** Wikitext for the section when available. */
  wikitext: string;
};

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

type ParseSectionHeading = {
  index?: string | number;
  line?: string;
  hLevel?: string | number;
  level?: string | number;
  number?: string | number;
  anchor?: string;
};

type ParseSectionsResponse = {
  parse?: {
    title?: string;
    tocdata?: {
      sections?: ParseSectionHeading[];
    };
    sections?: ParseSectionHeading[];
  };
};

type ParseSectionResponse = {
  parse?: {
    title?: string;
    text?: { ["*"]?: string } | string;
    wikitext?: { ["*"]?: string } | string;
  };
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
let requestQueue = Promise.resolve();
let nextRequestAt = 0;
let blockedUntil = 0;

const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_CACHE_TTL_MS = 30 * 60 * 1000;
const configuredInterval = Number(process.env.WIKIPEDIA_MIN_REQUEST_INTERVAL_MS ?? 1000);
const MIN_REQUEST_INTERVAL_MS = Number.isFinite(configuredInterval)
  ? Math.max(250, configuredInterval)
  : 1000;
const DEFAULT_USER_AGENT =
  "Sapiens/0.1 (https://github.com/soph-lin/sapiens; educational history game)";

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(value: string | null): number {
  if (!value) return 30000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, 30000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(timestamp - Date.now(), 30000)
    : 30000;
}

function rateLimitMessage(waitMilliseconds: number) {
  const waitSeconds = Math.ceil(waitMilliseconds / 1000);
  return `Wikipedia rate limit reached. Requests are paused for about ${waitSeconds}s; the client stopped retrying to avoid amplifying the limit. Reuse cached results or try again shortly.`;
}

function parseStarField(value: { ["*"]?: string } | string | undefined): string {
  if (typeof value === "string") return value;
  if (value && typeof value["*"] === "string") return value["*"];
  return "";
}

export class WikipediaClient {
  constructor(
    private readonly baseUrl = ORCHESTRATOR_CONFIG.wikipediaBaseUrl,
  ) {}

  private pageUrl(title: string): string {
    return `${this.baseUrl}/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
  }

  async getPage(title: string): Promise<WikipediaPage> {
    const page = await this.getCached<Omit<WikipediaPage, "sourceUrl"> & { sourceUrl?: string }>(
      `/w/rest.php/v1/page/${encodeURIComponent(title)}`,
      PAGE_CACHE_TTL_MS,
    );
    return {
      ...page,
      sourceUrl: page.sourceUrl || this.pageUrl(page.title || title),
    };
  }

  async getPageHtml(title: string): Promise<WikipediaHtmlPage> {
    const page = await this.getCached<
      Omit<WikipediaHtmlPage, "sourceUrl"> & { sourceUrl?: string; html_url?: string }
    >(
      `/w/rest.php/v1/page/${encodeURIComponent(title)}/with_html`,
      PAGE_CACHE_TTL_MS,
    );
    return {
      ...page,
      sourceUrl: page.sourceUrl || page.html_url || this.pageUrl(page.title || title),
    };
  }

  async searchPages(query: string, limit = 5): Promise<WikipediaSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(Math.max(limit, 1), 100)),
    });
    const result = await this.getCached<{ pages: WikipediaSearchResult[] }>(
      `/w/rest.php/v1/search/page?${params.toString()}`,
      CACHE_TTL_MS,
    );
    return result.pages.map((page) => ({
      ...page,
      url: `${this.baseUrl}/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    }));
  }

  /** Table of contents for a page. Index 0 is always the lead/summary. */
  async getPageSections(title: string): Promise<{
    title: string;
    sourceUrl: string;
    sections: WikipediaSectionInfo[];
  }> {
    const params = new URLSearchParams({
      action: "parse",
      page: title,
      prop: "tocdata",
      redirects: "1",
      format: "json",
      formatversion: "2",
    });
    const result = await this.getCached<ParseSectionsResponse>(
      `/w/api.php?${params.toString()}`,
      PAGE_CACHE_TTL_MS,
    );
    const parsedTitle = result.parse?.title?.trim() || title;
    const rawSections =
      result.parse?.tocdata?.sections ?? result.parse?.sections ?? [];
    const headings = rawSections
      .map((section): WikipediaSectionInfo | null => {
        const index = Number(section.index);
        if (!Number.isInteger(index) || index < 1) return null;
        const level = Number(section.hLevel ?? section.level) || 2;
        return {
          index,
          line: typeof section.line === "string" && section.line.trim()
            ? section.line.trim()
            : `Section ${index}`,
          level,
          number: section.number != null ? String(section.number) : String(index),
          anchor: typeof section.anchor === "string" ? section.anchor : undefined,
          isLead: false,
        };
      })
      .filter((section): section is WikipediaSectionInfo => section != null);

    return {
      title: parsedTitle,
      sourceUrl: this.pageUrl(parsedTitle),
      sections: [
        {
          index: 0,
          line: "Lead",
          level: 0,
          number: "0",
          isLead: true,
        },
        ...headings,
      ],
    };
  }

  /** Fetch one section. `sectionIndex` 0 is the lead/summary. */
  async getPageSection(title: string, sectionIndex: number): Promise<WikipediaSectionContent> {
    if (!Number.isInteger(sectionIndex) || sectionIndex < 0) {
      throw new Error("sectionIndex must be a non-negative integer");
    }
    const toc = await this.getPageSections(title);
    const meta = toc.sections.find((section) => section.index === sectionIndex);
    if (!meta) {
      throw new Error(
        `Wikipedia section ${sectionIndex} not found on "${toc.title}". Use wikipedia_list_sections first.`,
      );
    }

    const params = new URLSearchParams({
      action: "parse",
      page: title,
      prop: "text|wikitext",
      section: String(sectionIndex),
      redirects: "1",
      disabletoc: "1",
      format: "json",
      formatversion: "2",
    });
    const result = await this.getCached<ParseSectionResponse>(
      `/w/api.php?${params.toString()}`,
      PAGE_CACHE_TTL_MS,
    );
    const parsedTitle = result.parse?.title?.trim() || toc.title;
    return {
      title: parsedTitle,
      sourceUrl: this.pageUrl(parsedTitle),
      sectionIndex: meta.index,
      sectionLine: meta.line,
      level: meta.level,
      isLead: meta.isLead,
      html: parseStarField(result.parse?.text),
      wikitext: parseStarField(result.parse?.wikitext),
    };
  }

  async getRevisions(title: string, limit = 1): Promise<unknown> {
    const params = new URLSearchParams({
      action: "query",
      prop: "revisions",
      titles: title,
      rvprop: "ids|timestamp|content",
      rvslots: "main",
      rvlimit: String(limit),
      formatversion: "2",
      format: "json",
    });
    return this.getCached(
      `/w/api.php?${params.toString()}`,
      PAGE_CACHE_TTL_MS,
    );
  }

  private async getCached<T>(path: string, ttlMilliseconds: number): Promise<T> {
    const key = `${this.baseUrl}${path}`;
    const existing = cache.get(key);
    if (existing && existing.expiresAt > Date.now()) return existing.value as T;
    if (existing) cache.delete(key);

    const pending = inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const request = this.getJson<T>(path).then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMilliseconds });
      return value;
    });
    inFlight.set(key, request);
    try {
      return await request;
    } finally {
      inFlight.delete(key);
    }
  }

  private async getJson<T>(path: string): Promise<T> {
    const previous = requestQueue;
    let release!: () => void;
    requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      const now = Date.now();
      if (blockedUntil > now) {
        throw new Error(rateLimitMessage(blockedUntil - now));
      }

      const waitMilliseconds = nextRequestAt - now;
      if (waitMilliseconds > 0) await sleep(waitMilliseconds);

      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Accept: "application/json",
          "Api-User-Agent": process.env.WIKIPEDIA_USER_AGENT ?? DEFAULT_USER_AGENT,
          "User-Agent": process.env.WIKIPEDIA_USER_AGENT ?? DEFAULT_USER_AGENT,
        },
      });
      nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;

      if (response.ok) return (await response.json()) as T;

      if (response.status === 429 || response.status === 503) {
        const waitMilliseconds = retryAfterMilliseconds(
          response.headers.get("retry-after"),
        );
        blockedUntil = Date.now() + waitMilliseconds;
        throw new Error(
          response.status === 429
            ? rateLimitMessage(waitMilliseconds)
            : `Wikipedia is temporarily unavailable (503). Requests are paused for about ${Math.ceil(waitMilliseconds / 1000)}s.`,
        );
      }

      throw new Error(`Wikipedia request failed: ${response.status}`);
    } finally {
      release();
    }
  }
}
