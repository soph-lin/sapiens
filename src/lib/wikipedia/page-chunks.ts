import {
  DEFAULT_TEXT_CHUNK_CHARS,
  getTextChunk,
  type TextChunk,
} from "../util/text-chunks";
import type { WikipediaClient, WikipediaSectionInfo } from "../providers/wikipedia";

export type WikipediaSectionRead = TextChunk & {
  title: string;
  sourceUrl: string;
  sectionIndex: number;
  sectionLine: string;
  level: number;
  isLead: boolean;
};

export type ReadWikipediaSectionOptions = {
  title: string;
  /** 0 = lead/summary. Use wikipedia_list_sections for the TOC. */
  sectionIndex?: number;
  /** Secondary pagination when a single section exceeds the char budget. */
  chunkIndex?: number;
  chunkSize?: number;
};

/** Strip markup from Wikipedia HTML into plain text suitable for model context. */
export function readableWikipediaHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function listWikipediaSections(
  client: WikipediaClient,
  title: string,
): Promise<{
  title: string;
  sourceUrl: string;
  sections: WikipediaSectionInfo[];
}> {
  return client.getPageSections(title);
}

/**
 * Fetch one Wikipedia section as model-ready text.
 * Section 0 is always the lead/summary. Oversized sections are split with chunkIndex.
 */
export async function readWikipediaSection(
  client: WikipediaClient,
  options: ReadWikipediaSectionOptions,
): Promise<WikipediaSectionRead> {
  const title = options.title.trim();
  if (!title) throw new Error("Wikipedia page title is required");
  const sectionIndex = options.sectionIndex ?? 0;
  const chunkIndex = options.chunkIndex ?? 0;
  const chunkSize = options.chunkSize ?? DEFAULT_TEXT_CHUNK_CHARS;

  const section = await client.getPageSection(title, sectionIndex);
  const text =
    readableWikipediaHtml(section.html) ||
    section.wikitext.replace(/\{\{[^}]*\}\}/g, " ").replace(/\[\[([^|\]]*\|)?([^\]]+)\]\]/g, "$2").replace(/\s+/g, " ").trim();

  return {
    title: section.title,
    sourceUrl: section.sourceUrl,
    sectionIndex: section.sectionIndex,
    sectionLine: section.sectionLine,
    level: section.level,
    isLead: section.isLead,
    ...getTextChunk(text, chunkIndex, chunkSize),
  };
}

/** @deprecated Prefer readWikipediaSection. Kept for callers that only need lead text. */
export async function readWikipediaPageChunk(
  client: WikipediaClient,
  options: {
    title: string;
    chunkIndex?: number;
    chunkSize?: number;
  },
): Promise<WikipediaSectionRead> {
  return readWikipediaSection(client, {
    title: options.title,
    sectionIndex: 0,
    chunkIndex: options.chunkIndex,
    chunkSize: options.chunkSize,
  });
}
