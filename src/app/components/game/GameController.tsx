"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeMapDocument, type MapDocument } from "@/lib/game/map";
import { useNpcDialogue } from "@/lib/game/useNpcDialogue";
import {
  canActorOccupy,
  findActorStart,
  findPlayerStart,
  movePlayer,
  type PlayerDirection,
  type PlayerPosition,
} from "@/lib/game/movement";
import {
  PLAYER_SPEED,
  STAND_TIME,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "@/lib/game/config";
import MapRenderer from "./MapRenderer";

const MAP_NAME = "myroom";
const DIRECTIONS: PlayerDirection[] = ["up", "down", "left", "right"];

type StarCharacter = {
  characterId: string;
  id: string;
  name: string;
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
    const spriteUrl = typeof star.spriteUrl === "string" && star.spriteUrl
      ? star.spriteUrl
      : null;
    const spriteFrames = isRecord(star.spriteFrames)
      ? Object.fromEntries(
          Object.entries(star.spriteFrames).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
      )
      : {};
    return [
      {
        characterId: star.characterId,
        id: star.characterId,
        name: star.name,
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
    const position = findActorStart(document, occupied);
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
  const [document, setDocument] = useState<MapDocument | null>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mapError, setMapError] = useState<string | null>(null);
  const [stars, setStars] = useState<StarCharacter[]>([]);
  const [starError, setStarError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerPosition | null>(null);
  const [npcs, setNpcs] = useState<NpcState[]>([]);
  const [direction, setDirection] = useState<PlayerDirection>("down");
  const documentRef = useRef<MapDocument | null>(null);
  const playerRef = useRef<PlayerPosition | null>(null);
  const npcsRef = useRef<NpcState[]>([]);
  const starsRef = useRef<StarCharacter[]>([]);
  const {
    dialogue: npcDialogueView,
    dialogueOpenRef,
    closeDialogue,
    openNpcDialogue,
  } = useNpcDialogue();

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
        setMapStatus("error");
        setMapError(
          error instanceof Error
            ? error.message
            : `Could not load map “${MAP_NAME}”.`,
        );
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
        const response = await fetch("/api/steer/voyages");
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
        setStars(next);
        if (documentRef.current) {
          const nextNpcs = createNpcStates(
            documentRef.current,
            next,
            playerRef.current,
          );
          npcsRef.current = nextNpcs;
          setNpcs(nextNpcs);
        }
      } catch (error) {
        if (!active) return;
        setStarError(
          error instanceof Error
            ? error.message
            : "Could not load star characters.",
        );
      }
    }
    void loadStars();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogueOpenRef.current) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeDialogue();
        }
        return;
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        const target = interactableNpc(
          playerRef.current,
          direction,
          npcsRef.current,
        );
        if (target) openNpcDialogue(target);
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
  }, [closeDialogue, direction, dialogueOpenRef, openNpcDialogue]);

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

  const cameraX =
    document && player
      ? Math.min(
          Math.max(0, player.x - Math.floor(VIEW_WIDTH / 2)),
          Math.max(0, document.width - VIEW_WIDTH),
        )
      : 0;
  const cameraY =
    document && player
      ? Math.min(
          Math.max(0, player.y - Math.floor(VIEW_HEIGHT / 2)),
          Math.max(0, document.height - VIEW_HEIGHT),
        )
      : 0;
  const targetNpc = useMemo(
    () => interactableNpc(player, direction, npcs),
    [direction, npcs, player],
  );
  return (
    <main className="min-h-dvh bg-[#0b0c0e] p-5 text-[#f5ead9] sm:p-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-200/60">
              Sapiens / home-2d
            </p>
            <h1 className="mt-2 text-3xl font-semibold">My room</h1>
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-[#9ea8aa]">
            Arrow keys or WASD to move · Z to talk
          </p>
        </div>

        {mapStatus === "loading" ? (
          <StatusPanel message={`Loading map “${MAP_NAME}”…`} />
        ) : mapStatus === "error" ? (
          <StatusPanel
            message={mapError ?? `Could not load map “${MAP_NAME}”.`}
            isError
          />
        ) : document ? (
          <div className="mx-auto w-fit max-w-full overflow-hidden rounded-3xl border border-white/10 bg-[#070809] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <MapRenderer
              cameraX={cameraX}
              cameraY={cameraY}
              document={document}
              dialogue={npcDialogueView}
              npcs={npcs.map((npc) => ({
                ...npc,
                isTarget: npc.id === targetNpc?.id,
              }))}
              player={player}
              playerDirection={direction}
            />
          </div>
        ) : null}
      </div>

      {mapStatus === "ready" && starError ? (
        <StatusPanel message={starError} isError />
      ) : null}
      {mapStatus === "ready" && !starError && !stars.length ? (
        <StatusPanel message="No star characters are available yet." />
      ) : null}
    </main>
  );
}

function StatusPanel({
  isError = false,
  message,
}: {
  isError?: boolean;
  message: string;
}) {
  return (
    <div
      aria-live={isError ? "assertive" : "polite"}
      className={`mx-auto w-fit rounded-2xl border px-5 py-4 font-mono text-xs uppercase tracking-[0.12em] ${
        isError
          ? "border-red-300/30 bg-red-950/95 text-red-100"
          : "border-white/10 bg-[#14171b] text-[#c7ccca]"
      }`}
      role={isError ? "alert" : undefined}
    >
      {message}
    </div>
  );
}
