type JsonSchema = Record<string, unknown>;

// Anthropic compiles native structured-output schemas into a grammar. Keep the
// Writer transport intentionally shallow: the runtime validates the full story
// after decoding these two JSON strings.
const sourceSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    url: { type: "string" },
    kind: { type: "string", enum: ["article", "video"] },
  },
  required: ["title", "url", "kind"],
  additionalProperties: false,
};

export const storyJsonSchema: JsonSchema = {
  type: "string",
};

export const writerOutputJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    dialogue: { type: "string" },
    reportText: { type: "string" },
    sources: { type: "array", items: sourceSchema },
    furtherReading: { type: "array", items: sourceSchema },
  },
  required: ["dialogue", "reportText", "sources", "furtherReading"],
  additionalProperties: false,
};
