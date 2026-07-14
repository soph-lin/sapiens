export type StatKey = "reputation" | "evidence" | "safety";

export const STAT_KEYS: StatKey[] = ["reputation", "evidence", "safety"];

export type VoyageStats = {
  reputation: number;
  safety: number;
  evidence: number;
};

/**
 * Dialogue runtime state. Voyage meters (`reputation` / `evidence` / `safety`)
 * are only present when the story opts in via `metadata.stats: true`.
 */
export type State = {
  flags: Record<string, boolean>;
  reputation?: number;
  safety?: number;
  evidence?: number;
};

export type StoryMetadata = {
  /**
   * When true, track reputation / evidence / safety.
   * Omitted or false: flags only (canon / framing dialogue).
   */
  stats?: boolean;
};

export type Effect = {
  variable: string;
  operation: "add" | "subtract" | "set";
  value: number | boolean;
};

export type Condition = {
  variable: string;
  operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value: number | boolean;
};

export type TextNode = {
  type: "text";
  id: string;
  speaker?: string;
  text: string;
  next?: string;
  condition?: Condition;
};

export type Choice = {
  label: string;
  next: string;
  effects?: Effect[];
  condition?: Condition;
};

export type ChoiceNode = {
  type: "choice";
  id: string;
  prompt?: string;
  choices: Choice[];
  /** When every choice is hidden by conditions, continue here. */
  next?: string;
};

export type SetNode = {
  type: "set";
  id: string;
  effects: Effect[];
  next: string;
};

export type EndNode = {
  type: "end";
  id: string;
  title: string;
  text: string;
};

export type Node = TextNode | ChoiceNode | SetNode | EndNode;

export type Story = {
  start: string;
  nodes: Record<string, Node>;
  metadata?: StoryMetadata;
};

export type PresentableChoice = {
  index: number;
  label: string;
};

export type PresentableText = {
  kind: "text";
  id: string;
  speaker?: string;
  text: string;
  canAdvance: boolean;
};

export type PresentableChoiceView = {
  kind: "choice";
  id: string;
  prompt?: string;
  choices: PresentableChoice[];
};

export type PresentableEnd = {
  kind: "end";
  id: string;
  title: string;
  text: string;
  state: State;
  showStats: boolean;
};

export type Presentable =
  | PresentableText
  | PresentableChoiceView
  | PresentableEnd;
