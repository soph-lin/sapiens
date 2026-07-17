import {
  getShopDisplayItemId,
  getShopItemByAssetPath,
  getShopItemById,
  getShopItemParts,
  resolveShopStateAssetPath,
} from "../items/shop";
import type { MapItem } from "../map";
import { getTimeOfDay } from "@/lib/util";
import { shopGroupId } from "./context";
import type {
  InteractionBehavior,
  InteractionContext,
  ItemInteractionDefinition,
  ItemInteractionEffect,
  ItemInteractionOption,
  ItemInteractionTarget,
} from "./types";

function asset(itemId: string): string {
  const item = getShopItemById(itemId);
  if (!item) throw new Error(`Unknown interactive shop item: ${itemId}`);
  return item.assetPath;
}

function isAltered(item: MapItem): boolean {
  const shopItem = getShopItemByAssetPath(item.assetPath);
  if (!shopItem) return false;
  return getShopItemParts(shopItem).state !== "default";
}

function focusEffect(
  target: ItemInteractionTarget,
  nextAssetPath: string,
): ItemInteractionEffect {
  return {
    layerId: target.layerId,
    itemId: target.item.id,
    assetPath: resolveShopStateAssetPath(target.item.assetPath, nextAssetPath),
  };
}

function leaveOption(target: ItemInteractionTarget, label = "Never mind") {
  return {
    id: "leave",
    label,
    response: "You step back.",
    effects: [] as const,
  };
}

function keepOption(target: ItemInteractionTarget, label = "Not yet") {
  return {
    id: "keep",
    label,
    response: "You leave things as they are.",
    effects: [] as const,
  };
}

type TextFn = string | ((ctx: {meal: string}) => string);

function resolveText(value: TextFn, meal: string): string {
  return typeof value === "function" ? value({meal}) : value;
}

// ---------------------------------------------------------------------------
// Toggle — single item, two states (lamp, fridge, stove alone, …)
// ---------------------------------------------------------------------------

export type ToggleSpec = {
  groupId: string;
  name: string;
  offItemId: string;
  onItemId: string;
  offPrompt: TextFn;
  onPrompt: string;
  startLabel: TextFn;
  stopLabel: string;
  startResponse: TextFn;
  stopResponse: string;
};

export function createToggleBehavior(spec: ToggleSpec): InteractionBehavior {
  return {
    id: `toggle:${spec.groupId}`,
    priority: 10,
    match: (ctx) => shopGroupId(ctx.focus.item) === spec.groupId,
    resolve: (ctx) => {
      const meal = getTimeOfDay().meal;
      const on = isAltered(ctx.focus.item);
      if (on) {
        return {
          id: spec.groupId,
          name: spec.name,
          prompt: spec.onPrompt,
          options: [
            {
              id: "off",
              label: spec.stopLabel,
              response: spec.stopResponse,
              effects: [focusEffect(ctx.focus, asset(spec.offItemId))],
            },
            keepOption(ctx.focus),
          ],
        };
      }
      return {
        id: spec.groupId,
        name: spec.name,
        prompt: resolveText(spec.offPrompt, meal),
        options: [
          {
            id: "on",
            label: resolveText(spec.startLabel, meal),
            response: resolveText(spec.startResponse, meal),
            effects: [focusEffect(ctx.focus, asset(spec.onItemId))],
          },
          leaveOption(ctx.focus),
        ],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Choice — single item, many state options (cup, wineglass, pet dish, …)
// ---------------------------------------------------------------------------

export type ChoiceFillOption = {
  id: string;
  label: string;
  itemId: string;
  response: string;
};

export type ChoiceSpec = {
  groupId: string;
  name: string;
  emptyItemId: string;
  emptyPrompt: string;
  filledPrompt: string;
  emptyLabel: string;
  emptyResponse: string;
  fillOptions: readonly ChoiceFillOption[];
};

export function createChoiceBehavior(spec: ChoiceSpec): InteractionBehavior {
  return {
    id: `choice:${spec.groupId}`,
    priority: 10,
    match: (ctx) => shopGroupId(ctx.focus.item) === spec.groupId,
    resolve: (ctx) => {
      const shopItem = getShopItemByAssetPath(ctx.focus.item.assetPath);
      const filled = isAltered(ctx.focus.item);

      const fillChoices: ItemInteractionOption[] = spec.fillOptions
        .filter((option) => option.itemId !== shopItem?.id)
        .map((option) => ({
          id: option.id,
          label: option.label,
          response: option.response,
          effects: [focusEffect(ctx.focus, asset(option.itemId))],
        }));

      if (filled) {
        return {
          id: spec.groupId,
          name: spec.name,
          prompt: spec.filledPrompt,
          options: [
            {
              id: "empty",
              label: spec.emptyLabel,
              response: spec.emptyResponse,
              effects: [focusEffect(ctx.focus, asset(spec.emptyItemId))],
            },
            ...fillChoices,
            keepOption(ctx.focus, "Leave it"),
          ],
        };
      }

      return {
        id: spec.groupId,
        name: spec.name,
        prompt: spec.emptyPrompt,
        options: [...fillChoices, leaveOption(ctx.focus)],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Compound — behavior enabled when related objects overlap (pan + stove, …)
// ---------------------------------------------------------------------------

export type CompoundSpec = {
  id: string;
  /**
   * `[focusGroupId, partnerGroupId]` — focus item takes state options; partner
   * toggles on/off alongside. Order-independent for overlap detection.
   */
  members: readonly [string, string];
  name: string;
  focusEmptyItemId: string;
  partnerOffItemId: string;
  partnerOnItemId: string;
  startPrompt: string;
  engagedPrompt: string;
  stateOptions: readonly ChoiceFillOption[];
  resetLabel: string;
  resetResponse: string;
  /** Shown when focus is already engaged; defaults to "Leave as is". */
  engagedKeepLabel?: string;
};

function pairFromContext(
  ctx: InteractionContext,
  members: readonly [string, string],
): {focus: ItemInteractionTarget; partner: ItemInteractionTarget} | undefined {
  const [focusGroupId, partnerGroupId] = members;
  const focusGroup = shopGroupId(ctx.focus.item);
  if (focusGroup === focusGroupId) {
    const partner = ctx.overlapping.find(
      (t) => shopGroupId(t.item) === partnerGroupId,
    );
    if (!partner) return undefined;
    return {focus: ctx.focus, partner};
  }
  if (focusGroup === partnerGroupId) {
    const focus = ctx.overlapping.find(
      (t) => shopGroupId(t.item) === focusGroupId,
    );
    if (!focus) return undefined;
    return {focus, partner: ctx.focus};
  }
  return undefined;
}

/**
 * Multi-object loop: default focus on partner → pick a focus state (activates
 * partner) → while engaged, switch state or reset both.
 */
export function createCompoundBehavior(spec: CompoundSpec): InteractionBehavior {
  return {
    id: `compound:${spec.id}`,
    priority: 50,
    match: (ctx) => Boolean(pairFromContext(ctx, spec.members)),
    resolve: (ctx) => {
      const pair = pairFromContext(ctx, spec.members);
      if (!pair) return undefined;
      const {focus, partner} = pair;
      const engaged = isAltered(focus.item);
      const focusShop = getShopItemByAssetPath(focus.item.assetPath);

      if (engaged) {
        const changeOptions = spec.stateOptions
          .filter((option) => option.itemId !== focusShop?.id)
          .map((option) => ({
            id: `change:${option.id}`,
            label: option.label,
            response: option.response,
            effects: [
              focusEffect(focus, asset(option.itemId)),
              focusEffect(partner, asset(spec.partnerOnItemId)),
            ],
          }));

        return {
          id: spec.id,
          name: spec.name,
          prompt: spec.engagedPrompt,
          options: [
            ...changeOptions,
            {
              id: "reset",
              label: spec.resetLabel,
              response: spec.resetResponse,
              effects: [
                focusEffect(focus, asset(spec.focusEmptyItemId)),
                focusEffect(partner, asset(spec.partnerOffItemId)),
              ],
            },
            keepOption(ctx.focus, spec.engagedKeepLabel ?? "Leave as is"),
          ],
        };
      }

      return {
        id: spec.id,
        name: spec.name,
        prompt: spec.startPrompt,
        options: [
          ...spec.stateOptions.map((option) => ({
            id: option.id,
            label: option.label,
            response: option.response,
            effects: [
              focusEffect(focus, asset(option.itemId)),
              focusEffect(partner, asset(spec.partnerOnItemId)),
            ],
          })),
          leaveOption(ctx.focus),
        ],
      };
    },
  };
}

/** Solo pan when it is not on a stove. */
export function createVesselNeedsHeatBehavior(options: {
  vesselGroupId: string;
  heatGroupId: string;
  name: string;
  prompt: string;
}): InteractionBehavior {
  return {
    id: `needs-heat:${options.vesselGroupId}`,
    priority: 15,
    match: (ctx) => {
      if (shopGroupId(ctx.focus.item) !== options.vesselGroupId) return false;
      return !ctx.overlapping.some(
        (target) => shopGroupId(target.item) === options.heatGroupId,
      );
    },
    resolve: (ctx): ItemInteractionDefinition => ({
      id: options.vesselGroupId,
      name: options.name,
      prompt: options.prompt,
      options: [leaveOption(ctx.focus, "Okay buddy")],
    }),
  };
}

// ---------------------------------------------------------------------------
// Muse — non-state small items: one witty player line, no sprite change
// ---------------------------------------------------------------------------

export type MuseSpec = {
  /** Canonical shop item id (display id), e.g. `smallitems-apple`. */
  itemId: string;
  name: string;
  line: string;
};

export function createMuseBehaviors(
  specs: readonly MuseSpec[],
): InteractionBehavior {
  const byId = new Map(specs.map((spec) => [spec.itemId, spec]));
  return {
    id: "muse:smallitems",
    priority: 5,
    match: (ctx) => {
      const shopItem = getShopItemByAssetPath(ctx.focus.item.assetPath);
      if (!shopItem || shopItem.category !== "smallitem") return false;
      return byId.has(getShopDisplayItemId(shopItem));
    },
    resolve: (ctx) => {
      const shopItem = getShopItemByAssetPath(ctx.focus.item.assetPath);
      if (!shopItem) return undefined;
      const spec = byId.get(getShopDisplayItemId(shopItem));
      if (!spec) return undefined;
      return {
        id: `muse:${spec.itemId}`,
        name: spec.name,
        prompt: spec.line,
        options: [],
        muse: true,
      };
    },
  };
}
