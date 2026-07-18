"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  phase: number;
  speed: number;
  drift: number;
  tone: "cool" | "warm" | "white";
};

const MAX_STARS = 1200;

type ShootingStar = {
  bornAt: number;
  duration: number;
  length: number;
  startX: number;
  startY: number;
  angle: number;
  speed: number;
  alpha: number;
};

type Props = {
  /** Fill a parent instead of the viewport (for section backgrounds). */
  contained?: boolean;
};

/** A quiet, low-contrast starfield for dark route shells. */
export default function SparklingStars({ contained = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let devicePixelRatio = 1;
    let stars: Star[] = [];
    let shootingStars: ShootingStar[] = [];
    let nextShootingStarAt = 0;
    const startedAt = performance.now();

    const seedStars = () => {
      const density = contained ? 4200 : 1050;
      const floor = contained ? 80 : 280;
      const cap = contained ? 220 : MAX_STARS;
      const count = Math.min(
        cap,
        Math.max(floor, Math.floor((width * height) / density)),
      );
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() < 0.82 ? 1 : Math.random() < 0.78 ? 1.35 : 1.9,
        alpha: 0.24 + Math.random() * 0.58,
        phase: Math.random() * Math.PI * 2,
        speed: 0.35 + Math.random() * 1.1,
        drift: 2 + Math.random() * 9,
        tone:
          Math.random() < 0.58
            ? "white"
            : Math.random() < 0.65
              ? "cool"
              : "warm",
      }));
    };

    const scheduleNextShootingStar = (now: number) => {
      nextShootingStarAt = now + 2600 + Math.random() * 5600;
    };

    const spawnShootingStar = (now: number) => {
      if (reduceMotion || now < nextShootingStarAt) return;

      shootingStars.push({
        bornAt: now,
        duration: 650 + Math.random() * 450,
        length: 54 + Math.random() * 76,
        startX: Math.random() * width * 0.82,
        startY: Math.random() * height * 0.48,
        angle: Math.PI * (0.16 + Math.random() * 0.1),
        speed: 470 + Math.random() * 250,
        alpha: 0.62 + Math.random() * 0.28,
      });
      scheduleNextShootingStar(now);
    };

    const resize = () => {
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      if (contained) {
        const root = rootRef.current;
        const rect = root?.getBoundingClientRect();
        width = Math.max(1, Math.floor(rect?.width ?? 0));
        height = Math.max(1, Math.floor(rect?.height ?? 0));
      } else {
        width = window.innerWidth;
        height = window.innerHeight;
      }
      canvas.width = Math.floor(width * devicePixelRatio);
      canvas.height = Math.floor(height * devicePixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      seedStars();
    };

    const draw = (now: number) => {
      const time = (now - startedAt) / 1000;
      context.clearRect(0, 0, width, height);
      spawnShootingStar(now);

      for (const star of stars) {
        const shimmer = reduceMotion
          ? 1
          : 0.72 + Math.sin(time * star.speed + star.phase) * 0.28;
        const y = reduceMotion
          ? star.y
          : star.y + Math.sin(time * 0.18 + star.phase) * star.drift;
        const brightness = star.alpha * shimmer;
        const color =
          star.tone === "cool"
            ? `190, 238, 239`
            : star.tone === "warm"
              ? `245, 211, 161`
              : `244, 241, 234`;

        if (star.size > 1.3 && brightness > 0.28) {
          const glow = context.createRadialGradient(
            star.x,
            y,
            0,
            star.x,
            y,
            star.size * 5,
          );
          glow.addColorStop(0, `rgba(${color}, ${brightness * 0.32})`);
          glow.addColorStop(1, `rgba(${color}, 0)`);
          context.fillStyle = glow;
          context.fillRect(
            star.x - star.size * 5,
            y - star.size * 5,
            star.size * 10,
            star.size * 10,
          );
        }

        context.fillStyle = `rgba(${color}, ${brightness})`;
        context.fillRect(star.x, y, star.size, star.size);

        if (star.size > 1.6 && brightness > 0.34) {
          context.fillStyle = `rgba(${color}, ${brightness * 0.45})`;
          context.fillRect(star.x - star.size * 1.8, y, star.size * 4.6, 1);
          context.fillRect(star.x, y - star.size * 1.8, 1, star.size * 4.6);
        }
      }

      if (!reduceMotion && shootingStars.length) {
        shootingStars = shootingStars.filter(
          (shootingStar) => now - shootingStar.bornAt < shootingStar.duration,
        );

        for (const shootingStar of shootingStars) {
          const progress =
            (now - shootingStar.bornAt) / shootingStar.duration;
          const distance =
            (shootingStar.speed * (now - shootingStar.bornAt)) / 1000;
          const headX =
            shootingStar.startX + Math.cos(shootingStar.angle) * distance;
          const headY =
            shootingStar.startY + Math.sin(shootingStar.angle) * distance;
          const tailX =
            headX - Math.cos(shootingStar.angle) * shootingStar.length;
          const tailY =
            headY - Math.sin(shootingStar.angle) * shootingStar.length;
          const fade = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
          const gradient = context.createLinearGradient(
            tailX,
            tailY,
            headX,
            headY,
          );
          gradient.addColorStop(0, "rgba(190, 238, 239, 0)");
          gradient.addColorStop(
            0.7,
            `rgba(190, 238, 239, ${shootingStar.alpha * fade * 0.45})`,
          );
          gradient.addColorStop(
            1,
            `rgba(255, 250, 238, ${shootingStar.alpha * fade})`,
          );

          context.beginPath();
          context.moveTo(tailX, tailY);
          context.lineTo(headX, headY);
          context.strokeStyle = gradient;
          context.lineWidth = 1.4;
          context.lineCap = "round";
          context.stroke();

          context.fillStyle = `rgba(255, 250, 238, ${shootingStar.alpha * fade})`;
          context.fillRect(headX - 1, headY - 1, 2.5, 2.5);
        }
      }

      animationFrame = requestAnimationFrame(draw);
    };

    resize();
    scheduleNextShootingStar(startedAt);
    animationFrame = requestAnimationFrame(draw);

    const ro =
      contained && rootRef.current
        ? new ResizeObserver(resize)
        : null;
    if (ro && rootRef.current) ro.observe(rootRef.current);
    if (!contained) window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      ro?.disconnect();
      if (!contained) window.removeEventListener("resize", resize);
    };
  }, [contained]);

  const canvas = (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={
        contained
          ? "pointer-events-none absolute inset-0 h-full w-full"
          : "pointer-events-none fixed inset-0 z-0 h-full w-full"
      }
    />
  );

  if (!contained) return canvas;

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-0">
      {canvas}
    </div>
  );
}
