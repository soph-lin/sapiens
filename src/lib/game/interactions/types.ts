import type { MapDocument, MapItem } from "../map";

export type ItemInteractionTarget = {
  layerId: string;
  item: MapItem;
};

/** One sprite change on a placed map item. */
export type ItemInteractionEffect = {
  layerId: string;
  itemId: string;
  assetPath: string;
};

export type ItemInteractionOption = {
  id: string;
  label: string;
  response: string;
  effects: readonly ItemInteractionEffect[];
};

export type ItemInteractionDefinition = {
  id: string;
  name: string;
  prompt: string;
  options: readonly ItemInteractionOption[];
  /**
   * Single text beat — player musing, no choices or sprite changes.
   * `prompt` is the line shown.
   */
  muse?: boolean;
};

export type ItemInteractionOutcome = {
  response: string;
  effects: readonly ItemInteractionEffect[];
};

export type InteractionContext = {
  document: MapDocument;
  focus: ItemInteractionTarget;
  /** Other items whose tile footprints overlap the focus item. */
  overlapping: readonly ItemInteractionTarget[];
};

/**
 * A pluggable interaction rule. Higher `priority` wins when several match
 * (e.g. pan+stove compound outranks solo stove toggle).
 */
export type InteractionBehavior = {
  id: string;
  priority: number;
  match: (ctx: InteractionContext) => boolean;
  resolve: (ctx: InteractionContext) => ItemInteractionDefinition | undefined;
};
