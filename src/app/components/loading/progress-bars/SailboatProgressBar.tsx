"use client";

import { useEffect, useRef } from "react";
import { drawPixelShip } from "@/lib/game/ship";

type Props = {
  /** Fill fraction 0–1. Omit for a gentle indeterminate sway. */
  progress?: number;
};

type WaveDot = {
  /** 0–1 along the bar */
  nx: number;
  /** 0 far (back of trough) → 1 near (front) */
  depth: number;
  shade: number;
  size: number;
  phase: number;
};

function clampProgress(progress: number | undefined) {
  const isDeterminate = typeof progress === "number";
  return {
    isDeterminate,
    value: isDeterminate ? Math.max(0, Math.min(1, progress)) : 0,
  };
}

/**
 * Mini sea height field — same multi-roll language as PixelWaveHero,
 * scaled down for a progress lane.
 */
function sea(nx: number, depth: number, t: number) {
  const rise = t * 0.55;
  const travel = depth * 3.2 - rise;
  const roll = Math.sin(nx * Math.PI * 3.4 + travel + depth * 0.9);
  const roll2 =
    Math.sin(nx * Math.PI * 7.1 - t * 0.85 + depth * 2.1) * 0.35;
  const roll3 = Math.sin(nx * Math.PI * 1.6 + t * 0.4 + depth * 1.4) * 0.45;
  const crest = roll + roll2 + roll3;
  const amp = 3.5 + depth * 5.5;
  const elev = crest * amp;
  const slope =
    Math.cos(nx * Math.PI * 3.4 + travel + depth * 0.9) * 0.7 +
    Math.cos(nx * Math.PI * 7.1 - t * 0.85 + depth * 2.1) * 0.25;
  return { elev, slope, crest };
}

/** Sailboat rides a fine translucent pixel sea. */
export default function SailboatProgressBar({ progress }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let waves: WaveDot[] = [];
    const started = performance.now();

    const seedWaves = () => {
      waves = [];
      // Seed across the full lane so density stays fine as fill advances
      const cols = Math.max(120, Math.floor(w / 2.2));
      const rows = 12;
      for (let row = 0; row < rows; row++) {
        const depth = row / (rows - 1);
        const rowCols = Math.floor(cols * (0.5 + depth * 0.65));
        for (let col = 0; col < rowCols; col++) {
          const nx = (col + 0.5) / rowCols;
          const layers = depth > 0.3 ? 2 : 1;
          for (let layer = 0; layer < layers; layer++) {
            waves.push({
              nx: nx + (Math.random() - 0.5) * 0.006,
              depth: Math.min(1, depth + layer * 0.018),
              shade: 0.25 + Math.random() * 0.75,
              size: Math.random() < 0.9 ? 1 : 1.25,
              phase: Math.random() * 0.5,
            });
          }
        }
      }
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = root.clientWidth;
      h = root.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedWaves();
    };

    const frame = (now: number) => {
      const t = (now - started) / 1000;
      const { isDeterminate, value } = clampProgress(progressRef.current);
      ctx.clearRect(0, 0, w, h);

      const barH = 28;
      const barY = h * 0.42;
      // The ship travels the full lane and the water trails behind it, so the
      // ship always rides at the leading edge of the fill (never lags behind
      // the water, in either determinate or indeterminate mode).
      const shipHalf = 14;
      const shipX = isDeterminate
        ? shipHalf + (w - shipHalf * 2) * value
        : shipHalf + ((Math.sin(t * 0.8) + 1) / 2) * Math.max(0, w * 0.32);
      const fillW = isDeterminate ? (value > 0.001 ? shipX : 0) : shipX;

      if (fillW > 2) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, barY - 12, fillW + 4, barH + 22);
        ctx.clip();

        const animT = reduceMotion ? 0 : t;

        for (const wp of waves) {
          // Absolute lane position — constant density as progress grows
          const x = wp.nx * w;
          if (x < -1 || x > fillW + 1) continue;

          const { elev, slope, crest } = sea(wp.nx, wp.depth, animT + wp.phase);
          const baseY = barY + 4 + wp.depth * (barH - 6);
          const face = crest < 0 ? -crest * wp.depth * 1.8 : 0;
          const y = baseY - elev * 0.7 + face;

          const lit = 0.38 + slope * 0.28 + Math.max(0, crest) * 0.26;
          // Soft falloff at near/far edges so the lane doesn't read as a box
          const depthEnvelope =
            Math.sin(Math.max(0.02, Math.min(0.98, wp.depth)) * Math.PI);
          const depthFade = 0.15 + wp.depth * 0.55 + depthEnvelope * 0.35;
          const isCrest = crest > 0.22;
          const r = Math.floor(isCrest ? 248 + lit * 7 : 160 + lit * 30);
          const g = Math.floor(isCrest ? 250 + lit * 5 : 195 + lit * 30);
          const b = Math.floor(isCrest ? 255 : 225 + lit * 25);
          const edgeFade = Math.min(1, (fillW - x) / 16);
          const alpha = Math.min(
            0.58,
            wp.shade * lit * depthFade * 0.5 * edgeFade * depthEnvelope,
          );
          if (alpha < 0.025) continue;

          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fillRect(x, y, wp.size, wp.size);

          if (crest > 0.55 && wp.depth > 0.3 && wp.shade > 0.5) {
            ctx.fillStyle = `rgba(255, 255, 255, ${(0.2 + wp.depth * 0.22) * lit * edgeFade})`;
            ctx.fillRect(x, y - 0.6, 1, 1);
          }
        }

        // Fine leading foam
        if (!reduceMotion) {
          for (let i = 0; i < 16; i++) {
            const fx = fillW - 0.5 - i * 1.35 + Math.sin(t * 4.5 + i) * 1.2;
            const sample = sea(
              Math.min(0.99, fillW / Math.max(1, w)),
              0.75,
              t,
            );
            const fy =
              barY +
              barH * 0.45 -
              sample.elev * 0.45 +
              Math.sin(t * 5.5 + i * 0.65) * 2;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.35 - i * 0.016})`;
            ctx.fillRect(fx, fy, 1, 1);
          }
        }

        ctx.restore();
      }

      const shipNx = Math.min(0.98, shipX / Math.max(1, w));
      const shipSea = reduceMotion
        ? { elev: 0, slope: 0, crest: 0 }
        : sea(shipNx, 0.72, t);
      const bob = shipSea.elev * 0.4;
      const tilt = shipSea.slope * 0.045;
      drawPixelShip(ctx, shipX, barY + barH * 0.2 - bob, 28, {
        tilt,
        alpha: 0.98,
      });

      if (!reduceMotion && fillW > 24) {
        for (let i = 0; i < 8; i++) {
          const wx = shipX - 9 - i * 4 - Math.sin(t * 2.8 + i) * 1.2;
          const wakeSea = sea(Math.max(0, wx / Math.max(1, w)), 0.65, t);
          const wy =
            barY +
            barH * 0.5 -
            wakeSea.elev * 0.35 +
            Math.sin(t * 3.5 + i) * 1.2;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.3 - i * 0.03})`;
          ctx.fillRect(wx, wy, 1, 1);
        }
      }

      raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(resize);
    ro.observe(root);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative h-20 w-full">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
}
