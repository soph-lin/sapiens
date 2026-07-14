import type {
  Condition,
  Effect,
  Node,
  Presentable,
  PresentableChoice,
  State,
  Story,
} from "./types";
import { validateStory } from "./validate";

const DEFAULT_STATE: State = {
  reputation: 0,
  safety: 50,
  evidence: 0,
  flags: {},
};

function cloneState(state: State): State {
  return {
    reputation: state.reputation,
    safety: state.safety,
    evidence: state.evidence,
    flags: { ...state.flags },
  };
}

function readVariable(state: State, variable: string): number | boolean {
  if (variable === "reputation") return state.reputation;
  if (variable === "safety") return state.safety;
  if (variable === "evidence") return state.evidence;
  if (variable.startsWith("flags.")) {
    const key = variable.slice("flags.".length);
    return state.flags[key] ?? false;
  }
  throw new Error(`Unknown variable "${variable}"`);
}

function writeVariable(
  state: State,
  variable: string,
  value: number | boolean,
): void {
  if (variable === "reputation" || variable === "safety" || variable === "evidence") {
    if (typeof value !== "number") {
      throw new Error(`Variable "${variable}" expects a number`);
    }
    state[variable] = value;
    return;
  }
  if (variable.startsWith("flags.")) {
    const key = variable.slice("flags.".length);
    if (typeof value !== "boolean") {
      throw new Error(`Flag "${key}" expects a boolean`);
    }
    state.flags[key] = value;
    return;
  }
  throw new Error(`Unknown variable "${variable}"`);
}

export function applyEffect(state: State, effect: Effect): void {
  const current = readVariable(state, effect.variable);

  if (effect.operation === "set") {
    writeVariable(state, effect.variable, effect.value);
    return;
  }

  if (typeof current !== "number" || typeof effect.value !== "number") {
    throw new Error(
      `Operation "${effect.operation}" requires numeric variable and value`,
    );
  }

  const next =
    effect.operation === "add"
      ? current + effect.value
      : current - effect.value;
  writeVariable(state, effect.variable, next);
}

export function evaluateCondition(state: State, condition: Condition): boolean {
  const left = readVariable(state, condition.variable);
  const right = condition.value;

  switch (condition.operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return typeof left === "number" && typeof right === "number" && left > right;
    case ">=":
      return typeof left === "number" && typeof right === "number" && left >= right;
    case "<":
      return typeof left === "number" && typeof right === "number" && left < right;
    case "<=":
      return typeof left === "number" && typeof right === "number" && left <= right;
  }
}

export function interpolate(text: string, state: State): string {
  return text.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, variable: string) => {
    try {
      return String(readVariable(state, variable));
    } catch {
      return `{${variable}}`;
    }
  });
}

function conditionPasses(state: State, condition?: Condition): boolean {
  if (!condition) return true;
  return evaluateCondition(state, condition);
}

export class DialogueEngine {
  private readonly story: Story;
  private state: State;
  private currentId: string;
  private ended = false;

  constructor(rawStory: unknown, initialState: Partial<State> = {}) {
    this.story = validateStory(rawStory);
    this.state = {
      ...cloneState(DEFAULT_STATE),
      ...initialState,
      flags: {
        ...DEFAULT_STATE.flags,
        ...(initialState.flags ?? {}),
      },
    };
    this.currentId = this.story.start;
    this.resolveToPresentable();
  }

  getState(): State {
    return cloneState(this.state);
  }

  isEnded(): boolean {
    return this.ended;
  }

  present(): Presentable {
    return this.toPresentable(this.requireNode(this.currentId));
  }

  advance(): Presentable {
    if (this.ended) return this.present();

    const node = this.requireNode(this.currentId);
    if (node.type !== "text") {
      throw new Error(`Cannot advance from node type "${node.type}"`);
    }
    if (!node.next) {
      throw new Error(`Text node "${node.id}" has no next`);
    }

    this.currentId = node.next;
    this.resolveToPresentable();
    return this.present();
  }

  choose(choiceIndex: number): Presentable {
    if (this.ended) return this.present();

    const node = this.requireNode(this.currentId);
    if (node.type !== "choice") {
      throw new Error(`Cannot choose from node type "${node.type}"`);
    }

    const available = this.visibleChoices(node);
    const selected = available.find((choice) => choice.index === choiceIndex);
    if (!selected) {
      throw new Error(`Choice index ${choiceIndex} is not available`);
    }

    const choice = node.choices[choiceIndex];
    if (choice.effects) {
      for (const effect of choice.effects) applyEffect(this.state, effect);
    }

    this.currentId = choice.next;
    this.resolveToPresentable();
    return this.present();
  }

  private requireNode(id: string): Node {
    const node = this.story.nodes[id];
    if (!node) throw new Error(`Missing node "${id}"`);
    return node;
  }

  private visibleChoices(node: Extract<Node, { type: "choice" }>): PresentableChoice[] {
    return node.choices
      .map((choice, index) => ({ choice, index }))
      .filter(({ choice }) => conditionPasses(this.state, choice.condition))
      .map(({ choice, index }) => ({
        index,
        label: interpolate(choice.label, this.state),
      }));
  }

  private resolveToPresentable(): void {
    // Auto-apply set nodes and skip text nodes that fail their conditions.
    // Guard against cycles.
    const seen = new Set<string>();
    while (!this.ended) {
      if (seen.has(this.currentId)) {
        throw new Error(`Cycle detected at node "${this.currentId}"`);
      }
      seen.add(this.currentId);

      const node = this.requireNode(this.currentId);

      if (node.type === "set") {
        for (const effect of node.effects) applyEffect(this.state, effect);
        this.currentId = node.next;
        continue;
      }

      if (node.type === "text") {
        if (!conditionPasses(this.state, node.condition)) {
          if (!node.next) {
            throw new Error(
              `Text node "${node.id}" failed its condition and has no next`,
            );
          }
          this.currentId = node.next;
          continue;
        }
        return;
      }

      if (node.type === "choice") {
        const visible = this.visibleChoices(node);
        if (visible.length === 0) {
          throw new Error(`Choice node "${node.id}" has no available choices`);
        }
        return;
      }

      // end
      this.ended = true;
      return;
    }
  }

  private toPresentable(node: Node): Presentable {
    if (node.type === "text") {
      return {
        kind: "text",
        id: node.id,
        speaker: node.speaker,
        text: interpolate(node.text, this.state),
        canAdvance: Boolean(node.next),
      };
    }

    if (node.type === "choice") {
      return {
        kind: "choice",
        id: node.id,
        prompt: node.prompt
          ? interpolate(node.prompt, this.state)
          : undefined,
        choices: this.visibleChoices(node),
      };
    }

    if (node.type === "end") {
      return {
        kind: "end",
        id: node.id,
        title: interpolate(node.title, this.state),
        text: interpolate(node.text, this.state),
        state: this.getState(),
      };
    }

    throw new Error(`Node "${node.id}" is not presentable`);
  }
}
