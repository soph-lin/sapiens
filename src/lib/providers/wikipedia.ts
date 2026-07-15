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

type CacheEntry = {
  value: unknown;
  expiresAt: number;
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

export class WikipediaClient {
  constructor(
    private readonly baseUrl = ORCHESTRATOR_CONFIG.wikipediaBaseUrl,
  ) {}

  async getPage(title: string): Promise<WikipediaPage> {
    return this.getCached<WikipediaPage>(
      `/w/rest.php/v1/page/${encodeURIComponent(title)}`,
      PAGE_CACHE_TTL_MS,
    );
  }

  async getPageHtml(title: string): Promise<WikipediaHtmlPage> {
    return this.getCached<WikipediaHtmlPage>(
      `/w/rest.php/v1/page/${encodeURIComponent(title)}/with_html`,
      PAGE_CACHE_TTL_MS,
    );
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
