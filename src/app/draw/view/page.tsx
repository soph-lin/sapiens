"use client";

import { useEffect, useRef, useState } from "react";
import { MapRenderer } from "@/app/components/game";
import {
  createEmptyMapDocument,
  normalizeMapDocument,
  type MapDocument,
} from "@/lib/game/map";
import {
  findPlayerStart,
  movePlayer,
  type PlayerDirection,
  type PlayerPosition,
} from "@/lib/game/movement";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@/lib/game/config";

const STORAGE_KEY = "sapiens.draw.map.v1";
export default function GamePage() {
  const [document, setDocument] = useState<MapDocument>(() =>
    createEmptyMapDocument(),
  );
  const [player, setPlayer] = useState<PlayerPosition | null>(null);
  const [direction, setDirection] = useState<PlayerDirection>("down");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const documentRef = useRef(document);

  useEffect(() => {
    const loadDraft = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        const next = saved
          ? normalizeMapDocument(JSON.parse(saved))
          : createEmptyMapDocument();
        documentRef.current = next;
        setDocument(next);
        const start = findPlayerStart(next);
        setPlayer(start);
        setErrorToast(start ? null : "No floor available for the player.");
      } catch {
        // The view remains usable with an empty document if the draft is invalid.
      }
    }, 0);
    return () => window.clearTimeout(loadDraft);
  }, []);

  const cameraX = player
    ? Math.min(
        Math.max(0, player.x - Math.floor(VIEW_WIDTH / 2)),
        Math.max(0, document.width - VIEW_WIDTH),
      )
    : 0;
  const cameraY = player
    ? Math.min(
        Math.max(0, player.y - Math.floor(VIEW_HEIGHT / 2)),
        Math.max(0, document.height - VIEW_HEIGHT),
      )
    : 0;

  useEffect(() => {
    const directions: Record<string, PlayerDirection> = {
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
    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      setDirection(direction);
      setPlayer((current) => current ? movePlayer(documentRef.current, current, direction) : current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="min-h-dvh bg-[#0b0c0e] p-5 text-[#f5ead9] sm:p-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-200/60">
              Sapiens / walk-through
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Map view</h1>
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-[#9ea8aa]">
            Arrow keys or WASD to move
          </p>
        </div>

        <div className="mx-auto w-fit max-w-full overflow-hidden rounded-3xl border border-white/10 bg-[#070809] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <MapRenderer
            cameraX={cameraX}
            cameraY={cameraY}
            document={document}
            player={player}
            playerDirection={direction}
          />
        </div>
      </div>
      {errorToast ? (
        <div
          aria-live="assertive"
          className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-xl border border-red-300/30 bg-red-950/95 px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-red-100 shadow-2xl"
          role="alert"
        >
          {errorToast}
        </div>
      ) : null}
    </main>
  );
}
