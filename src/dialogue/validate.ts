import type {
  Choice,
  ChoiceNode,
  Condition,
  Effect,
  EndNode,
  Node,
  SetNode,
  Story,
  StoryMetadata,
  TextNode,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return assertString(value, label);
}

function validateEffect(raw: unknown, label: string): Effect {
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  const variable = assertString(raw.variable, `${label}.variable`);
  const operation = raw.operation;
  if (
    operation !== "add" &&
    operation !== "subtract" &&
    operation !== "set"
  ) {
    throw new Error(`${label}.operation must be add | subtract | set`);
  }
  const value = raw.value;
  if (typeof value !== "number" && typeof value !== "boolean") {
    throw new Error(`${label}.value must be a number or boolean`);
  }
  return { variable, operation, value };
}

function validateCondition(raw: unknown, label: string): Condition {
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  const variable = assertString(raw.variable, `${label}.variable`);
  const operator = raw.operator;
  if (
    operator !== "==" &&
    operator !== "!=" &&
    operator !== ">" &&
    operator !== ">=" &&
    operator !== "<" &&
    operator !== "<="
  ) {
    throw new Error(`${label}.operator is invalid`);
  }
  const value = raw.value;
  if (typeof value !== "number" && typeof value !== "boolean") {
    throw new Error(`${label}.value must be a number or boolean`);
  }
  return { variable, operator, value };
}

function validateChoice(raw: unknown, label: string): Choice {
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  const choice: Choice = {
    label: assertString(raw.label, `${label}.label`),
    next: assertString(raw.next, `${label}.next`),
  };
  if (raw.effects !== undefined) {
    if (!Array.isArray(raw.effects)) {
      throw new Error(`${label}.effects must be an array`);
    }
    choice.effects = raw.effects.map((effect, i) =>
      validateEffect(effect, `${label}.effects[${i}]`),
    );
  }
  if (raw.condition !== undefined) {
    choice.condition = validateCondition(raw.condition, `${label}.condition`);
  }
  return choice;
}

function validateTextNode(raw: Record<string, unknown>, id: string): TextNode {
  const node: TextNode = {
    type: "text",
    id,
    text: assertString(raw.text, `nodes.${id}.text`),
  };
  const speaker = assertOptionalString(raw.speaker, `nodes.${id}.speaker`);
  if (speaker) node.speaker = speaker;
  const next = assertOptionalString(raw.next, `nodes.${id}.next`);
  if (next) node.next = next;
  if (raw.condition !== undefined) {
    node.condition = validateCondition(raw.condition, `nodes.${id}.condition`);
  }
  return node;
}

function validateChoiceNode(
  raw: Record<string, unknown>,
  id: string,
): ChoiceNode {
  if (!Array.isArray(raw.choices) || raw.choices.length === 0) {
    throw new Error(`nodes.${id}.choices must be a non-empty array`);
  }
  const node: ChoiceNode = {
    type: "choice",
    id,
    choices: raw.choices.map((choice, i) =>
      validateChoice(choice, `nodes.${id}.choices[${i}]`),
    ),
  };
  const prompt = assertOptionalString(raw.prompt, `nodes.${id}.prompt`);
  if (prompt) node.prompt = prompt;
  const next = assertOptionalString(raw.next, `nodes.${id}.next`);
  if (next) node.next = next;
  return node;
}

function validateSetNode(raw: Record<string, unknown>, id: string): SetNode {
  if (!Array.isArray(raw.effects) || raw.effects.length === 0) {
    throw new Error(`nodes.${id}.effects must be a non-empty array`);
  }
  return {
    type: "set",
    id,
    effects: raw.effects.map((effect, i) =>
      validateEffect(effect, `nodes.${id}.effects[${i}]`),
    ),
    next: assertString(raw.next, `nodes.${id}.next`),
  };
}

function validateEndNode(raw: Record<string, unknown>, id: string): EndNode {
  return {
    type: "end",
    id,
    title: assertString(raw.title, `nodes.${id}.title`),
    text: assertString(raw.text, `nodes.${id}.text`),
  };
}

function validateNode(raw: unknown, id: string): Node {
  if (!isRecord(raw)) throw new Error(`nodes.${id} must be an object`);
  const type = raw.type;
  if (type === "text") return validateTextNode(raw, id);
  if (type === "choice") return validateChoiceNode(raw, id);
  if (type === "set") return validateSetNode(raw, id);
  if (type === "end") return validateEndNode(raw, id);
  throw new Error(`nodes.${id}.type must be text | choice | set | end`);
}

function validateMetadata(raw: unknown): StoryMetadata | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("metadata must be an object");

  const metadata: StoryMetadata = {};
  if (raw.stats !== undefined) {
    if (typeof raw.stats !== "boolean") {
      throw new Error("metadata.stats must be a boolean");
    }
    metadata.stats = raw.stats;
  }
  return metadata;
}

/** Validate story data and return a typed Story. Throws on invalid shape. */
export function validateStory(raw: unknown): Story {
  if (!isRecord(raw)) throw new Error("Story must be an object");

  const start = assertString(raw.start, "start");
  if (!isRecord(raw.nodes)) throw new Error("nodes must be an object");

  const nodes: Record<string, Node> = {};
  for (const [id, nodeRaw] of Object.entries(raw.nodes)) {
    const node = validateNode(nodeRaw, id);
    if (node.id !== id) {
      throw new Error(`Node key "${id}" does not match node.id "${node.id}"`);
    }
    nodes[id] = node;
  }

  if (!(start in nodes)) {
    throw new Error(`start "${start}" is not a known node`);
  }

  for (const node of Object.values(nodes)) {
    if (node.type === "text" && node.next && !(node.next in nodes)) {
      throw new Error(`nodes.${node.id}.next "${node.next}" is missing`);
    }
    if (node.type === "set" && !(node.next in nodes)) {
      throw new Error(`nodes.${node.id}.next "${node.next}" is missing`);
    }
    if (node.type === "choice") {
      if (node.next && !(node.next in nodes)) {
        throw new Error(`nodes.${node.id}.next "${node.next}" is missing`);
      }
      for (const [i, choice] of node.choices.entries()) {
        if (!(choice.next in nodes)) {
          throw new Error(
            `nodes.${node.id}.choices[${i}].next "${choice.next}" is missing`,
          );
        }
      }
    }
  }

  const metadata = validateMetadata(raw.metadata);
  const story: Story = { start, nodes };
  if (metadata) story.metadata = metadata;
  return story;
}
