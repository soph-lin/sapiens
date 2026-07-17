"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { Presentable } from "@/lib/dialogue";
import {
  BACKEND_ERROR_LABELS,
  pickRandomLabel,
} from "@/lib/game/home-errors";
import {
  firstGreetingQuestion,
  pickFirstGreetingMode,
  returningGreetingQuestion,
  type FirstGreetingMode,
} from "@/lib/orchestrator/agent/actor-greeting";
import { getTimeOfDay, type TimeOfDay } from "@/lib/util";

export const NPC_DIALOGUE_OPTIONS = [
  "Tell me about your work.",
  "What was your world like?",
  "What should I understand about your time?",
] as const;

export const NPC_FREE_TEXT_OPTION = "";

export type NpcDialogueActor = {
  characterId: string;
  id: string;
  name: string;
  portraitUrl?: string | null;
};

export type NpcDialogueTypingGateRef = {
  current: {
    done: boolean;
    skip: () => void;
  };
};

export type NpcDialogueView = {
  characterPortrait?: { name: string; assetUrl?: string };
  freeChat?: {
    isThinking: boolean;
    label: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder: string;
    value: string;
  };
  key: number;
  npcName: string;
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onClose: () => void;
  onRestart: () => void;
  typingGateRef: NpcDialogueTypingGateRef;
  view: Presentable;
};

type ConversationEntry = {
  content: string;
  role: "character" | "learner";
};

type NpcInteractionState = {
  actorConversation: ConversationEntry[];
  hasMet: boolean;
};

type ChatResponse = {
  answer?: string;
  fieldNoteId?: string;
  followUps?: string[];
  progress?: Array<{
    agent?: string;
    phase?: string;
    message?: string;
    tool?: string;
    details?: Record<string, unknown>;
  }>;
  error?: string;
};

type ProgressEntry = NonNullable<ChatResponse["progress"]>[number];

type ChoiceMenu = "topics" | "followup" | "more";

type NpcDialogueState = {
  actorConversation: ConversationEntry[];
  choiceMenu: ChoiceMenu | null;
  dialogueIndex: number;
  dialogueNodes: string[];
  /** After greeting beats, open predetermined topics; after Q&A, open followup menu. */
  finishWith: "topics" | "followup";
  freeChatOpen: boolean;
  /** Free text from the "Tell me more" screen starts a fresh conversation thread. */
  freeChatStartsNewThread: boolean;
  freeChatValue: string;
  isThinking: boolean;
  key: number;
  npc: NpcDialogueActor;
  suggestedFollowUps: string[];
  view: Presentable;
};

function splitActorBeats(answer: string): string[] {
  const nodes = answer
    .split(/\s*\|\|\|\s*/)
    .map((node) => node.trim())
    .filter(Boolean);
  return nodes.length > 0 ? nodes : [answer.trim()];
}

function textView(
  id: string,
  text: string,
  canAdvance: boolean,
): Presentable {
  // Speaker lives in the map dialogue chrome (`npcName`); omit here to avoid a duplicate label.
  return { kind: "text", id, text, canAdvance };
}

function topicChoiceView(): Presentable {
  return {
    kind: "choice",
    id: "npc-topics",
    prompt: "What do you want to ask?",
    choices: NPC_DIALOGUE_OPTIONS.map((label, index) => ({ index, label })),
  };
}

function followupChoiceView(): Presentable {
  return {
    kind: "choice",
    id: "npc-followup",
    prompt: "What do you say?",
    choices: [
      { index: 0, label: "Tell me more." },
      { index: 1, label: "..." },
    ],
  };
}

function moreChoiceView(followUps: string[]): Presentable {
  return {
    kind: "choice",
    id: "npc-more",
    prompt: "What do you want to ask?",
    choices: followUps.map((label, index) => ({ index, label })),
  };
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  if (!block) return null;
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

async function requestActorChat(
  endpoint: string,
  body: unknown,
  fallbackError: string,
  onProgress?: (entries: ProgressEntry[]) => void,
): Promise<ChatResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  // Validation / early failures may still return JSON.
  if (!contentType.includes("text/event-stream")) {
    const payload = (await response.json()) as ChatResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? fallbackError);
    }
    if (payload.progress?.length) onProgress?.(payload.progress);
    return payload;
  }

  if (!response.ok || !response.body) {
    throw new Error(fallbackError);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ChatResponse | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const rawBlock of blocks) {
      const parsed = parseSseBlock(rawBlock.trim());
      if (!parsed) continue;
      const data = parsed.data;
      if (parsed.event === "progress" && data && typeof data === "object") {
        onProgress?.([data as ProgressEntry]);
      } else if (parsed.event === "result" && data && typeof data === "object") {
        result = data as ChatResponse;
      } else if (parsed.event === "error" && data && typeof data === "object") {
        const record = data as Record<string, unknown>;
        streamError =
          typeof record.error === "string" ? record.error : fallbackError;
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error(fallbackError);
  return result;
}

export function useNpcDialogue({
  onFieldNoteAdded,
  onProgress,
}: {
  onFieldNoteAdded?: (noteId: string) => void;
  onProgress?: (entries: ChatResponse["progress"]) => void;
} = {}) {
  const [dialogue, setDialogue] = useState<NpcDialogueState | null>(null);
  const onFieldNoteAddedRef = useRef(onFieldNoteAdded);
  const onProgressRef = useRef(onProgress);
  const dialogueRef = useRef<NpcDialogueState | null>(null);
  const npcInteractionStateRef = useRef(new Map<string, NpcInteractionState>());
  const dialogueSessionRef = useRef(0);
  const dialogueOpenRef = useRef(false);
  const typingGateRef = useRef<NpcDialogueTypingGateRef["current"]>({
    done: true,
    skip: () => undefined,
  });

  useEffect(() => {
    onFieldNoteAddedRef.current = onFieldNoteAdded;
  }, [onFieldNoteAdded]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const updateDialogue = useCallback((
    updater: (current: NpcDialogueState) => NpcDialogueState,
  ) => {
    setDialogue((current) => {
      if (!current) return current;
      const next = updater(current);
      dialogueRef.current = next;
      return next;
    });
  }, []);

  const closeDialogue = useCallback(() => {
    dialogueSessionRef.current += 1;
    dialogueOpenRef.current = false;
    dialogueRef.current = null;
    setDialogue(null);
  }, []);

  const openChoiceMenu = useCallback((
    menu: ChoiceMenu,
    extras: Partial<NpcDialogueState> = {},
  ) => {
    updateDialogue((state) => {
      const suggestedFollowUps = extras.suggestedFollowUps ?? state.suggestedFollowUps;
      const view =
        menu === "topics"
          ? topicChoiceView()
          : menu === "more"
            ? moreChoiceView(suggestedFollowUps)
            : followupChoiceView();
      return {
        ...state,
        ...extras,
        choiceMenu: menu,
        dialogueIndex: 0,
        dialogueNodes: [],
        freeChatOpen: true,
        freeChatStartsNewThread: menu === "more",
        freeChatValue: "",
        isThinking: false,
        key: state.key + 1,
        suggestedFollowUps,
        view,
      };
    });
  }, [updateDialogue]);

  const requestActorResponse = useCallback(async ({
    firstGreeting = false,
    finishWith,
    greetingMode,
    newThread = false,
    npc,
    question,
    recordQuestion = true,
    sessionId,
    timeOfDay,
  }: {
    firstGreeting?: boolean;
    finishWith: "topics" | "followup";
    greetingMode?: FirstGreetingMode;
    newThread?: boolean;
    npc: NpcDialogueActor;
    question: string;
    recordQuestion?: boolean;
    sessionId: number;
    timeOfDay?: TimeOfDay;
  }) => {
    try {
      const requestState = dialogueRef.current;
      const conversation = newThread
        ? []
        : requestState?.actorConversation.slice(-20);
      const payload = await requestActorChat(
        "/api/actor/respond",
        {
          characterId: npc.characterId,
          question,
          context: {
            firstGreeting,
            ...(greetingMode ? { greetingMode } : {}),
            ...(timeOfDay ? { timeOfDay } : {}),
            conversation,
          },
        },
        "The character could not answer.",
        (entries) => onProgressRef.current?.(entries),
      );
      if (dialogueSessionRef.current !== sessionId) return;
      const current = dialogueRef.current;
      if (!current || current.npc.characterId !== npc.characterId) return;
      if (!payload.answer?.trim()) {
        throw new Error("The character could not answer.");
      }
      if (payload.fieldNoteId) onFieldNoteAddedRef.current?.(payload.fieldNoteId);
      const dialogueNodes = splitActorBeats(payload.answer);
      const spokenAnswer = dialogueNodes.join(" ");
      const baseConversation = newThread ? [] : current.actorConversation;
      const nextConversation = [
        ...baseConversation,
        ...(firstGreeting || !recordQuestion
          ? ([] as ConversationEntry[])
          : [{ content: question, role: "learner" as const }]),
        { content: spokenAnswer, role: "character" as const },
      ].slice(-20);
      npcInteractionStateRef.current.set(npc.characterId, {
        actorConversation: nextConversation,
        hasMet: true,
      });
      updateDialogue((state) => ({
        ...state,
        actorConversation: nextConversation,
        choiceMenu: null,
        dialogueIndex: 0,
        dialogueNodes,
        finishWith,
        freeChatOpen: false,
        freeChatStartsNewThread: false,
        isThinking: false,
        key: state.key + 1,
        suggestedFollowUps: [],
        view: textView(
          `${state.npc.id}-actor-${state.key}`,
          dialogueNodes[0],
          true,
        ),
      }));
    } catch (error) {
      if (dialogueSessionRef.current !== sessionId) return;
      const message = error instanceof Error
        ? error.message
        : "The character could not answer.";
      console.error(message);
      toast.error(pickRandomLabel(BACKEND_ERROR_LABELS), {
        id: "home-2d-actor-llm-error",
      });
      updateDialogue((state) => ({
        ...state,
        choiceMenu: null,
        dialogueIndex: 0,
        dialogueNodes: [],
        freeChatOpen: false,
        freeChatStartsNewThread: false,
        isThinking: false,
        key: state.key + 1,
        // Dead-end beat: Space closes the conversation (does not open topics/follow-up).
        view: textView(
          `${state.npc.id}-actor-error-${state.key}`,
          "...",
          true,
        ),
      }));
    }
  }, [updateDialogue]);

  const requestFollowUpQuestions = useCallback(async ({
    npc,
    sessionId,
  }: {
    npc: NpcDialogueActor;
    sessionId: number;
  }) => {
    try {
      const requestState = dialogueRef.current;
      const payload = await requestActorChat(
        "/api/actor/respond",
        {
          characterId: npc.characterId,
          context: {
            followUpQuestions: true,
            conversation: requestState?.actorConversation.slice(-20),
          },
        },
        "Could not suggest follow-up questions.",
        (entries) => onProgressRef.current?.(entries),
      );
      if (dialogueSessionRef.current !== sessionId) return;
      const followUps = (payload.followUps ?? [])
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 3);
      if (followUps.length !== 3) {
        throw new Error("Could not suggest follow-up questions.");
      }
      openChoiceMenu("more", { suggestedFollowUps: followUps });
    } catch (error) {
      if (dialogueSessionRef.current !== sessionId) return;
      const message = error instanceof Error
        ? error.message
        : "Could not suggest follow-up questions.";
      console.error(message);
      toast.error(pickRandomLabel(BACKEND_ERROR_LABELS), {
        id: "home-2d-actor-llm-error",
      });
      updateDialogue((state) => ({
        ...state,
        choiceMenu: null,
        dialogueIndex: 0,
        dialogueNodes: [],
        freeChatOpen: false,
        freeChatStartsNewThread: false,
        isThinking: false,
        key: state.key + 1,
        view: textView(
          `${state.npc.id}-followups-error-${state.key}`,
          "...",
          true,
        ),
      }));
    }
  }, [openChoiceMenu, updateDialogue]);

  const openNpcDialogue = useCallback((npc: NpcDialogueActor) => {
    const sessionId = dialogueSessionRef.current + 1;
    dialogueSessionRef.current = sessionId;
    dialogueOpenRef.current = true;
    const previousInteraction = npcInteractionStateRef.current.get(npc.characterId);
    const firstGreeting = !(previousInteraction?.hasMet ?? false);
    const initial: NpcDialogueState = {
      actorConversation: previousInteraction?.actorConversation ?? [],
      choiceMenu: null,
      dialogueIndex: 0,
      dialogueNodes: [],
      finishWith: "topics",
      freeChatOpen: false,
      freeChatStartsNewThread: false,
      freeChatValue: "",
      isThinking: true,
      key: 0,
      npc,
      suggestedFollowUps: [],
      view: textView(
        `${npc.id}-greeting-loading`,
        "The person turns toward you…",
        false,
      ),
    };
    dialogueRef.current = initial;
    setDialogue(initial);
    const greetingMode = firstGreeting ? pickFirstGreetingMode() : undefined;
    const greetingQuestion = greetingMode
      ? firstGreetingQuestion(greetingMode)
      : returningGreetingQuestion();
    void requestActorResponse({
      firstGreeting,
      finishWith: "topics",
      ...(greetingMode ? { greetingMode } : {}),
      npc,
      question: greetingQuestion,
      recordQuestion: false,
      sessionId,
      timeOfDay: getTimeOfDay(),
    });
  }, [requestActorResponse]);

  const advanceDialogue = useCallback(() => {
    const current = dialogueRef.current;
    if (!current || current.view.kind !== "text" || !current.view.canAdvance) {
      return;
    }
    // Error ellipsis: Space ends the conversation instead of opening a normal menu.
    if (
      current.view.id.includes("-actor-error-") ||
      current.view.id.includes("-followups-error-") ||
      current.view.text === "..."
    ) {
      closeDialogue();
      return;
    }
    const nextIndex = current.dialogueIndex + 1;
    if (nextIndex < current.dialogueNodes.length) {
      updateDialogue((state) => ({
        ...state,
        dialogueIndex: nextIndex,
        key: state.key + 1,
        view: textView(
          `${state.npc.id}-actor-${state.key}`,
          state.dialogueNodes[nextIndex],
          true,
        ),
      }));
      return;
    }
    openChoiceMenu(current.finishWith === "topics" ? "topics" : "followup");
  }, [closeDialogue, openChoiceMenu, updateDialogue]);

  const askActor = useCallback((
    question: string,
    extras: { newThread?: boolean } = {},
  ) => {
    const current = dialogueRef.current;
    if (!current || !question.trim() || current.isThinking) return;
    const sessionId = dialogueSessionRef.current;
    updateDialogue((state) => ({
      ...state,
      choiceMenu: null,
      dialogueIndex: 0,
      dialogueNodes: [],
      freeChatOpen: false,
      freeChatStartsNewThread: false,
      freeChatValue: "",
      isThinking: true,
      key: state.key + 1,
      view: textView(
        `${state.npc.id}-actor-loading-${state.key}`,
        "Let me think on that…",
        false,
      ),
    }));
    void requestActorResponse({
      finishWith: "followup",
      newThread: extras.newThread === true,
      npc: current.npc,
      question,
      sessionId,
    });
  }, [requestActorResponse, updateDialogue]);

  const chooseDialogue = useCallback((index: number) => {
    const current = dialogueRef.current;
    if (!current || current.view.kind !== "choice") return;

    if (current.view.id === "npc-followup") {
      if (index === 0) {
        const sessionId = dialogueSessionRef.current;
        updateDialogue((state) => ({
          ...state,
          choiceMenu: null,
          freeChatOpen: false,
          isThinking: true,
          key: state.key + 1,
          view: textView(
            `${state.npc.id}-followups-loading-${state.key}`,
            "Thinking of what you might ask…",
            false,
          ),
        }));
        void requestFollowUpQuestions({
          npc: current.npc,
          sessionId,
        });
        return;
      }
      if (index === 1) {
        openChoiceMenu("topics");
        return;
      }
      return;
    }

    if (current.view.id === "npc-more") {
      const question = current.suggestedFollowUps[index];
      if (!question) return;
      askActor(question);
      return;
    }

    if (current.view.id !== "npc-topics") return;
    if (index < 0 || index >= NPC_DIALOGUE_OPTIONS.length) return;
    askActor(NPC_DIALOGUE_OPTIONS[index]);
  }, [askActor, openChoiceMenu, requestFollowUpQuestions, updateDialogue]);

  const submitActorQuestion = useCallback(() => {
    const current = dialogueRef.current;
    const question = current?.freeChatValue.trim();
    if (!current || !question || current.isThinking) return;
    askActor(question, { newThread: current.freeChatStartsNewThread });
  }, [askActor]);

  const rendererDialogue: NpcDialogueView | null = dialogue
    ? {
        characterPortrait: dialogue.npc.portraitUrl
          ? { name: dialogue.npc.name, assetUrl: dialogue.npc.portraitUrl }
          : undefined,
        freeChat: dialogue.freeChatOpen
          ? {
              isThinking: dialogue.isThinking,
              label:
                dialogue.choiceMenu === "more"
                  ? "Start a new question..."
                  : dialogue.choiceMenu === "followup"
                    ? "Ask your own question..."
                    : NPC_FREE_TEXT_OPTION,
              onChange: (value) => {
                updateDialogue((state) => ({ ...state, freeChatValue: value }));
              },
              onSubmit: () => void submitActorQuestion(),
              placeholder:
                dialogue.choiceMenu === "more"
                  ? "Ask something new..."
                  : `Ask ${dialogue.npc.name} something...`,
              value: dialogue.freeChatValue,
            }
          : undefined,
        key: dialogue.key,
        npcName: dialogue.npc.name,
        onAdvance: advanceDialogue,
        onChoose: chooseDialogue,
        onClose: closeDialogue,
        onRestart: () => openNpcDialogue(dialogue.npc),
        typingGateRef,
        view: dialogue.view,
      }
    : null;

  return {
    dialogue: rendererDialogue,
    dialogueOpenRef,
    closeDialogue,
    openNpcDialogue,
  };
}
