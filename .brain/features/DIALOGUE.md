# Dialogue

Implement a dialogue graph for short interactive stories.

## Goals

- Support ~6 turns per story.
- Keep branching shallow; choices modify state and usually rejoin the main flow.
- Render text, choices, consequences, and endings.
- Validate story data before runtime.

## Types

```ts
type State = {
  reputation: number;
  safety: number;
  evidence: number;
  flags: Record<string, boolean>;
};

type Node = TextNode | ChoiceNode | SetNode | EndNode;

type TextNode = {
  type: "text";
  id: string;
  speaker?: string;
  text: string;
  next?: string;
  condition?: Condition;
};

type ChoiceNode = {
  type: "choice";
  id: string;
  prompt?: string;
  choices: Choice[];
};

type Choice = {
  label: string;
  next: string;
  effects?: Effect[];
  condition?: Condition;
};

type SetNode = {
  type: "set";
  id: string;
  effects: Effect[];
  next: string;
};

type EndNode = {
  type: "end";
  id: string;
  title: string;
  text: string;
};

type Effect = {
  variable: string;
  operation: "add" | "subtract" | "set";
  value: number | boolean;
};

type Condition = {
  variable: string;
  operator: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value: number | boolean;
};
```

## Runtime

1. Load and validate `{ start, nodes }`.
2. Initialize `State`.
3. Resolve the current node by ID.
4. Hide nodes/choices whose conditions fail.
5. Render text or choices.
6. On choice, apply effects and follow `next`.
7. Interpolate `{variable}` placeholders in text.
8. Stop at `EndNode`; expose final state for the debrief.

Use JSON story files. Keep the parser/simulation engine independent from React UI.
