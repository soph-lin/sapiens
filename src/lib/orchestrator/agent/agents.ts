import { readFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_CONFIG, type ConfiguredAgentName } from "../config";
import type { ToolDefinition } from "../types";

export async function loadAgentPrompt(agent: ConfiguredAgentName): Promise<string> {
  const promptPath = path.join(
    process.cwd(),
    "src",
    "lib",
    "prompts",
    AGENT_CONFIG[agent].promptFile,
  );
  return readFile(promptPath, "utf8");
}

export const wikipediaTools: ToolDefinition[] = [
  {
    type: "function",
    name: "wikipedia_search",
    description:
      "Search English Wikipedia page titles and contents for candidate historical event pages. Use concise historical terms, then inspect promising pages with wikipedia_list_sections and wikipedia_get_section.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "wikipedia_list_sections",
    description:
      "List the table of contents for an English Wikipedia page. Index 0 is always the lead/summary. Use the returned indexes with wikipedia_get_section.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "wikipedia_get_section",
    description:
      "Fetch one English Wikipedia section as plain text. sectionIndex 0 is the lead/summary. Choose other sections from wikipedia_list_sections. If hasMore is true, the section itself is long—call again with the same sectionIndex and nextChunkIndex.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        sectionIndex: {
          type: "integer",
          description: "Section index from wikipedia_list_sections. 0 = lead/summary.",
        },
        chunkIndex: {
          type: "integer",
          description:
            "Secondary pagination within an oversized section. Pass 0 first, then nextChunkIndex while hasMore is true.",
        },
      },
      required: ["title", "sectionIndex", "chunkIndex"],
      additionalProperties: false,
    },
    strict: true,
  },
];

/**
 * Build the OpenAI Responses API web-search tool. Restricted classroom runs
 * pass their approved domains here so the provider filters search results
 * before they reach the researcher.
 */
export function webSearchTool(allowedDomains?: string[]): ToolDefinition {
  const domains = allowedDomains?.filter(Boolean);
  return {
    type: "web_search",
    ...(domains?.length
      ? { filters: { allowed_domains: domains } }
      : {}),
  };
}

export const pixelLabTools: ToolDefinition[] = [
  {
    type: "function",
    name: "pixellab_create_portrait",
    description:
      "Submit a PixelLab portrait generation job. The API call is fixed to 128x128, south-east direction, transparent background, and shoulder-up portrait framing.",
    parameters: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "pixellab_create_character",
    description:
      "Create a reusable PixelLab v3 humanoid character with an optional eight-direction rotation set. The API call is fixed to 48x48, highly detailed, default outline, low top-down view, mannequin humanoid template, transparent background, and v3 generation.",
    parameters: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "pixellab_create_collectible",
    description:
      "Submit a PixelLab collectible generation request. The API call is fixed to 32x32 with a transparent background.",
    parameters: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
      additionalProperties: false,
    },
  },
];
