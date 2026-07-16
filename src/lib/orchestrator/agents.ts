import { readFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_CONFIG, type ConfiguredAgentName } from "./config";
import type { ToolDefinition } from "./types";

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
      "Search English Wikipedia page titles and contents for candidate historical event pages. Use concise historical terms, then fetch promising results with wikipedia_get_page or wikipedia_get_page_html.",
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
    name: "wikipedia_get_page",
    description: "Fetch the current English Wikipedia page source and metadata for a title.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "wikipedia_get_page_html",
    description: "Fetch the current rendered HTML and metadata for an English Wikipedia page.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    },
    strict: true,
  },
];

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
