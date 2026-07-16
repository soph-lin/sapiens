"use client";

import { useCallback, useRef, useState } from "react";
import type { Presentable } from "@/lib/dialogue";

export const NPC_DIALOGUE_OPTIONS = [
  "Tell me about your work.",
  "What was your world like?",
  "What should I understand about your time?",
  "Actually, I was wondering about...",
] as const;

export type NpcDialogueActor = {
  characterId: string;
  id: string;
  name: string;
};

export type NpcDialogueTypingGateRef = {
  current: {
    done: boolean;
    skip: () => void;
  };
};

export type NpcDialogueView = {
  freeChat?: {
    isThinking: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
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

type ChatResponse = {
  answer?: string;
  error?: string;
};

type NpcDialogueState = {
  actorConversation: ConversationEntry[];
  freeChatOpen: boolean;
  freeChatValue: string;
  isThinking: boolean;
  key: number;
  npc: NpcDialogueActor;
  view: Presentable;
};

function textView(
  id: string,
  speaker: string | undefined,
  text: string,
  canAdvance: boolean,
): Presentable {
  return { kind: "text", id, speaker, text, canAdvance };
}

function choiceView(): Presentable {
  return {
    kind: "choice",
    id: "npc-options",
    choices: NPC_DIALOGUE_OPTIONS.map((label, index) => ({ index, label })),
  };
}

async function requestActorChat(
  endpoint: string,
  body: unknown,
  fallbackError: string,
): Promise<{ answer: string }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ChatResponse;
  if (!response.ok || !payload.answer?.trim()) {
    throw new Error(payload.error ?? fallbackError);
  }
  return { answer: payload.answer.trim() };
}

export function useNpcDialogue() {
  const [dialogue, setDialogue] = useState<NpcDialogueState | null>(null);
  const dialogueRef = useRef<NpcDialogueState | null>(null);
  const dialogueSessionRef = useRef(0);
  const dialogueOpenRef = useRef(false);
  const typingGateRef = useRef<NpcDialogueTypingGateRef["current"]>({
    done: true,
    skip: () => undefined,
  });

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

  const requestActorResponse = useCallback(async ({
    firstGreeting = false,
    npc,
    question,
    sessionId,
  }: {
    firstGreeting?: boolean;
    npc: NpcDialogueActor;
    question: string;
    sessionId: number;
  }) => {
    try {
      const current = dialogueRef.current;
      const payload = await requestActorChat(
        "/api/actor/respond",
        {
          characterId: npc.characterId,
          question,
          context: {
            firstGreeting,
            conversation: current?.actorConversation.slice(-20),
          },
        },
        "The character could not answer.",
      );
      if (dialogueSessionRef.current !== sessionId) return;
      updateDialogue((state) => ({
        ...state,
        actorConversation: [
          ...state.actorConversation,
          ...(firstGreeting
            ? []
            : [{ content: question, role: "learner" as const }]),
          { content: payload.answer, role: "character" },
        ],
        isThinking: false,
        key: state.key + 1,
        view: textView(
          `${state.npc.id}-actor-${state.key}`,
          state.npc.name,
          payload.answer,
          true,
        ),
      }));
    } catch (error) {
      if (dialogueSessionRef.current !== sessionId) return;
      updateDialogue((state) => ({
        ...state,
        isThinking: false,
        key: state.key + 1,
        view: textView(
          `${state.npc.id}-actor-error-${state.key}`,
          state.npc.name,
          error instanceof Error
            ? error.message
            : "The character could not answer.",
          true,
        ),
      }));
    }
  }, [updateDialogue]);

  const openNpcDialogue = useCallback((npc: NpcDialogueActor) => {
    const sessionId = dialogueSessionRef.current + 1;
    dialogueSessionRef.current = sessionId;
    dialogueOpenRef.current = true;
    const initial: NpcDialogueState = {
      actorConversation: [],
      freeChatOpen: false,
      freeChatValue: "",
      isThinking: true,
      key: 0,
      npc,
      view: textView(
        `${npc.id}-greeting-loading`,
        npc.name,
        "The character turns toward you…",
        false,
      ),
    };
    dialogueRef.current = initial;
    setDialogue(initial);
    void requestActorResponse({
      firstGreeting: true,
      npc,
      question: "The learner has just approached you. Offer a brief first greeting.",
      sessionId,
    });
  }, [requestActorResponse]);

  const advanceDialogue = useCallback(() => {
    const current = dialogueRef.current;
    if (!current || current.view.kind !== "text" || !current.view.canAdvance) {
      return;
    }
    updateDialogue((state) => ({
      ...state,
      key: state.key + 1,
      view: choiceView(),
    }));
  }, [updateDialogue]);

  const chooseDialogue = useCallback((index: number) => {
    const current = dialogueRef.current;
    if (!current || index < 0 || index >= NPC_DIALOGUE_OPTIONS.length) return;
    if (index === NPC_DIALOGUE_OPTIONS.length - 1) {
      updateDialogue((state) => ({
        ...state,
        freeChatOpen: true,
        freeChatValue: "",
        isThinking: false,
        key: state.key + 1,
        view: textView(
          `${state.npc.id}-actor-prompt-${state.key}`,
          undefined,
          "What are you wondering about?",
          false,
        ),
      }));
      return;
    }

    const sessionId = dialogueSessionRef.current;
    updateDialogue((state) => ({
      ...state,
      freeChatOpen: false,
      isThinking: true,
      key: state.key + 1,
      view: textView(
        `${state.npc.id}-actor-loading-${state.key}`,
        state.npc.name,
        "Let me think on that…",
        false,
      ),
    }));
    void requestActorResponse({
      npc: current.npc,
      question: NPC_DIALOGUE_OPTIONS[index],
      sessionId,
    });
  }, [requestActorResponse, updateDialogue]);

  const submitActorQuestion = useCallback(() => {
    const current = dialogueRef.current;
    const question = current?.freeChatValue.trim();
    if (!current || !question || current.isThinking) return;
    const npc = current.npc;
    const sessionId = dialogueSessionRef.current;
    updateDialogue((state) => ({
      ...state,
      freeChatOpen: false,
      freeChatValue: "",
      isThinking: true,
      key: state.key + 1,
      view: textView(
        `${state.npc.id}-actor-thinking-${state.key}`,
        state.npc.name,
        "Let me think on that…",
        false,
      ),
    }));
    void requestActorResponse({
      npc,
      question,
      sessionId,
    });
  }, [requestActorResponse, updateDialogue]);

  const rendererDialogue: NpcDialogueView | null = dialogue
    ? {
        freeChat: dialogue.freeChatOpen
          ? {
              isThinking: dialogue.isThinking,
              onChange: (value) => {
                updateDialogue((state) => ({ ...state, freeChatValue: value }));
              },
              onSubmit: () => void submitActorQuestion(),
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
