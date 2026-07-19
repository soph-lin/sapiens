"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { normalizeMapDocument, type MapDocument } from "@/lib/game/map";
import {
  applyItemInteraction as applyGameItemInteraction,
  findInteractableItem,
  type ItemInteractionTarget,
} from "@/lib/game/interactions";
import { useNpcDialogue } from "@/lib/game/npc/useNpcDialogue";
import { useItemDialogue } from "@/lib/game/items/useItemDialogue";
import {
  canActorOccupy,
  computeCameraPosition,
  findPlayerStart,
  findRandomActorStart,
  movePlayer,
  type PlayerDirection,
  type PlayerPosition,
} from "@/lib/game/movement";
import {
  PLAYER_SPEED,
  STAND_TIME,
} from "@/lib/game/config";
import LoadingScreen from "@/app/components/loading/LoadingScreen";
import ProgressLogPanel from "@/app/components/progress/ProgressLogPanel";
import type { ProgressLogEntry } from "@/app/components/progress/ProgressLog";
import { HomeFieldNotes } from "@/app/components/fieldnotes";
import MapRenderer, { type ViewTiles } from "./MapRenderer";
import {
  MAP_LOAD_ERROR_LABELS,
  NPC_ERROR_LABELS,
  pickRandomLabel,
} from "@/lib/game/home-errors";

const MAP_NAME = "myroom";
const DIRECTIONS: PlayerDirection[] = ["up", "down", "left", "right"];
const DEFAULT_VIEW_TILES: ViewTiles = { width: 1, height: 1 };

type StarCharacter = {
  ageRange: string | null;
  characterId: string;
  id: string;
  name: string;
  portraitUrl: string | null;
  spriteFrames: Record<string, string>;
  spriteUrl: string | null;
};

type NpcState = StarCharacter & {
  direction: PlayerDirection;
  position: PlayerPosition;
  standingUntil: number;
  target: PlayerPosition | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function randomStandTime() {
  return (
    Math.floor(Math.random() * (STAND_TIME.max - STAND_TIME.min + 1)) +
    STAND_TIME.min
  );
}

function parseStarCharacters(value: unknown): StarCharacter[] {
  if (!isRecord(value) || !Array.isArray(value.runs)) return [];

  return value.runs.flatMap((runValue) => {
    if (!isRecord(runValue) || !isRecord(runValue.starCharacter)) return [];
    const star = runValue.starCharacter;
    if (typeof star.name !== "string" || !star.name.trim()) return [];
    if (typeof star.characterId !== "string" || !star.characterId) return [];
    const portraitUrl =
      typeof star.portraitUrl === "string" && star.portraitUrl
        ? star.portraitUrl
        : null;
    const spriteUrl =
      typeof star.spriteUrl === "string" && star.spriteUrl
        ? star.spriteUrl
        : null;
    const spriteFrames = isRecord(star.spriteFrames)
      ? Object.fromEntries(
          Object.entries(star.spriteFrames).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
    const ageRange =
      typeof star.ageRange === "string" && star.ageRange.trim()
        ? star.ageRange.trim()
        : null;
    return [
      {
        ageRange,
        characterId: star.characterId,
        id: star.characterId,
        name: star.name,
        portraitUrl,
        spriteFrames,
        spriteUrl,
      },
    ];
  });
}

function createNpcStates(
  document: MapDocument,
  stars: StarCharacter[],
  player: PlayerPosition | null,
): NpcState[] {
  const occupied = player ? [player] : [];
  return stars.flatMap((star) => {
    const position = findRandomActorStart(document, occupied);
    if (!position) return [];
    occupied.push(position);
    return [
      {
        ...star,
        direction: "down" as const,
        position,
        standingUntil: Date.now() + randomStandTime(),
        target: null,
      },
    ];
  });
}

function pointKey(point: PlayerPosition) {
  return `${point.x}:${point.y}`;
}

function directionBetween(
  from: PlayerPosition,
  to: PlayerPosition,
): PlayerDirection {
  if (to.x > from.x) return "right";
  if (to.x < from.x) return "left";
  if (to.y > from.y) return "down";
  return "up";
}

function findPath(
  document: MapDocument,
  start: PlayerPosition,
  target: PlayerPosition,
  occupiedPositions: readonly PlayerPosition[],
) {
  const startKey = pointKey(start);
  const targetKey = pointKey(target);
  const queue = [start];
  const visited = new Set([startKey]);
  const previous = new Map<
    string,
    { from: string; position: PlayerPosition }
  >();

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    if (pointKey(current) === targetKey) break;
    for (const nextDirection of [...DIRECTIONS].sort(
      () => Math.random() - 0.5,
    )) {
      const delta = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
      }[nextDirection];
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      const nextKey = pointKey(next);
      if (
        visited.has(nextKey) ||
        !canActorOccupy(document, next, occupiedPositions)
      )
        continue;
      visited.add(nextKey);
      previous.set(nextKey, { from: pointKey(current), position: next });
      queue.push(next);
    }
  }

  if (!visited.has(targetKey)) return null;
  const path: PlayerPosition[] = [];
  let currentKey = targetKey;
  while (currentKey !== startKey) {
    const step = previous.get(currentKey);
    if (!step) return null;
    path.unshift(step.position);
    currentKey = step.from;
  }
  return path;
}

function chooseDestination(
  document: MapDocument,
  start: PlayerPosition,
  occupiedPositions: readonly PlayerPosition[],
) {
  const candidates: PlayerPosition[] = [];
  for (let y = 0; y < document.height; y += 1) {
    for (let x = 0; x < document.width; x += 1) {
      const candidate = { x, y };
      if (
        (candidate.x !== start.x || candidate.y !== start.y) &&
        canActorOccupy(document, candidate, occupiedPositions)
      ) {
        candidates.push(candidate);
      }
    }
  }
  candidates.sort(() => Math.random() - 0.5);
  for (const candidate of candidates) {
    if (findPath(document, start, candidate, occupiedPositions))
      return candidate;
  }
  return null;
}

function interactableNpc(
  player: PlayerPosition | null,
  direction: PlayerDirection,
  npcs: NpcState[],
) {
  if (!player) return null;
  const delta = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  }[direction];
  return (
    npcs.find(
      (npc) =>
        npc.position.x === player.x + delta.x &&
        npc.position.y === player.y + delta.y,
    ) ?? null
  );
}

export default function GameController() {
  const [fieldNotesRefreshKey, setFieldNotesRefreshKey] = useState(0);
  const [document, setDocument] = useState<MapDocument | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mapError, setMapError] = useState<string | null>(null);
  const [starError, setStarError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerPosition | null>(null);
  const [npcs, setNpcs] = useState<NpcState[]>([]);
  const [direction, setDirection] = useState<PlayerDirection>("down");
  const [viewTiles, setViewTiles] = useState<ViewTiles>(DEFAULT_VIEW_TILES);
  const [rendererReady, setRendererReady] = useState(false);
  const [actorProgress, setActorProgress] = useState<ProgressLogEntry[]>([]);
  const documentRef = useRef<MapDocument | null>(null);
  const playerRef = useRef<PlayerPosition | null>(null);
  const npcsRef = useRef<NpcState[]>([]);
  const starsRef = useRef<StarCharacter[]>([]);
  const {
    dialogue: npcDialogueView,
    dialogueOpenRef,
    closeDialogue,
    openNpcDialogue,
  } = useNpcDialogue({
    onFieldNoteAdded: () => setFieldNotesRefreshKey((current) => current + 1),
    onProgress: (entries) => {
      if (!entries?.length) return;
      setActorProgress((current) =>
        [
          ...current,
          ...entries.map((entry) => ({
            agent: entry.agent,
            phase: entry.phase,
            message: entry.message,
            details: {
              ...(entry.details ?? {}),
              ...(entry.tool ? { tool: entry.tool } : {}),
            },
          })),
        ].slice(-100),
      );
    },
  });

  const applyItemInteraction = useCallback(
    (target: ItemInteractionTarget, optionId: string) => {
      const current = documentRef.current;
      if (!current) return undefined;
      const outcome = applyGameItemInteraction(current, target, optionId);
      if (!outcome) return undefined;

      const updates = new Map<string, string>();
      for (const effect of outcome.effects) {
        updates.set(`${effect.layerId}:${effect.itemId}`, effect.assetPath);
      }
      if (updates.size === 0) return outcome.response;

      const next: MapDocument = {
        ...current,
        layers: current.layers.map((layer) => ({
          ...layer,
          items: layer.items.map((item) => {
            const assetPath = updates.get(`${layer.id}:${item.id}`);
            return assetPath ? { ...item, assetPath } : item;
          }),
        })),
      };
      documentRef.current = next;
      setDocument(next);
      return outcome.response;
    },
    [],
  );
  const {
    closeDialogue: closeItemDialogue,
    dialogue: itemDialogueView,
    dialogueOpenRef: itemDialogueOpenRef,
    openItemDialogue,
  } = useItemDialogue(documentRef, applyItemInteraction);

  useEffect(() => {
    let active = true;
    async function loadMap() {
      try {
        const summariesResponse = await fetch("/api/maps");
        const summaries = (await summariesResponse.json()) as {
          error?: string;
          maps?: Array<{ id: string; name: string }>;
        };
        if (!summariesResponse.ok)
          throw new Error(summaries.error ?? "Could not load maps.");
        const summary = summaries.maps?.find((map) => map.name === MAP_NAME);
        if (!summary) throw new Error(`Map “${MAP_NAME}” was not found.`);

        const mapResponse = await fetch(
          `/api/maps/${encodeURIComponent(summary.id)}`,
        );
        const mapResult = (await mapResponse.json()) as {
          error?: string;
          data?: unknown;
        };
        if (!mapResponse.ok || mapResult.data === undefined) {
          throw new Error(
            mapResult.error ?? `Could not load map “${MAP_NAME}”.`,
          );
        }

        const next = normalizeMapDocument(mapResult.data);
        if (!active) return;
        const start = findPlayerStart(next);
        documentRef.current = next;
        playerRef.current = start;
        npcsRef.current = createNpcStates(next, starsRef.current, start);
        setDocument(next);
        setPlayer(start);
        setNpcs(npcsRef.current);
        setMapStatus("ready");
      } catch (error) {
        if (!active) return;
        const raw =
          error instanceof Error
            ? error.message
            : `Could not load map “${MAP_NAME}”.`;
        console.error(raw);
        setMapStatus("error");
        setMapError(pickRandomLabel(MAP_LOAD_ERROR_LABELS));
      }
    }
    void loadMap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadStars() {
      try {
        const response = await fetch("/api/voyages");
        const result = (await response.json()) as unknown;
        if (!response.ok)
          throw new Error(
            isRecord(result) && typeof result.error === "string"
              ? result.error
              : "Could not load star characters.",
          );
        const next = parseStarCharacters(result);
        if (!active) return;
        starsRef.current = next;
        if (documentRef.current) {
          const nextNpcs = createNpcStates(
            documentRef.current,
            next,
            playerRef.current,
          );
          npcsRef.current = nextNpcs;
          setNpcs(nextNpcs);
        }
        // Successful response with no guests still reads as “NPCs not here.”
        if (next.length === 0) {
          setStarError(pickRandomLabel(NPC_ERROR_LABELS));
        } else {
          setStarError(null);
        }
      } catch (error) {
        if (!active) return;
        const raw =
          error instanceof Error
            ? error.message
            : "Could not load star characters.";
        console.error(raw);
        // Any failure that leaves guests missing — including API/DB errors
        // like unknown Prisma fields — uses the NPC labels.
        setStarError(pickRandomLabel(NPC_ERROR_LABELS));
      }
    }
    void loadStars();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

      if (dialogueOpenRef.current || itemDialogueOpenRef.current) {
        if (event.key === "Escape") {
          // Editable free-text handles Escape by blurring first; don't close yet.
          if (typing) return;
          event.preventDefault();
          if (itemDialogueOpenRef.current) closeItemDialogue();
          if (dialogueOpenRef.current) closeDialogue();
        }
        return;
      }
      // Field-note share / other overlays: don't steal typing keys (wasd, z, …).
      if (typing) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        const itemTarget = documentRef.current
          ? findInteractableItem(
              documentRef.current,
              playerRef.current,
              direction,
            )
          : undefined;
        if (itemTarget) {
          openItemDialogue(itemTarget);
          return;
        }
        const npcTarget = interactableNpc(
          playerRef.current,
          direction,
          npcsRef.current,
        );
        if (npcTarget) openNpcDialogue(npcTarget);
        return;
      }

      const nextDirection: Record<string, PlayerDirection> = {
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down",
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
      };
      const nextDirectionValue = nextDirection[event.key];
      if (!nextDirectionValue || !documentRef.current || !playerRef.current)
        return;
      event.preventDefault();
      setDirection(nextDirectionValue);
      const next = movePlayer(
        documentRef.current,
        playerRef.current,
        nextDirectionValue,
        npcsRef.current.map((npc) => npc.position),
      );
      playerRef.current = next;
      setPlayer(next);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeDialogue,
    closeItemDialogue,
    direction,
    dialogueOpenRef,
    itemDialogueOpenRef,
    openItemDialogue,
    openNpcDialogue,
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (dialogueOpenRef.current) return;
      const currentDocument = documentRef.current;
      const currentPlayer = playerRef.current;
      const currentNpcs = npcsRef.current;
      if (!currentDocument || !currentPlayer || !currentNpcs.length) return;
      const now = Date.now();

      const nextNpcs = currentNpcs.map((npc, index) => {
        const occupied = [
          currentPlayer,
          ...currentNpcs
            .filter((_, otherIndex) => otherIndex !== index)
            .map((other) => other.position),
        ];

        if (!npc.target) {
          if (now < npc.standingUntil) return npc;
          const target = chooseDestination(
            currentDocument,
            npc.position,
            occupied,
          );
          return target
            ? { ...npc, target }
            : { ...npc, standingUntil: now + randomStandTime() };
        }

        const path = findPath(
          currentDocument,
          npc.position,
          npc.target,
          occupied,
        );
        if (!path?.length) {
          return {
            ...npc,
            standingUntil: now + randomStandTime(),
            target: null,
          };
        }
        const nextPosition = path[0];
        const arrived =
          nextPosition.x === npc.target.x && nextPosition.y === npc.target.y;
        return {
          ...npc,
          direction: directionBetween(npc.position, nextPosition),
          position: nextPosition,
          standingUntil: arrived ? now + randomStandTime() : npc.standingUntil,
          target: arrived ? null : npc.target,
        };
      });
      npcsRef.current = nextNpcs;
      setNpcs(nextNpcs);
    }, 1000 / PLAYER_SPEED);
    return () => window.clearInterval(interval);
  }, [dialogueOpenRef]);

  const camera = useMemo(() => {
    if (!document || !player) return { x: 0, y: 0 };
    return computeCameraPosition(
      document,
      player,
      viewTiles.width,
      viewTiles.height,
    );
  }, [document, player, viewTiles.height, viewTiles.width]);
  const handleViewTilesChange = useCallback((tiles: ViewTiles) => {
    setViewTiles(tiles);
  }, []);
  const handleRendererReadyChange = useCallback((ready: boolean) => {
    setRendererReady(ready);
  }, []);

  const targetNpc = useMemo(
    () => interactableNpc(player, direction, npcs),
    [direction, npcs, player],
  );
  const targetItem = useMemo(
    () =>
      document
        ? findInteractableItem(document, player, direction)
        : undefined,
    [direction, document, player],
  );

  useEffect(() => {
    if (mapStatus !== "error") return;
    toast.error(mapError ?? MAP_LOAD_ERROR_LABELS[0], {
      id: "home-map-load-error",
    });
  }, [mapError, mapStatus]);

  useEffect(() => {
    if (!starError) return;
    toast.error(starError, {
      id: "home-npc-load-error",
    });
  }, [starError]);

  if (mapStatus === "loading") {
    return (
      <>
        <Toaster position="top-right" />
        <LoadingScreen />
      </>
    );
  }

  return (
    <main className="map-home-page flex min-h-0 flex-col overflow-hidden">
      <Toaster position="top-right" />
      {mapStatus === "ready" && document ? (
        <>
          <MapRenderer
            cameraX={camera.x}
            cameraY={camera.y}
            document={document}
            dialogue={npcDialogueView ?? itemDialogueView}
            fieldNotes={<HomeFieldNotes refreshKey={fieldNotesRefreshKey} />}
            npcs={npcs.map((npc) => ({
              ...npc,
              isTarget: !targetItem && npc.id === targetNpc?.id,
            }))}
            onReadyChange={handleRendererReadyChange}
            onViewTilesChange={handleViewTilesChange}
            player={player}
            playerDirection={direction}
            targetItem={targetItem}
          />
          {!rendererReady ? (
            <div className="fixed inset-0 z-200" data-map-overlay>
              <LoadingScreen />
            </div>
          ) : null}
          <ProgressLogPanel entries={actorProgress} label="Actor progress" />
        </>
      ) : null}
    </main>
  );
}
