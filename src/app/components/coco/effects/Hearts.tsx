"use client";

import { useEffect, useRef } from "react";
import { COCO_CX, COCO_CY, COCO_SCALE } from "../placement";

type HeartParticle = {
  born: number;
  life: number;
  ox: number;
  oy: number;
  drift: number;
  spin: number;
  size: number;
};

/** Pixel heart in local −1..1 space (point down) */
function heartDots(step = 0.14): { lx: number; ly: number }[] {
  const pts: { lx: number; ly: number }[] = [];
  for (let y = -1.2; y <= 1.1; y += step) {
    for (let x = -1.2; x <= 1.2; x += step) {
      // Classic heart curve; flip so tip points down in screen y
      const nx = x;
      const ny = -y;
      const a = nx * nx + ny * ny - 1;
      if (a * a * a - nx * nx * ny * ny * ny <= 0) {
        pts.push({ lx: x, ly: y });
      }
    }
  }
  return pts;
}

const HEART = heartDots();

const SPAWN_EVERY = 0.28;
const MAX_HEARTS = 8;

type HeartsProps = {
  /** When false, existing hearts finish and no new ones spawn */
  active?: boolean;
};

/** Screen-space hearts — float up from Coco; never inherits Coco 3D */
export function Hearts({ active = true }: HeartsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

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
    let particles: HeartParticle[] = [];
    let lastSpawn = 0;
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
    };

    const spawn = (t: number) => {
      if (!activeRef.current) return;
      if (particles.length >= MAX_HEARTS) return;
      const unit = Math.min(w, h);
      const cx = w * COCO_CX;
      const cy = h * COCO_CY;
      particles.push({
        born: t,
        life: 1.6 + Math.random() * 0.6,
        ox: cx + (Math.random() - 0.5) * unit * COCO_SCALE * 0.35,
        oy: cy - unit * COCO_SCALE * 0.05 + Math.random() * unit * 0.04,
        drift: (Math.random() - 0.5) * unit * 0.08,
        spin: (Math.random() - 0.5) * 0.8,
        size: unit * (0.022 + Math.random() * 0.014),
      });
    };

    const frame = (now: number) => {
      const t = (now - started) / 1000;
      ctx.clearRect(0, 0, w, h);

      if (activeRef.current && t - lastSpawn >= SPAWN_EVERY) {
        spawn(t);
        lastSpawn = t;
      }

      // Kick one heart immediately when activated (static frame for reduced motion)
      if (reduceMotion && activeRef.current && particles.length === 0) {
        spawn(t);
      }

      particles = particles.filter((p) => t - p.born < p.life);

      for (const p of particles) {
        const progress = (t - p.born) / p.life;
        const rise = progress * Math.min(w, h) * 0.2;
        const wobble = reduceMotion
          ? 0
          : Math.sin(progress * Math.PI * 3 + p.spin) * 6;
        const ox = p.ox + p.drift * progress + wobble;
        const oy = p.oy - rise;

        let alpha = 1;
        if (progress < 0.1) alpha = progress / 0.1;
        else if (progress > 0.55) alpha = 1 - (progress - 0.55) / 0.45;
        alpha = Math.max(0, Math.min(1, alpha)) * 0.9;
        if (alpha < 0.02) continue;

        const s = p.size * (0.75 + progress * 0.45);
        const pixel = Math.max(1.5, s * 0.12);

        for (const d of HEART) {
          const x = ox + d.lx * s * 0.5;
          const y = oy + d.ly * s * 0.5;
          const pink = 210 + Math.floor(progress * 30);
          ctx.fillStyle = `rgba(${pink},${120 + Math.floor(progress * 40)},${160},${alpha})`;
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
