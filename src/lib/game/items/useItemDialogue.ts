"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import type { Presentable } from "@/lib/dialogue";
import type { MapDocument } from "../map";
import type {
  ItemInteractionTarget,
  ItemInteractionOption,
} from "../interactions";
import { getItemInteraction } from "../interactions";

export type ItemDialogueTypingGateRef = {
  current: {
    done: boolean;
    skip: () => void;
  };
};

export type ItemDialogueView = {
  characterPortrait?: undefined;
  freeChat?: undefined;
  key: number;
  npcName: string;
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onClose: () => void;
  onRestart: () => void;
  typingGateRef: ItemDialogueTypingGateRef;
  view: Presentable;
};

type ItemDialogueState = {
  interaction: {
    name: string;
    options: readonly ItemInteractionOption[];
    prompt: string;
  };
  key: number;
  target: ItemInteractionTarget;
  view: Presentable;
};

function choiceView(
  id: string,
  prompt: string,
  options: readonly ItemInteractionOption[],
): Presentable {
  return {
    kind: "choice",
    id,
    prompt,
    choices: options.map((option, index) => ({index, label: option.label})),
  };
}

function responseView(id: string, text: string): Presentable {
  return {kind: "text", id, speaker: undefined, text, canAdvance: true};
}

export function useItemDialogue(
  documentRef: RefObject<MapDocument | null>,
  onApply: (
    target: ItemInteractionTarget,
    optionId: string,
  ) => string | undefined,
) {
  const [dialogue, setDialogue] = useState<ItemDialogueState | null>(null);
  const dialogueRef = useRef<ItemDialogueState | null>(null);
  const dialogueOpenRef = useRef(false);
  const typingGateRef = useRef<ItemDialogueTypingGateRef["current"]>({
    done: true,
    skip: () => undefined,
  });

  const closeDialogue = useCallback(() => {
    dialogueOpenRef.current = false;
    dialogueRef.current = null;
    setDialogue(null);
  }, []);

  const openItemDialogue = useCallback(
    (target: ItemInteractionTarget) => {
      const document = documentRef.current;
      if (!document) return;
      const interaction = getItemInteraction(document, target);
      if (!interaction) return;
      const initial: ItemDialogueState = {
        interaction,
        key: 0,
        target,
        view:
          interaction.muse || interaction.options.length === 0
            ? responseView(`item-${interaction.id}-muse`, interaction.prompt)
            : choiceView(
                `item-${interaction.id}-choices`,
                interaction.prompt,
                interaction.options,
              ),
      };
      dialogueOpenRef.current = true;
      dialogueRef.current = initial;
      setDialogue(initial);
    },
    [documentRef],
  );

  const chooseDialogue = useCallback(
    (index: number) => {
      const current = dialogueRef.current;
      const option = current?.interaction.options[index];
      if (!current || !option) return;
      const response = onApply(current.target, option.id);
      const next: ItemDialogueState = {
        ...current,
        key: current.key + 1,
        view: responseView(
          `item-${current.interaction.name}-${current.key + 1}`,
          response ?? "Nothing happens.",
        ),
      };
      dialogueRef.current = next;
      setDialogue(next);
    },
    [onApply],
  );

  const advanceDialogue = useCallback(() => {
    const current = dialogueRef.current;
    if (current?.view.kind === "text") closeDialogue();
  }, [closeDialogue]);

  const rendererDialogue: ItemDialogueView | null = dialogue
    ? {
        key: dialogue.key,
        npcName: dialogue.interaction.name,
        onAdvance: advanceDialogue,
        onChoose: chooseDialogue,
        onClose: closeDialogue,
        onRestart: () => openItemDialogue(dialogue.target),
        typingGateRef,
        view: dialogue.view,
      }
    : null;

  return {
    closeDialogue,
    dialogue: rendererDialogue,
    dialogueOpenRef,
    openItemDialogue,
  };
}

export function interactionTargetForItem(
  layerId: string,
  item: import("../map").MapItem,
): ItemInteractionTarget {
  return {layerId, item};
}
