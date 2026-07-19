"use client";

import { useEffect, useRef } from "react";
import { COCO_CX, COCO_CY } from "@/app/components/coco/placement";

type Particle = {
  homeX: number;
  homeY: number;
  shade: number;
  size: number;
  phase: number;
  speed: number;
  amp: number;
};

/** Lounge atmosphere — gradient wash + floating grit (separate from Coco). */
export default function HomeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let field: Particle[] = [];
    const started = performance.now();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const parent = canvas.parentElement;
      w = parent?.clientWidth || window.innerWidth;
      h = parent?.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedField();
    };

    const seedField = () => {
      const density = Math.min(650, Math.floor((w * h) / 2000));
      field = [];
      for (let i = 0; i < density; i++) {
        field.push({
          homeX: Math.random() * w,
          homeY: Math.random() * h,
          shade: 0.1 + Math.random() * 0.35,
          size: Math.random() < 0.9 ? 1 : 1.3,
          phase: Math.random() * Math.PI * 2,
          speed: 0.2 + Math.random() * 0.5,
          amp: 3 + Math.random() * 8,
        });
      }
    };

    const drawGradients = () => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      const wash = ctx.createLinearGradient(0, 0, 0, h);
      wash.addColorStop(0, "rgba(12, 16, 28, 0.85)");
      wash.addColorStop(0.45, "rgba(18, 24, 36, 0.45)");
      wash.addColorStop(1, "rgba(8, 12, 18, 0.9)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);

      const ember = ctx.createRadialGradient(
        w * 0.5,
        h * 0.55,
        0,
        w * 0.5,
        h * 0.55,
        Math.min(w, h) * 0.5,
      );
      ember.addColorStop(0, "rgba(42, 28, 12, 0.28)");
      ember.addColorStop(0.55, "rgba(24, 78, 72, 0.1)");
      ember.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ember;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(
        w * COCO_CX,
        h * COCO_CY,
        0,
        w * COCO_CX,
        h * COCO_CY,
        Math.min(w, h) * 0.3,
      );
      glow.addColorStop(0, "rgba(255, 248, 235, 0.06)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    };

    const drawField = (t: number) => {
      if (reduceMotion) return;
      for (const p of field) {
        const y =
          p.homeY + Math.sin(p.homeX * 0.008 + t * p.speed + p.phase) * p.amp;
        const g = Math.floor(155 + p.shade * 70);
        ctx.fillStyle = `rgba(${g},${g},${Math.min(255, g + 12)},${p.shade * 0.5})`;
        ctx.fillRect(p.homeX, y, p.size, p.size);
      }
    };

    const frame = (now: number) => {
      const t = (now - started) / 1000;
      drawGradients();
      drawField(t);
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
