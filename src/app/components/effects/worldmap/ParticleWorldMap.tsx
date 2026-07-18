"use client";

import { useEffect, useRef } from "react";
import { WORLD_MAP_COUNT, forEachWorldMap } from "./worldMap";

type Particle = {
  x: number;
  y: number;
  shade: number;
  size: number;
  phase: number;
  speed: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 5.5;
/** Crop extreme poles so continents read larger in-frame. */
const LAT_CROP = 0.05;
const BASE_MAP_PAD = 0;

/**
 * Flat equirectangular world as soft particles — drag to pan, scroll/pinch to zoom.
 * Exhibit-style: no chrome, gesture-only.
 */
export default function ParticleWorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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
    let particles: Particle[] = [];
    const started = performance.now();

    let zoom = MIN_ZOOM;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let activePointers = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;
    let pinchStartZoom = 1;

    const seed = () => {
      particles = [];
      forEachWorldMap((x, y, i) => {
        particles.push({
          x,
          y,
          shade: 0.42 + ((i * 17) % 40) / 100,
          size: i % 11 === 0 ? 1.45 : i % 5 === 0 ? 1.2 : 1,
          phase: (i * 0.37) % (Math.PI * 2),
          speed: 0.35 + ((i * 13) % 70) / 100,
        });
      });
    };

    const mapLayout = () => {
      const availW = w * (1 - BASE_MAP_PAD * 2);
      // Most-zoomed-out frame: full screen width (equirectangular 2:1)
      const mapW = availW;
      const mapH = mapW * 0.5;
      return {
        mapW,
        mapH,
        originX: (w - mapW) / 2,
        originY: (h - mapH) / 2,
      };
    };

    const clampPan = () => {
      const { mapW, mapH } = mapLayout();
      const scaledW = mapW * zoom;
      const scaledH = mapH * zoom;
      const maxX = Math.max(0, (scaledW - w) / 2 + mapW * 0.08);
      const maxY = Math.max(0, (scaledH - h) / 2 + mapH * 0.08);
      panX = Math.max(-maxX, Math.min(maxX, panX));
      panY = Math.max(-maxY, Math.min(maxY, panY));
    };

    const project = (nx: number, ny: number) => {
      const { mapW, mapH, originX, originY } = mapLayout();
      const cx = w * 0.5;
      const cy = h * 0.5;
      const yN = (ny - LAT_CROP) / (1 - LAT_CROP * 2);
      const localX = originX + nx * mapW - cx;
      const localY = originY + yN * mapH - cy;
      return {
        x: cx + localX * zoom + panX,
        y: cy + localY * zoom + panY,
      };
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
      clampPan();
    };

    const draw = (now: number) => {
      const t = (now - started) / 1000;
      ctx.clearRect(0, 0, w, h);

      const sizeMul = Math.max(0.9, Math.min(1.85, zoom * 1.05));

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const { x, y } = project(p.x, p.y);
        if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;

        const twinkle = reduceMotion
          ? 1
          : 0.78 + 0.22 * Math.sin(t * p.speed + p.phase);
        const base = 215 + p.shade * 40;
        const alpha = (0.62 + p.shade * 0.35) * twinkle;
        ctx.fillStyle = `rgba(${Math.floor(base)},${Math.floor(base)},${Math.min(255, Math.floor(base + 8))},${alpha})`;
        const s = p.size * sizeMul;
        ctx.fillRect(x, y, s, s);
      }

      raf = requestAnimationFrame(draw);
    };

    const zoomAt = (clientX: number, clientY: number, nextZoom: number) => {
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const prev = zoom;
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      const wx = (px - w * 0.5 - panX) / prev;
      const wy = (py - h * 0.5 - panY) / prev;
      panX = px - w * 0.5 - wx * zoom;
      panY = py - h * 0.5 - wy * zoom;
      clampPan();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Scroll up / pinch-out → zoom in only; cannot zoom out past full-width fit
      if (event.deltaY > 0 && zoom <= MIN_ZOOM) return;
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      zoomAt(event.clientX, event.clientY, zoom * factor);
    };

    const onPointerDown = (event: PointerEvent) => {
      root.setPointerCapture(event.pointerId);
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (activePointers.size === 1) {
        dragging = true;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        root.style.cursor = "grabbing";
      } else if (activePointers.size === 2) {
        dragging = false;
        const pts = [...activePointers.values()];
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchStartZoom = zoom;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId)) return;
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (activePointers.size === 2) {
        const pts = [...activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStartDist > 0) {
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          zoomAt(midX, midY, pinchStartZoom * (dist / pinchStartDist));
        }
        return;
      }

      if (!dragging) return;
      panX += event.clientX - lastPointerX;
      panY += event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      clampPan();
    };

    const endPointer = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (activePointers.size === 0) {
        dragging = false;
        root.style.cursor = "grab";
      } else if (activePointers.size === 1) {
        const remaining = [...activePointers.values()][0];
        dragging = true;
        lastPointerX = remaining.x;
        lastPointerY = remaining.y;
        root.style.cursor = "grabbing";
      }
    };

    seed();
    resize();
    raf = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(root);

    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", endPointer);
    root.addEventListener("pointercancel", endPointer);
    root.addEventListener("lostpointercapture", endPointer);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", endPointer);
      root.removeEventListener("pointercancel", endPointer);
      root.removeEventListener("lostpointercapture", endPointer);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative h-full min-h-72 w-full cursor-grab touch-none select-none active:cursor-grabbing"
      role="img"
      aria-label={`Interactive particle world map with ${WORLD_MAP_COUNT.toLocaleString()} points. Drag to pan, scroll or pinch to zoom.`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
