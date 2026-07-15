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

function isFlagVariable(variable: string): boolean {
  return variable.startsWith("flags.");
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

function assertVariable(value: unknown, label: string): string {
  const variable = assertString(value, label);
  if (isFlagVariable(variable) && variable.length === "flags.".length) {
    throw new Error(`${label} must include a flag name after flags.`);
  }
  return variable;
}

function validateEffect(raw: unknown, label: string): Effect {
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  const variable = assertVariable(raw.variable, `${label}.variable`);
  const operation = raw.operation;
  if (
    operation !== "add" &&
    operation !== "subtract" &&
    operation !== "set"
  ) {
    throw new Error(`${label}.operation must be add | subtract | set`);
  }
  const value = raw.value;
  if (operation === "set" && isFlagVariable(variable) && typeof value !== "boolean") {
    throw new Error(`${label}.value must be a boolean for flag variables`);
  }
  if (operation === "set" && !isFlagVariable(variable) && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label}.value must be a finite number for stat variables`);
  }
  if (operation !== "set" && (isFlagVariable(variable) || typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label} add/subtract effects require finite numeric stat variables`);
  }
  return {
    variable,
    operation,
    value: isFlagVariable(variable) ? value as boolean : value as number,
  };
}

function validateCondition(raw: unknown, label: string): Condition {
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  const variable = assertVariable(raw.variable, `${label}.variable`);
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
  if (isFlagVariable(variable) && typeof value !== "boolean") {
    throw new Error(`${label}.value must be a boolean for flag variables`);
  }
  if (!isFlagVariable(variable) && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label}.value must be a finite number for stat variables`);
  }
  return {
    variable,
    operator,
    value: isFlagVariable(variable) ? value as boolean : value as number,
  };
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
  if (raw.statDefaults !== undefined) {
    if (!isRecord(raw.statDefaults)) throw new Error("statDefaults must be an object");
    const statDefaults: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw.statDefaults)) {
      if (!key || typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`statDefaults.${key} must be a finite number`);
      }
      statDefaults[key] = value;
    }
    if (metadata.stats !== true) {
      throw new Error("statDefaults requires metadata.stats: true");
    }
    metadata.statDefaults = statDefaults;
  }
  return metadata;
}

function collectInterpolationVariables(text: string, variables: Set<string>): void {
  for (const match of text.matchAll(/\{([a-zA-Z0-9_.]+)\}/g)) {
    variables.add(match[1]);
  }
}

function collectStoryVariables(nodes: Record<string, Node>): Set<string> {
  const variables = new Set<string>();
  const collectCondition = (condition?: Condition) => {
    if (condition) variables.add(condition.variable);
  };
  const collectEffect = (effect: Effect) => variables.add(effect.variable);

  for (const node of Object.values(nodes)) {
    if (node.type === "text") {
      collectCondition(node.condition);
      collectInterpolationVariables(node.text, variables);
      if (node.speaker) collectInterpolationVariables(node.speaker, variables);
    } else if (node.type === "choice") {
      collectInterpolationVariables(node.prompt ?? "", variables);
      node.choices.forEach((choice) => {
        collectCondition(choice.condition);
        collectInterpolationVariables(choice.label, variables);
        choice.effects?.forEach(collectEffect);
      });
    } else if (node.type === "set") {
      node.effects.forEach(collectEffect);
    } else {
      collectInterpolationVariables(node.title, variables);
      collectInterpolationVariables(node.text, variables);
    }
  }

  return variables;
}

export function getStoryStatKeys(story: Pick<Story, "nodes">): string[] {
  return [...collectStoryVariables(story.nodes)].filter(
    (variable) => !isFlagVariable(variable),
  );
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
  const statVariables = getStoryStatKeys({ nodes });
  if (statVariables.length > 0 && metadata?.stats !== true) {
    throw new Error(
      `Story uses numeric variables (${statVariables.join(", ")}) but metadata.stats is not true`,
    );
  }
  const story: Story = { start, nodes };
  if (metadata) story.metadata = metadata;
  return story;
}

/** Accept a raw story or the Writer's { dialogue, embellish } payload. */
export function validateStoryPayload(raw: unknown): Story {
  if (isRecord(raw) && ("start" in raw || "nodes" in raw)) {
    return validateStory(raw);
  }
  if (isRecord(raw) && raw.dialogue !== undefined) {
    return validateStory(raw.dialogue);
  }
  return validateStory(raw);
}
