import { ORCHESTRATOR_CONFIG } from "../config";
import type { AgentName, AgentProgressEvent } from "../types";
import type { WikipediaClient } from "../../providers/wikipedia";
import {
  listWikipediaSections,
  readWikipediaSection,
} from "../../wikipedia/page-chunks";

function requireTitle(raw: string): string {
  const parsed = JSON.parse(raw) as { title?: unknown };
  if (typeof parsed.title !== "string" || !parsed.title.trim()) {
    throw new Error("Wikipedia page title is required");
  }
  return parsed.title.trim();
}

function requireNonNegativeInt(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return parsed;
}

export type WikipediaSectionHandlersOptions = {
  agent: AgentName;
  wikipedia: WikipediaClient;
  emitProgress: (event: AgentProgressEvent) => void;
  chunkSize?: number;
};

/** Shared Wikipedia section readers for Researcher, Director, and later Writer. */
export function createWikipediaSectionHandlers(
  options: WikipediaSectionHandlersOptions,
): {
  wikipedia_list_sections: (raw: string) => Promise<unknown>;
  wikipedia_get_section: (raw: string) => Promise<unknown>;
} {
  const chunkSize = options.chunkSize ?? ORCHESTRATOR_CONFIG.pageChunkChars;

  return {
    wikipedia_list_sections: async (raw) => {
      const title = requireTitle(raw);
      options.emitProgress({
        agent: options.agent,
        phase: "tool",
        message: `Listing Wikipedia sections: ${title}`,
        tool: "wikipedia_list_sections",
        details: { title },
      });
      return listWikipediaSections(options.wikipedia, title);
    },
    wikipedia_get_section: async (raw) => {
      const parsed = JSON.parse(raw) as {
        title?: unknown;
        sectionIndex?: unknown;
        chunkIndex?: unknown;
      };
      if (typeof parsed.title !== "string" || !parsed.title.trim()) {
        throw new Error("Wikipedia page title is required");
      }
      const title = parsed.title.trim();
      const sectionIndex = requireNonNegativeInt(parsed.sectionIndex, "sectionIndex", 0);
      const chunkIndex = requireNonNegativeInt(parsed.chunkIndex, "chunkIndex", 0);
      const section = await readWikipediaSection(options.wikipedia, {
        title,
        sectionIndex,
        chunkIndex,
        chunkSize,
      });
      const sectionName = section.sectionLine?.trim();
      const partSuffix = chunkIndex > 0 ? ` (part ${chunkIndex + 1})` : "";
      options.emitProgress({
        agent: options.agent,
        phase: "tool",
        message: sectionName
          ? `Reading Wikipedia article "${section.title}" section ${section.sectionIndex}: "${sectionName}"${partSuffix}`
          : `Reading Wikipedia article "${section.title}" section ${section.sectionIndex}${partSuffix}`,
        tool: "wikipedia_get_section",
        details: {
          title: section.title,
          sectionIndex: section.sectionIndex,
          sectionLine: section.sectionLine,
          chunkIndex,
          isLead: section.isLead,
        },
      });
      return section;
    },
  };
}

/** @deprecated Use createWikipediaSectionHandlers. */
export const createWikipediaPageHandlers = createWikipediaSectionHandlers;
