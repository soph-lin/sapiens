export type StatKey = string;

export type VoyageStats = Record<StatKey, number>;

/**
 * Dialogue runtime state. Numeric story variables are stored in `stats` when
 * the story opts in via `metadata.stats: true`.
 */
export type State = {
  flags: Record<string, boolean>;
  stats: VoyageStats;
};

export type StoryMetadata = {
  /** When true, numeric variables referenced by the story are tracked in State.stats. */
  stats?: boolean;
  /** Optional starting values for dynamically discovered numeric variables. */
  statDefaults?: Record<string, number>;
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

export type DialogueHistoryEntry = {
  nodeId: string;
  kind: Presentable["kind"];
  speaker?: string;
  title?: string;
  text: string;
  choices?: string[];
  selectedChoice?: string;
  state: State;
};
