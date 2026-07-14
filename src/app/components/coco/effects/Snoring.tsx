"use client";

import { useEffect, useRef } from "react";
import { COCO_CX, COCO_CY, COCO_SCALE } from "../placement";

type ZDot = {
  letter: number;
  lx: number;
  ly: number;
};

/** One blocky Z in local letter space (0–1) */
function zLetterDots(step = 0.12): { lx: number; ly: number }[] {
  const pts: { lx: number; ly: number }[] = [];
  for (let u = 0; u <= 1; u += step) pts.push({ lx: u, ly: 0 });
  for (let u = 0; u <= 1; u += step) {
    pts.push({ lx: 1 - u, ly: u });
  }
  for (let u = 0; u <= 1; u += step) pts.push({ lx: u, ly: 1 });
  return pts;
}

const LETTER = zLetterDots();

/** How long one bubble cycle lasts (seconds) */
const BUBBLE_PERIOD = 2.8;

/** Screen-space zzz — bubble up and fade; never inherits Coco 3D */
export function Snoring() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let dots: ZDot[] = [];
    const started = performance.now();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const seed = () => {
      dots = [];
      for (let letter = 0; letter < 3; letter++) {
        for (const p of LETTER) {
          dots.push({ letter, lx: p.lx, ly: p.ly });
        }
      }
    };

    const frame = (now: number) => {
      const t = (now - started) / 1000;
      ctx.clearRect(0, 0, w, h);

      const unit = Math.min(w, h);
      const cx = w * COCO_CX;
      const cy = h * COCO_CY;
      // Spawn near Coco's upper-right
      const spawnX = cx + unit * COCO_SCALE * 0.2;
      const spawnY = cy - unit * COCO_SCALE * 0.22;

      for (let letter = 0; letter < 3; letter++) {
        // Stagger so Zs bubble in sequence
        const phase = letter * 0.33;
        const progress = reduceMotion
          ? 0.35 + letter * 0.2
          : (t / BUBBLE_PERIOD + phase) % 1;

        // Rise + drift while bubbling
        const rise = progress * unit * 0.16;
        const drift = progress * unit * 0.045 + letter * 10;
        const wobble = reduceMotion
          ? 0
          : Math.sin(progress * Math.PI * 2 + letter) * 4;

        // Bigger letters; later Zs in the stack are a touch smaller
        const base = unit * 0.038;
        const s = (base - letter * unit * 0.004) * (0.85 + progress * 0.35);

        // Fade in, hold mid, fade out as it disappears
        let alpha = 1;
        if (progress < 0.12) alpha = progress / 0.12;
        else if (progress > 0.55) alpha = 1 - (progress - 0.55) / 0.45;
        alpha = Math.max(0, Math.min(1, alpha)) * 0.85;

        if (alpha < 0.02) continue;

        const ox = spawnX + drift + wobble;
        const oy = spawnY - rise;
        const pixel = Math.max(1.6, s * 0.09);

        for (const d of dots) {
          if (d.letter !== letter) continue;
          const x = ox + d.lx * s;
          const y = oy + d.ly * s * 1.1;
          const g = Math.floor(200 + letter * 12);
          ctx.fillStyle = `rgba(${g},${g},${Math.min(255, g + 14)},${alpha})`;
          ctx.fillRect(x, y, pixel, pixel);
        }
      }

      raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
    />
  );
}
