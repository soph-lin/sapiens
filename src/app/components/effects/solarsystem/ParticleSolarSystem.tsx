"use client";

import { useEffect, useRef } from "react";

export type PlanetId =
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

export type SolarPlanetSpec = {
  id: PlanetId;
  /** Orbital radius as fraction of the stage size */
  orbit: number;
  /** Kept for API stability; all planets use one shared UI radius. */
  size: number;
  /** Starting angle offset (radians) */
  phase: number;
};

type Props = {
  planets: readonly SolarPlanetSpec[];
  focusIndex: number;
  cycleMs: number;
};

type Dust = {
  angle: number;
  orbit: number;
  size: number;
  shade: number;
  speed: number;
};

/**
 * Particle sun + orbiting planets on a flat ring (no perspective tilt).
 * Sparse white-dot silhouettes; density/gaps carry defining features.
 */
export default function ParticleSolarSystem({
  planets,
  focusIndex,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef(focusIndex);

  useEffect(() => {
    focusRef.current = focusIndex;
  }, [focusIndex]);

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
    let dust: Dust[] = [];
    const started = performance.now();
    let prevNow = started;

    /** Clockwise spin on canvas (y-down): positive angle advances CW. */
    const SPIN = 0.11;

    const focusScale = planets.map(() => 1);

    const seedDust = () => {
      dust = [];
      const count = Math.min(48, Math.floor((w * h) / 14000));
      for (let i = 0; i < count; i++) {
        dust.push({
          angle: Math.random() * Math.PI * 2,
          orbit: 0.2 + Math.random() * 0.75,
          size: 1,
          shade: 0.1 + Math.random() * 0.18,
          speed: 0.04 + Math.random() * 0.08,
        });
      }
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = root.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedDust();
    };

    /** Flat ring — no tilt, no perspective foreshortening. */
    const place = (
      angle: number,
      orbit: number,
      scale: number,
      cx: number,
      cy: number,
    ) => ({
      x: cx + Math.cos(angle) * orbit * scale,
      y: cy + Math.sin(angle) * orbit * scale,
    });

    const damp = (
      current: number,
      target: number,
      lambda: number,
      dt: number,
    ) => {
      const k = 1 - Math.exp(-lambda * dt);
      return current + (target - current) * k;
    };

    const fillDot = (x: number, y: number, a: number, s = 1) => {
      if (a < 0.04) return;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, s, s);
    };

    const paintWhiteSphere = (
      px: number,
      py: number,
      radius: number,
      alpha: number,
      keep: (nx: number, ny: number) => boolean,
    ) => {
      const steps = Math.max(3, Math.floor(radius * 0.75));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const ringR = radius * Math.sqrt(t);
        const count = Math.max(4, Math.floor(3 + ringR * 0.75));
        for (let k = 0; k < count; k++) {
          const a = (k / count) * Math.PI * 2;
          const nx = Math.cos(a) * Math.sqrt(t);
          const ny = Math.sin(a) * Math.sqrt(t);
          if (!keep(nx, ny)) continue;
          const r = Math.hypot(nx, ny);
          const edge = 1 - Math.pow(r, 1.35);
          fillDot(
            px + nx * radius,
            py + ny * radius,
            alpha * (0.5 + edge * 0.45),
          );
        }
      }
    };

    const inCrater = (nx: number, ny: number, spin: number) => {
      const sites = [
        [0.28, -0.18, 0.18],
        [-0.42, 0.12, 0.14],
        [0.08, 0.48, 0.12],
        [-0.15, -0.52, 0.11],
        [0.5, 0.22, 0.1],
        [-0.5, -0.28, 0.13],
      ] as const;
      const c = Math.cos(spin * 0.35);
      const s = Math.sin(spin * 0.35);
      const rx = nx * c - ny * s;
      const ry = nx * s + ny * c;
      for (const [cx0, cy0, r] of sites) {
        if (Math.hypot(rx - cx0, ry - cy0) < r) return true;
      }
      return false;
    };

    const drawSun = (px: number, py: number, radius: number) => {
      const halo = Math.max(6, Math.floor(radius * 4));
      for (let i = 0; i < halo; i++) {
        const a = (i / halo) * Math.PI * 2;
        fillDot(
          px + Math.cos(a) * radius * 1.45,
          py + Math.sin(a) * radius * 1.35,
          0.08,
        );
      }
      paintWhiteSphere(px, py, radius, 0.88, () => true);
    };

    const drawPlanet = (
      id: PlanetId,
      px: number,
      py: number,
      radius: number,
      alpha: number,
      spin: number,
    ) => {
      switch (id) {
        case "mercury":
          paintWhiteSphere(
            px,
            py,
            radius,
            alpha,
            (nx, ny) => !inCrater(nx, ny, spin),
          );
          break;

        case "venus":
          paintWhiteSphere(px, py, radius, alpha, (nx, ny) => {
            return Math.sin(ny * 6 + nx + spin * 0.4) > -0.45;
          });
          break;

        case "earth": {
          paintWhiteSphere(px, py, radius, alpha, (nx, ny) => {
            if (ny < -0.78 || ny > 0.8) return true;
            const lx = nx * Math.cos(spin) - ny * Math.sin(spin) * 0.12;
            const ly = ny;
            const africa =
              Math.hypot(lx - 0.12, (ly + 0.05) * 1.15) < 0.32 &&
              ly > -0.55 &&
              ly < 0.55;
            const americas =
              lx < -0.2 &&
              Math.sin(lx * 6 + 1) * Math.cos(ly * 5) > 0.15 &&
              Math.abs(ly) < 0.72;
            const eurasia =
              lx > 0.05 &&
              ly < 0.15 &&
              ly > -0.55 &&
              Math.sin(lx * 5) * Math.cos(ly * 4) > -0.05;
            const australia = Math.hypot(lx - 0.48, ly - 0.42) < 0.14;
            return africa || americas || eurasia || australia;
          });
          paintWhiteSphere(
            px + radius * 1.75,
            py - radius * 0.5,
            radius * 0.26,
            alpha * 0.85,
            (nx, ny) => !inCrater(nx, ny, spin + 1),
          );
          break;
        }

        case "mars":
          paintWhiteSphere(px, py, radius, alpha, (nx, ny) => {
            if (ny < -0.72 || ny > 0.74) return true;
            return !inCrater(nx, ny, spin);
          });
          break;

        case "jupiter":
          paintWhiteSphere(px, py, radius, alpha, (nx, ny) => {
            if (Math.sin(ny * 10 + spin * 0.2) < -0.35) return false;
            return true;
          });
          break;

        case "saturn": {
          const ringInner = radius * 1.35;
          const ringOuter = radius * 2.15;
          const ringN = Math.max(14, Math.floor(radius * 7));
          for (let i = 0; i < ringN; i++) {
            const a = (i / ringN) * Math.PI * 2;
            const rr =
              ringInner + ((i * 17) % 100) / 100 * (ringOuter - ringInner);
            if (rr > radius * 1.7 && rr < radius * 1.85) continue;
            fillDot(
              px + Math.cos(a) * rr,
              py + Math.sin(a) * rr * 0.55,
              alpha * 0.42,
            );
          }
          paintWhiteSphere(px, py, radius, alpha, (nx, ny) => {
            return Math.sin(ny * 7 + spin * 0.15) > -0.45;
          });
          break;
        }

        case "uranus": {
          const ringN = Math.max(8, Math.floor(radius * 5));
          for (let i = 0; i < ringN; i++) {
            const a = (i / ringN) * Math.PI * 2;
            const rr = radius * 1.4;
            fillDot(
              px + Math.cos(a) * rr * 0.45,
              py + Math.sin(a) * rr,
              alpha * 0.28,
            );
          }
          paintWhiteSphere(px, py, radius, alpha, () => true);
          break;
        }

        case "neptune":
          paintWhiteSphere(px, py, radius, alpha, (nx, ny) => {
            if (Math.hypot(nx + 0.25, ny - 0.1) < 0.2) return false;
            return Math.sin(ny * 5 + spin * 0.1) > -0.55;
          });
          break;
      }
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - prevNow) / 1000);
      prevNow = now;
      const t = (now - started) / 1000;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const scale = Math.min(w, h) * 0.36;

      const focus =
        ((focusRef.current % planets.length) + planets.length) % planets.length;

      // Steady clockwise rotation only — focus changes scale, not direction
      const systemAngle = reduceMotion ? 0 : t * SPIN;

      for (let i = 0; i < focusScale.length; i++) {
        const want = i === focus ? 1.22 : 1;
        focusScale[i] = reduceMotion
          ? want
          : damp(focusScale[i], want, 5.5, dt);
      }

      for (const d of dust) {
        const ang = d.angle + systemAngle * (0.35 + d.speed);
        const p = place(ang, d.orbit, scale, cx, cy);
        fillDot(p.x, p.y, d.shade, d.size);
      }

      // One shared ring (planets are equidistant)
      const ringOrbit = planets[0]?.orbit ?? 0.72;
      for (let s = 0; s < 24; s += 3) {
        const ang = (s / 24) * Math.PI * 2 + systemAngle;
        const p = place(ang, ringOrbit, scale, cx, cy);
        fillDot(p.x, p.y, 0.045);
      }

      drawSun(cx, cy, Math.min(w, h) * 0.022);

      for (let index = 0; index < planets.length; index++) {
        const planet = planets[index];
        const ang = planet.phase + systemAngle;
        const p = place(ang, planet.orbit, scale, cx, cy);
        const radius = Math.min(w, h) * 0.02 * focusScale[index];
        const alpha = 0.72 + focusScale[index] * 0.2;
        drawPlanet(planet.id, p.x, p.y, radius, alpha, systemAngle * 0.35);
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(root);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [planets]);

  return (
    <div
      ref={rootRef}
      className="relative h-full min-h-72 w-full"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
