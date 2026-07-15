type JsonSchema = Record<string, unknown>;

const nonEmptyString = (description: string): JsonSchema => ({
  type: "string",
  description,
});

const numericOrBoolean: JsonSchema = {
  anyOf: [{ type: "number" }, { type: "boolean" }],
};

const conditionSchema: JsonSchema = {
  type: "object",
  properties: {
    variable: nonEmptyString("A stat name or a flags.<name> boolean variable."),
    operator: {
      type: "string",
      enum: ["==", "!=", ">", ">=", "<", "<="],
    },
    value: numericOrBoolean,
  },
  required: ["variable", "operator", "value"],
  additionalProperties: false,
};

const effectSchema: JsonSchema = {
  type: "object",
  properties: {
    variable: nonEmptyString("A stat name or a flags.<name> boolean variable."),
    operation: {
      type: "string",
      enum: ["add", "subtract", "set"],
    },
    value: numericOrBoolean,
  },
  required: ["variable", "operation", "value"],
  additionalProperties: false,
};

const choiceSchema: JsonSchema = {
  type: "object",
  properties: {
    label: nonEmptyString("The player's non-empty choice label or action."),
    next: nonEmptyString("The ID of the node reached by this choice."),
    effects: {
      type: "array",
      items: effectSchema,
    },
    condition: conditionSchema,
  },
  required: ["label", "next"],
  additionalProperties: false,
};

const textNodeSchema: JsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["text"] },
    id: nonEmptyString("The node ID; it must match its key in nodes."),
    speaker: nonEmptyString("Optional speaker label; omit it for narration."),
    text: nonEmptyString("Non-empty narration or spoken dialogue."),
    next: nonEmptyString("Optional ID of the next node."),
    condition: conditionSchema,
  },
  required: ["type", "id", "text"],
  additionalProperties: false,
};

const choiceNodeSchema: JsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["choice"] },
    id: nonEmptyString("The node ID; it must match its key in nodes."),
    prompt: nonEmptyString(
      "Optional non-empty question shown above the choices; omit it when the default is appropriate.",
    ),
    choices: {
      type: "array",
      items: choiceSchema,
    },
    next: nonEmptyString("Optional fallback ID when all choices are hidden."),
  },
  required: ["type", "id", "choices"],
  additionalProperties: false,
};

const setNodeSchema: JsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["set"] },
    id: nonEmptyString("The node ID; it must match its key in nodes."),
    effects: {
      type: "array",
      items: effectSchema,
    },
    next: nonEmptyString("The ID of the next node."),
  },
  required: ["type", "id", "effects", "next"],
  additionalProperties: false,
};

const endNodeSchema: JsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["end"] },
    id: nonEmptyString("The node ID; it must match its key in nodes."),
    title: nonEmptyString("The non-empty ending title."),
    text: nonEmptyString("The non-empty ending debrief."),
  },
  required: ["type", "id", "title", "text"],
  additionalProperties: false,
};

const nodeSchema: JsonSchema = {
  anyOf: [textNodeSchema, choiceNodeSchema, setNodeSchema, endNodeSchema],
};

const metadataSchema: JsonSchema = {
  type: "object",
  properties: {
    stats: {
      type: "boolean",
      description: "Set true when the story references numeric variables.",
    },
    statDefaults: {
      type: "array",
      description:
        "Optional numeric starting values as {key, value} entries; requires stats: true.",
      items: {
        type: "object",
        properties: {
          key: nonEmptyString("The numeric stat name."),
          value: { type: "number" },
        },
        required: ["key", "value"],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

export const storyJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    metadata: metadataSchema,
    start: nonEmptyString("The ID of the opening node."),
    nodes: {
      type: "array",
      description:
        "Provider transport form: node objects with IDs. The app converts this to its runtime ID map.",
      items: nodeSchema,
    },
  },
  required: ["start", "nodes"],
  additionalProperties: false,
};

export const writerOutputJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    dialogue: storyJsonSchema,
    embellish: {
      type: "array",
      description: "Invented, compressed, composite, or dramatized details and their purpose.",
      items: {
        type: "object",
        properties: {
          detail: nonEmptyString("The invented, compressed, composite, or dramatized detail."),
          purpose: nonEmptyString("Why this detail serves the scene."),
          affected: nonEmptyString("The affected character or scene."),
        },
        required: ["detail", "purpose", "affected"],
        additionalProperties: false,
      },
    },
  },
  required: ["dialogue", "embellish"],
  additionalProperties: false,
};
