"use client";

import { useEffect, useRef } from "react";

type Vec2 = { x: number; y: number };

type Particle = {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  shade: number;
  size: number;
  phase: number;
  speed: number;
  amp: number;
};

type WavePoint = {
  nx: number; // 0–1 across width
  depth: number; // 0 far → 1 near
  shade: number;
  size: number;
  phase: number;
};

type Phase = "ship" | "stars" | "carousel" | "flowers" | "fireworks";

/** Phase holds — ship is the longest scene */
const SHIP_HOLD_MS = 5000; // Main phase
const TRANSITION_PHASE_HOLD = 5000;
/** Morph duration between phases (lower = faster) */
const MORPH_MS = 1100;

/**
 * Lock a phase for testing.
 * - `"default"` — normal cycle (ship → random transition → ship…)
 * - any Phase — freeze fully formed on that scene
 */
const FORCE_PHASE: Phase | "default" = "default";

/** Non-ship phases the cycle can morph into */
const TRANSITION_PHASES: Phase[] = [
  "stars",
  "carousel",
  "flowers",
  "fireworks",
];

const HORSE_COUNT = 6;

type MeshPt = { x: number; y: number; z: number; bob: number };

function pointInPoly(x: number, y: number, poly: Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function rasterizePoly(poly: Vec2[], step: number) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const pts: Vec2[] = [];
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      if (pointInPoly(x, y, poly)) pts.push({ x, y });
    }
  }
  return pts;
}

/** Sailboat — hull + mast + sail (leave geometry alone) */
const SHIP: Vec2[] = (() => {
  const pts: Vec2[] = [];
  for (let x = -0.42; x <= 0.42; x += 0.028) {
    const depth = 0.08 + 0.04 * Math.cos((x / 0.42) * Math.PI * 0.5);
    for (let y = 0.12; y <= 0.12 + depth; y += 0.026) {
      if (Math.abs(x) < 0.38 - (y - 0.12) * 1.8) pts.push({ x, y });
    }
  }
  for (let y = -0.38; y <= 0.14; y += 0.024) pts.push({ x: 0.02, y });
  for (let x = 0.02; x <= 0.32; x += 0.026) pts.push({ x, y: 0.1 });
  for (let t = 0; t <= 1; t += 0.04) {
    const topY = -0.36;
    const botY = 0.08;
    const y = topY + (botY - topY) * t;
    const maxW = 0.28 * t;
    for (let x = 0.04; x <= 0.04 + maxW; x += 0.026) {
      pts.push({ x, y });
    }
  }
  pts.push({ x: 0.02, y: -0.42 });
  pts.push({ x: -0.04, y: -0.38 });
  pts.push({ x: 0.02, y: -0.34 });
  return pts;
})();

const STARS: Vec2[] = (() => {
  const anchors: Vec2[] = [
    { x: -0.38, y: -0.28 },
    { x: -0.18, y: -0.36 },
    { x: 0.02, y: -0.22 },
    { x: 0.22, y: -0.34 },
    { x: 0.4, y: -0.18 },
    { x: -0.28, y: 0.02 },
    { x: -0.04, y: 0.08 },
    { x: 0.18, y: 0.0 },
    { x: 0.34, y: 0.12 },
    { x: -0.12, y: 0.28 },
    { x: 0.1, y: 0.34 },
    { x: 0.28, y: 0.26 },
  ];
  const pts: Vec2[] = [];

  const addStar = (cx: number, cy: number, r = 0.042) => {
    // Soft core
    for (let dy = -r * 0.4; dy <= r * 0.4; dy += 0.005) {
      for (let dx = -r * 0.4; dx <= r * 0.4; dx += 0.005) {
        if (dx * dx + dy * dy <= r * 0.38 * (r * 0.38)) {
          pts.push({ x: cx + dx, y: cy + dy });
        }
      }
    }
    // Primary + diagonal sparkle arms
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2 - Math.PI / 2;
      const armR = a % 2 === 0 ? r : r * 0.55;
      for (let d = 0.004; d <= armR; d += 0.0045) {
        pts.push({
          x: cx + Math.cos(ang) * d,
          y: cy + Math.sin(ang) * d,
        });
        // slight thickness
        pts.push({
          x: cx + Math.cos(ang) * d + Math.cos(ang + Math.PI / 2) * 0.003,
          y: cy + Math.sin(ang) * d + Math.sin(ang + Math.PI / 2) * 0.003,
        });
      }
    }
  };

  for (const s of anchors) addStar(s.x, s.y);

  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [2, 6],
    [5, 6],
    [6, 7],
    [7, 8],
    [6, 9],
    [9, 10],
    [10, 11],
  ];
  for (const [i, j] of links) {
    const a = anchors[i];
    const b = anchors[j];
    for (let t = 0.04; t < 0.96; t += 0.035) {
      pts.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      // Soft dust beside the link
      if (t > 0.15 && t < 0.85 && Math.floor(t * 40) % 2 === 0) {
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const len = Math.hypot(nx, ny) || 1;
        pts.push({
          x: a.x + (b.x - a.x) * t + (nx / len) * 0.008,
          y: a.y + (b.y - a.y) * t + (ny / len) * 0.008,
        });
      }
    }
  }

  return pts;
})();

/**
 * High-res carousel horse (side profile facing +x), plus full merry-go-round
 * mesh: canopy, column, deck, poles, and horses.
 */
const HORSE_TEMPLATE: Vec2[] = (() => {
  const body: Vec2[] = [
    { x: 0.12, y: -0.012 },
    { x: 0.138, y: -0.03 },
    { x: 0.135, y: -0.05 },
    { x: 0.118, y: -0.06 },
    { x: 0.1, y: -0.052 },
    { x: 0.09, y: -0.075 },
    { x: 0.075, y: -0.105 },
    { x: 0.055, y: -0.092 },
    { x: 0.04, y: -0.08 },
    { x: 0.015, y: -0.07 },
    { x: -0.015, y: -0.058 },
    { x: -0.045, y: -0.045 },
    { x: -0.07, y: -0.03 },
    { x: -0.092, y: -0.018 },
    { x: -0.105, y: 0.008 },
    { x: -0.108, y: 0.035 },
    { x: -0.095, y: 0.055 },
    { x: -0.13, y: 0.072 },
    { x: -0.148, y: 0.05 },
    { x: -0.132, y: 0.028 },
    { x: -0.11, y: 0.018 },
    { x: -0.098, y: 0.055 },
    { x: -0.105, y: 0.095 },
    { x: -0.09, y: 0.12 },
    { x: -0.07, y: 0.105 },
    { x: -0.078, y: 0.07 },
    { x: -0.04, y: 0.055 },
    { x: 0.015, y: 0.05 },
    { x: 0.055, y: 0.048 },
    { x: 0.062, y: 0.082 },
    { x: 0.055, y: 0.115 },
    { x: 0.075, y: 0.122 },
    { x: 0.088, y: 0.088 },
    { x: 0.082, y: 0.052 },
    { x: 0.1, y: 0.022 },
    { x: 0.112, y: 0.002 },
  ];
  const pts = rasterizePoly(body, 0.005);

  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = 0.07 - t * 0.1;
    const y = -0.075 + t * 0.025;
    for (let k = 0; k < 4; k++) {
      pts.push({ x: x - k * 0.006, y: y - 0.012 - k * 0.004 });
    }
  }

  for (let x = -0.055; x <= 0.02; x += 0.006) {
    for (let y = -0.03; y <= -0.005; y += 0.006) {
      pts.push({ x, y });
    }
  }

  pts.push({ x: 0.108, y: -0.042 });
  pts.push({ x: 0.112, y: -0.04 });
  pts.push({ x: 0.105, y: -0.038 });
  for (let x = 0.1; x <= 0.128; x += 0.006) {
    pts.push({ x, y: -0.035 });
  }

  return pts;
})();

const CAROUSEL_MESH: MeshPt[] = (() => {
  const mesh: MeshPt[] = [];
  const add = (x: number, y: number, z: number, bob = 0) => {
    mesh.push({ x, y, z, bob });
  };

  const FLOOR_Y = 0.2;
  const ROOF_Y = -0.3;
  const PEAK_Y = -0.5;
  const HORSE_R = 0.3;
  const ROOF_R = 0.45;
  const DECK_INNER = 0.1;
  const DECK_OUTER = 0.42;

  // Center column
  for (let y = PEAK_Y + 0.02; y <= FLOOR_Y + 0.02; y += 0.01) {
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      const r = 0.035 + (y > ROOF_Y ? 0.012 : 0);
      add(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  for (const y of [FLOOR_Y - 0.02, 0.05, ROOF_Y + 0.02, PEAK_Y + 0.08]) {
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      add(Math.cos(a) * 0.055, y, Math.sin(a) * 0.055);
    }
  }

  // Finial
  for (let y = PEAK_Y - 0.06; y <= PEAK_Y + 0.01; y += 0.008) {
    const t = (y - (PEAK_Y - 0.06)) / 0.07;
    const r = 0.012 * Math.sin(t * Math.PI);
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      add(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }

  // Conical canopy
  for (let ring = 0; ring <= 10; ring++) {
    const t = ring / 10;
    const y = PEAK_Y + (ROOF_Y - PEAK_Y) * t;
    const r = ROOF_R * t * 0.98;
    const step = Math.max(0.08, 0.22 - t * 0.12);
    for (let a = 0; a < Math.PI * 2; a += step) {
      add(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (let t = 0.08; t <= 1; t += 0.045) {
      add(
        Math.cos(a) * ROOF_R * t,
        PEAK_Y + (ROOF_Y - PEAK_Y) * t,
        Math.sin(a) * ROOF_R * t,
      );
    }
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const scallop = 0.025 * Math.sin(i * 0.5 * Math.PI);
    const r = ROOF_R + scallop;
    add(Math.cos(a) * r, ROOF_Y, Math.sin(a) * r);
    add(Math.cos(a) * r, ROOF_Y + 0.04 + Math.abs(scallop), Math.sin(a) * r);
    if (i % 2 === 0) {
      for (let d = 0; d < 0.07; d += 0.012) {
        add(
          Math.cos(a) * (ROOF_R - 0.01),
          ROOF_Y + 0.02 + d,
          Math.sin(a) * (ROOF_R - 0.01),
        );
      }
    }
  }

  // Deck
  for (let ring = 0; ring <= 8; ring++) {
    const t = ring / 8;
    const r = DECK_INNER + (DECK_OUTER - DECK_INNER) * t;
    const step = Math.max(0.07, 0.2 - t * 0.1);
    for (let a = 0; a < Math.PI * 2; a += step) {
      add(Math.cos(a) * r, FLOOR_Y, Math.sin(a) * r);
    }
  }
  for (let a = 0; a < Math.PI * 2; a += 0.06) {
    add(Math.cos(a) * DECK_OUTER, FLOOR_Y, Math.sin(a) * DECK_OUTER);
    add(Math.cos(a) * DECK_OUTER, FLOOR_Y + 0.035, Math.sin(a) * DECK_OUTER);
    add(
      Math.cos(a) * (DECK_OUTER + 0.015),
      FLOOR_Y + 0.05,
      Math.sin(a) * (DECK_OUTER + 0.015),
    );
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    for (let r = DECK_INNER; r <= DECK_OUTER; r += 0.02) {
      add(Math.cos(a) * r, FLOOR_Y - 0.002, Math.sin(a) * r);
    }
  }

  // Horses + poles
  for (let h = 0; h < HORSE_COUNT; h++) {
    const ang = (h / HORSE_COUNT) * Math.PI * 2;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);

    for (let y = ROOF_Y; y <= FLOOR_Y; y += 0.009) {
      add(sin * HORSE_R, y, cos * HORSE_R);
      add(sin * HORSE_R + cos * 0.008, y, cos * HORSE_R - sin * 0.008);
    }
    for (let a = 0; a < Math.PI * 2; a += 0.6) {
      add(
        sin * HORSE_R + Math.cos(a) * 0.02,
        ROOF_Y + 0.015,
        cos * HORSE_R + Math.sin(a) * 0.02,
      );
    }

    const hs = 1.15;
    for (const lp of HORSE_TEMPLATE) {
      const lx = lp.x * hs;
      const ly = lp.y * hs;
      const radial = -0.01;
      const x3 = sin * (HORSE_R + radial) + lx * cos;
      const z3 = cos * (HORSE_R + radial) - lx * sin;
      const y3 = FLOOR_Y - 0.125 + ly;
      add(x3, y3, z3, h + 1);
    }
  }

  return mesh;
})();

/** 2D fallback for morph seeding */
const CAROUSEL: Vec2[] = CAROUSEL_MESH.map((p) => ({
  x: p.x * 0.95,
  y: p.y * 0.95,
}));

type FlowerPt = {
  x: number;
  y: number;
  z: number;
  kind: "petal" | "center";
};

/** Water lily flower only (spins flat in flowersScreen). */
const FLOWER_MESH: FlowerPt[] = (() => {
  const mesh: FlowerPt[] = [];
  const add = (x: number, y: number, z: number, kind: FlowerPt["kind"]) => {
    mesh.push({ x, y, z, kind });
  };

  // —— Water lily petals ——
  const layers = [
    { count: 16, r: 0.46, y: 0.02 },
    { count: 14, r: 0.4, y: 0.035 },
    { count: 12, r: 0.34, y: 0.05 },
    { count: 11, r: 0.27, y: 0.06 },
    { count: 10, r: 0.2, y: 0.07 },
    { count: 8, r: 0.12, y: 0.08 },
  ];

  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const ang = (i / layer.count) * Math.PI * 2 + layer.r * 1.7;
      for (let u = 0.06; u <= 1; u += 0.04) {
        const pr = layer.r * u;
        const halfW = layer.r * 0.2 * Math.sin(u * Math.PI);
        for (let s = -1; s <= 1; s += 0.4) {
          const lat = s * halfW;
          const x = Math.cos(ang) * pr - Math.sin(ang) * lat;
          const z = Math.sin(ang) * pr + Math.cos(ang) * lat;
          const y = layer.y + Math.sin(u * Math.PI) * 0.03;
          add(x, y, z * 0.9, "petal");
        }
      }
      const tipR = layer.r * 1.04;
      add(
        Math.cos(ang) * tipR,
        layer.y + 0.025,
        Math.sin(ang) * tipR * 0.9,
        "petal",
      );
    }
  }

  // Center cluster (stamens)
  for (let a = 0; a < Math.PI * 2; a += 0.35) {
    for (let r = 0; r < 0.035; r += 0.008) {
      add(Math.cos(a) * r, 0.09, Math.sin(a) * r, "center");
    }
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    add(Math.cos(a) * 0.02, 0.105, Math.sin(a) * 0.02, "center");
    add(Math.cos(a) * 0.012, 0.12, Math.sin(a) * 0.012, "center");
  }

  return mesh;
})();

const FLOWERS: Vec2[] = FLOWER_MESH.map((p) => ({
  x: p.x,
  y: p.y * 0.35 + p.z * 0.85, // top-down-ish preview for morph seed
}));

type FireworkSpark = {
  burst: number;
  ang: number;
  speed: number;
  /** 0 = leading tip, 1 = lagging trail ember */
  along: number;
  /** 0 core, 1 shell, 2 glitter */
  layer: 0 | 1 | 2;
  hue: number;
};

const FW_BURSTS = [
  { x: -0.22, y: -0.24, delay: 0.0, hue: 0 },
  { x: 0.28, y: -0.28, delay: 1.05, hue: 1 },
  { x: 0.02, y: -0.36, delay: 2.0, hue: 2 },
  { x: -0.32, y: -0.12, delay: 2.85, hue: 3 },
  { x: 0.24, y: -0.14, delay: 3.6, hue: 4 },
] as const;

const FW_CYCLE = 5.2;
const FW_RAYS = 96;
const FW_TRAIL = 12;

const FIREWORK_SPARKS: FireworkSpark[] = (() => {
  const sparks: FireworkSpark[] = [];
  for (let b = 0; b < FW_BURSTS.length; b++) {
    const hue = FW_BURSTS[b].hue;
    for (let r = 0; r < FW_RAYS; r++) {
      // Slight irregular spacing — real shells aren't perfect gears
      const ang =
        (r / FW_RAYS) * Math.PI * 2 + b * 0.11 + Math.sin(r * 1.7 + b) * 0.018;
      const speed = 0.88 + ((r * 31 + b * 17) % 11) * 0.028;

      for (let t = 0; t < FW_TRAIL; t++) {
        const along = t / (FW_TRAIL - 1);
        sparks.push({
          burst: b,
          ang,
          speed,
          along,
          layer: along < 0.15 ? 0 : 1,
          hue,
        });
      }

      // Glitter forks that drift off the main ray
      if (r % 2 === 0) {
        for (const side of [-1, 1]) {
          for (let g = 0; g < 4; g++) {
            sparks.push({
              burst: b,
              ang: ang + side * (0.03 + g * 0.012),
              speed: speed * (0.55 + g * 0.08),
              along: 0.35 + g * 0.15,
              layer: 2,
              hue,
            });
          }
        }
      }
    }
  }
  return sparks;
})();

/** Fully bloomed shells — morph seed target */
const FIREWORKS: Vec2[] = FIREWORK_SPARKS.map((s) => {
  const burst = FW_BURSTS[s.burst];
  const layerMul = s.layer === 2 ? 0.7 : s.layer === 0 ? 0.35 : 1;
  const r = 0.26 * s.speed * layerMul * (1 - s.along * 0.45);
  return {
    x: burst.x + Math.cos(s.ang) * r,
    y: burst.y + Math.sin(s.ang) * r,
  };
});

const SHAPES: Record<Phase, Vec2[]> = {
  ship: SHIP,
  stars: STARS,
  carousel: CAROUSEL,
  flowers: FLOWERS,
  fireworks: FIREWORKS,
};

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function pickTransitionPhase(): Phase {
  return TRANSITION_PHASES[
    Math.floor(Math.random() * TRANSITION_PHASES.length)
  ];
}

export function PixelWaveHero() {
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
    let waves: WavePoint[] = [];
    let locals: Record<Phase, Vec2[]> = {
      ship: [],
      stars: [],
      carousel: [],
      flowers: [],
      fireworks: [],
    };
    let formDots: { x: number; y: number; shade: number; size: number }[] = [];
    const started = performance.now();

    // Cycle: hold phase → morph to next → hold → …
    type Seg = "hold" | "morph";
    let seg: Seg = "hold";
    let segStart = 0;
    let phase: Phase = "ship";
    let fromPhase: Phase = "ship";

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedField();
      seedWaves();
      seedShapes();
    };

    const seedField = () => {
      const density = Math.min(900, Math.floor((w * h) / 1400));
      field = [];
      for (let i = 0; i < density; i++) {
        field.push({
          x: Math.random() * w,
          y: Math.random() * h,
          homeX: Math.random() * w,
          homeY: Math.random() * h * 0.45,
          shade: 0.15 + Math.random() * 0.45,
          size: Math.random() < 0.9 ? 1 : 1.4,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.7,
          amp: 4 + Math.random() * 10,
        });
      }
    };

    const seedWaves = () => {
      waves = [];
      const cols = Math.max(48, Math.floor(w / 14));
      const rows = 42;
      for (let row = 0; row < rows; row++) {
        const depth = row / (rows - 1);
        const rowCols = Math.floor(cols * (0.45 + depth * 0.7));
        for (let col = 0; col < rowCols; col++) {
          const nx = (col + 0.5) / rowCols;
          const layers = depth > 0.35 ? 3 : 2;
          for (let layer = 0; layer < layers; layer++) {
            waves.push({
              nx: nx + (Math.random() - 0.5) * 0.01,
              depth: Math.min(1, depth + layer * 0.012),
              shade: 0.25 + Math.random() * 0.75,
              size: 1 + depth * 1.2 + (Math.random() < 0.15 ? 0.8 : 0),
              phase: Math.random() * 0.4,
            });
          }
        }
      }
    };

    const seedShape = (phase: Phase, density: number) => {
      const src = SHAPES[phase];
      const count = Math.max(src.length, Math.floor(src.length * density));
      const out: Vec2[] = [];
      const scale = Math.min(w, h) * 0.55;
      for (let i = 0; i < count; i++) {
        const p = src[i % src.length];
        const jitter = i >= src.length ? (Math.random() - 0.5) * 2.8 : 0;
        out.push({
          x: p.x + jitter / scale,
          y: p.y + jitter / scale,
        });
      }
      return out;
    };

    /** Pad a dense shape to the morph pool size with micro-offsets (not coarse repeats). */
    const padShape = (src: Vec2[], target: number) => {
      const out = src.map((p) => ({ ...p }));
      const scale = Math.min(w, h) * 0.55;
      let i = 0;
      while (out.length < target) {
        const p = src[i % src.length];
        const scatter = ((i / src.length) % 1) * 1.6;
        out.push({
          x: p.x + ((Math.random() - 0.5) * (1.2 + scatter)) / scale,
          y: p.y + ((Math.random() - 0.5) * (1.2 + scatter)) / scale,
        });
        i++;
      }
      return out;
    };

    const seedShapes = () => {
      const ship = seedShape("ship", 2.2);
      const starsBase = seedShape("stars", 1); // template already dense
      const flowersBase = FLOWER_MESH.map((p) => ({ x: p.x, y: p.y }));
      const fireworksBase = FIREWORKS.map((p) => ({ ...p }));
      const pool = Math.max(
        ship.length,
        starsBase.length,
        CAROUSEL_MESH.length,
        FLOWER_MESH.length,
        FIREWORK_SPARKS.length,
      );
      locals = {
        ship: padShape(ship, pool),
        stars: padShape(starsBase, pool),
        carousel: padShape(
          CAROUSEL_MESH.map((p) => ({ x: p.x, y: p.y })),
          pool,
        ),
        flowers: padShape(flowersBase, pool),
        fireworks: padShape(fireworksBase, pool),
      };
      formDots = [];
      for (let i = 0; i < pool; i++) {
        formDots.push({
          x: w * 0.5,
          y: h * 0.5,
          shade: 0.55 + (i % 7) * 0.06,
          // keep dots tiny so dense stars read sharp, not chunky
          size: i % 11 === 0 ? 1.35 : 1,
        });
      }
    };

    /** Shared sea height field — perspective + rising swell */
    const sea = (nx: number, depth: number, t: number) => {
      const rise = t * 0.55;
      const travel = depth * 3.2 - rise;
      const roll = Math.sin(nx * Math.PI * 3.4 + travel + depth * 0.9);
      const roll2 =
        Math.sin(nx * Math.PI * 7.1 - t * 0.85 + depth * 2.1) * 0.35;
      const roll3 = Math.sin(nx * Math.PI * 1.6 + t * 0.4 + depth * 1.4) * 0.45;
      const crest = roll + roll2 + roll3;
      const amp = 10 + depth * 38;
      const elev = crest * amp;
      const slope =
        Math.cos(nx * Math.PI * 3.4 + travel + depth * 0.9) * 0.7 +
        Math.cos(nx * Math.PI * 7.1 - t * 0.85 + depth * 2.1) * 0.25;
      return { elev, slope, crest };
    };

    const projectWave = (nx: number, depth: number, t: number) => {
      const { elev, slope, crest } = sea(nx, depth, t);
      const vanishY = h * 0.38;
      const nearY = h * 0.92;
      const yPersp = vanishY + (nearY - vanishY) * Math.pow(depth, 1.35);
      const edgePull = (1 - depth) * 0.08;
      const x = w * (edgePull * 0.5 + nx * (1 - edgePull));
      const face = crest < 0 ? -crest * depth * 14 : 0;
      const y = yPersp - elev + face;
      return { x, y, slope, crest, depth };
    };

    const shipBob = (t: number) => {
      const sample = sea(0.5, 0.72, t);
      return {
        y: sample.elev * 0.55,
        tilt: sample.slope * 0.035,
      };
    };

    const shipScreen = (t: number, i: number) => {
      const scale = Math.min(w, h) * 0.55;
      const cx = w * 0.5;
      const cy = h * 0.52;
      const bob = reduceMotion ? { y: 0, tilt: 0 } : shipBob(t);
      const cos = Math.cos(bob.tilt);
      const sin = Math.sin(bob.tilt);
      const p = locals.ship[i % locals.ship.length];
      const rx = p.x * cos - (p.y - 0.12) * sin;
      const ry = p.x * sin + (p.y - 0.12) * cos + 0.12;
      return {
        x: cx + rx * scale,
        y: cy + ry * scale - bob.y,
        z: 0,
      };
    };

    const starsScreen = (t: number, i: number) => {
      const scale = Math.min(w, h) * 0.52;
      const cx = w * 0.5;
      const cy = h * 0.48;
      const p = locals.stars[i % locals.stars.length];
      const drift = reduceMotion ? 0 : Math.sin(t * 0.35 + i * 0.17) * 2.5;
      return {
        x: cx + p.x * scale + drift,
        y: cy + p.y * scale + Math.sin(t * 0.28 + i * 0.11) * 1.8,
        z: 0,
      };
    };

    /** Merry-go-round: yaw whole structure, bob horses on poles */
    const carouselScreen = (t: number, i: number) => {
      const scale = Math.min(w, h) * 0.82;
      const cx = w * 0.5;
      const cy = h * 0.5;
      const pt = CAROUSEL_MESH[i % CAROUSEL_MESH.length];
      const yaw = reduceMotion ? 0.35 : t * 0.42;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);

      const bob =
        pt.bob > 0 && !reduceMotion
          ? Math.sin(t * 2.4 + (pt.bob - 1) * ((Math.PI * 2) / HORSE_COUNT)) *
            0.045
          : 0;

      const x3 = pt.x * cos + pt.z * sin;
      const z3 = -pt.x * sin + pt.z * cos;
      const y3 = pt.y + bob;

      // Slight camera tilt so roof / deck read as 3D volume
      const tilt = 0.32;
      const yT = y3 * Math.cos(tilt) - z3 * Math.sin(tilt);
      const zT = y3 * Math.sin(tilt) + z3 * Math.cos(tilt);

      const persp = 1.7 / (1.7 + zT + 0.65);
      return {
        x: cx + x3 * persp * scale,
        y: cy + yT * persp * scale,
        z: zT,
      };
    };

    /** Flat XY spin — no tilt/perspective wobble; soft radial water ripple */
    const flowersScreen = (t: number, i: number) => {
      const scale = Math.min(w, h) * 1.15;
      const cx = w * 0.5;
      const cy = h * 0.52;
      const pt = FLOWER_MESH[i % FLOWER_MESH.length];
      const yaw = reduceMotion ? 0.4 : t * 0.28;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);

      let x = pt.x * cos + pt.z * sin;
      let z = -pt.x * sin + pt.z * cos;

      // Small outward ripples in-plane (water)
      const r = Math.hypot(x, z) || 1e-4;
      if (!reduceMotion) {
        const wave =
          Math.sin(r * 16 - t * 3.4) * 0.01 + Math.sin(r * 9 - t * 2.1) * 0.006;
        x += (x / r) * wave;
        z += (z / r) * wave;
      }

      // Stable paint order: petals under center
      const layer = pt.kind === "petal" ? 0 : 1;

      return {
        x: cx + x * scale,
        y: cy + z * scale,
        z: layer,
      };
    };

    /** Expanding concentric water rings around the lily */
    const drawFlowerRipples = (t: number, alphaMul: number) => {
      if (alphaMul < 0.02 || reduceMotion) return;
      const scale = Math.min(w, h) * 1.15;
      const cx = w * 0.5;
      const cy = h * 0.52;
      const ringCount = 5;
      for (let n = 0; n < ringCount; n++) {
        const phase = (t * 0.42 + n / ringCount) % 1;
        const radius = 0.22 + phase * 0.62;
        const alpha = (1 - phase) * (1 - phase) * 0.4 * alphaMul;
        const step = Math.max(0.035, 0.055 / (0.6 + phase));
        for (let a = 0; a < Math.PI * 2; a += step) {
          // mild azimuthal shimmer
          const jitter = Math.sin(a * 6 + t * 2 + n) * 0.004;
          const rr = radius + jitter;
          const x = cx + Math.cos(a) * rr * scale;
          const y = cy + Math.sin(a) * rr * scale;
          ctx.fillStyle = `rgba(170, 205, 215, ${alpha})`;
          ctx.fillRect(x, y, 1.15, 1.15);
        }
      }
    };

    /** Peony shells: true radial expand + lagging trails + glitter */
    const fireworksScreen = (t: number, i: number) => {
      const scale = Math.min(w, h) * 1.05;
      const cx = w * 0.5;
      const cy = h * 0.56;
      const spark = FIREWORK_SPARKS[i % FIREWORK_SPARKS.length];
      const burst = FW_BURSTS[spark.burst];
      const cycle = reduceMotion ? FW_CYCLE * 0.4 : FW_CYCLE;
      let local = (t - burst.delay) % cycle;
      if (local < 0) local += cycle;

      const riseEnd = 0.62;
      const boomEnd = 3.1;
      let x = 0;
      let y = 0;
      let life = 1;

      const layerMul = spark.layer === 0 ? 0.42 : spark.layer === 2 ? 0.72 : 1;
      const v0 = 0.72 * spark.speed * layerMul;
      const drag = 1.65;

      if (local < riseEnd) {
        // Thin ascending rocket trail (only denser sparks along path)
        const u = local / riseEnd;
        const ease = 1 - Math.pow(1 - u, 2.2);
        const groundY = 0.52;
        x = burst.x * ease * 0.15;
        y =
          groundY +
          (burst.y - groundY) * ease +
          spark.along * 0.055 * (1 - ease * 0.3);
        life =
          spark.along < 0.5 && spark.layer !== 2
            ? 0.55 + (1 - spark.along) * 0.45
            : 0.08;
      } else if (local < boomEnd) {
        // Radial outward with exponential drag — circular peony bloom
        const age = local - riseEnd;
        // Trailing embers lag behind the tip along the same ray
        const tipAge = Math.max(0, age - spark.along * 0.42);
        const r = (v0 / drag) * (1 - Math.exp(-drag * tipAge));
        const grav = 0.38 * tipAge * tipAge;
        x = burst.x + Math.cos(spark.ang) * r;
        y = burst.y + Math.sin(spark.ang) * r + grav;
        // Bright core / fading outer glitter
        const fade = Math.min(1, tipAge / 0.08);
        life =
          fade *
          (1 - Math.min(1, tipAge / (boomEnd - riseEnd)) * 0.75) *
          (spark.layer === 2 ? 0.75 : 1);
      } else {
        const age = local - riseEnd;
        const tipAge = Math.max(0, age - spark.along * 0.42);
        const r = (v0 / drag) * (1 - Math.exp(-drag * Math.min(tipAge, 2.4)));
        const u = (local - boomEnd) / (cycle - boomEnd);
        const grav = 0.38 * tipAge * tipAge;
        x = burst.x + Math.cos(spark.ang) * r * (1 - u * 0.08);
        y = burst.y + Math.sin(spark.ang) * r * (1 - u * 0.08) + grav;
        life = Math.max(0, 0.4 * (1 - u) * (spark.layer === 0 ? 0.5 : 1));
      }

      return {
        x: cx + x * scale,
        y: cy + y * scale,
        z: spark.along,
        life,
        hue: spark.hue,
        layer: spark.layer,
      };
    };

    const phaseScreen = (p: Phase, t: number, i: number) => {
      if (p === "ship") return shipScreen(t, i);
      if (p === "stars") return starsScreen(t, i);
      if (p === "carousel") return carouselScreen(t, i);
      if (p === "flowers") return flowersScreen(t, i);
      return fireworksScreen(t, i);
    };

    /** phase = current/target form; t = 0 at fromPhase, 1 at phase */
    const sceneState = (
      elapsed: number,
    ): { phase: Phase; fromPhase: Phase; t: number } => {
      if (FORCE_PHASE !== "default") {
        return { phase: FORCE_PHASE, fromPhase: FORCE_PHASE, t: 1 };
      }
      if (reduceMotion) {
        return { phase: "ship", fromPhase: "ship", t: 1 };
      }

      let guard = 0;
      while (guard++ < 8) {
        const local = elapsed - segStart;
        if (seg === "hold") {
          if (local < (phase === "ship" ? SHIP_HOLD_MS : TRANSITION_PHASE_HOLD))
            break;
          fromPhase = phase;
          phase = phase === "ship" ? pickTransitionPhase() : "ship";
          seg = "morph";
          segStart = elapsed;
          continue;
        }
        if (local < MORPH_MS) break;
        fromPhase = phase;
        seg = "hold";
        segStart = elapsed;
      }

      if (seg === "hold") {
        return { phase, fromPhase: phase, t: 1 };
      }
      return {
        phase,
        fromPhase,
        t: easeInOut(Math.min(1, (elapsed - segStart) / MORPH_MS)),
      };
    };

    const drawGradients = () => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      const horizon = ctx.createLinearGradient(0, h * 0.3, 0, h);
      horizon.addColorStop(0, "rgba(0,0,0,0)");
      horizon.addColorStop(0.45, "rgba(18, 32, 40, 0.4)");
      horizon.addColorStop(0.75, "rgba(28, 48, 52, 0.55)");
      horizon.addColorStop(1, "rgba(8, 14, 18, 0.7)");
      ctx.fillStyle = horizon;
      ctx.fillRect(0, 0, w, h);

      const teal = ctx.createRadialGradient(
        w * 0.2,
        h * 0.55,
        0,
        w * 0.2,
        h * 0.55,
        w * 0.6,
      );
      teal.addColorStop(0, "rgba(24, 78, 72, 0.22)");
      teal.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = teal;
      ctx.fillRect(0, 0, w, h);

      const steel = ctx.createRadialGradient(
        w * 0.8,
        h * 0.4,
        0,
        w * 0.8,
        h * 0.4,
        w * 0.55,
      );
      steel.addColorStop(0, "rgba(36, 52, 78, 0.2)");
      steel.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = steel;
      ctx.fillRect(0, 0, w, h);

      const center = ctx.createRadialGradient(
        w * 0.5,
        h * 0.42,
        0,
        w * 0.5,
        h * 0.42,
        Math.min(w, h) * 0.42,
      );
      center.addColorStop(0, "rgba(255, 248, 235, 0.05)");
      center.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = center;
      ctx.fillRect(0, 0, w, h);
    };

    const phaseWeight = (
      target: Phase,
      from: Phase,
      to: Phase,
      morphT: number,
    ) => (from === target ? 1 - morphT : 0) + (to === target ? morphT : 0);

    const drawField = (t: number, from: Phase, to: Phase, morphT: number) => {
      const starsW = phaseWeight("stars", from, to, morphT);
      const flowersW = phaseWeight("flowers", from, to, morphT);
      const fieldBoost =
        0.35 +
        starsW * 0.45 +
        phaseWeight("carousel", from, to, morphT) * 0.18 +
        flowersW * 0.12 +
        phaseWeight("fireworks", from, to, morphT) * 0.25;
      for (const p of field) {
        const y =
          p.homeY + Math.sin(p.homeX * 0.01 + t * p.speed + p.phase) * p.amp;
        const twinkle =
          starsW > 0
            ? 0.7 + 0.3 * Math.sin(t * (1.2 + p.speed) + p.phase) * starsW
            : 1;
        const alpha = p.shade * fieldBoost * twinkle;
        const g = Math.floor(180 + p.shade * 60);
        ctx.fillStyle = `rgba(${g},${g},${Math.min(255, g + 10)},${alpha})`;
        ctx.fillRect(p.homeX, y, p.size, p.size);
      }
    };

    const drawWaves = (t: number, alphaMul: number) => {
      if (alphaMul < 0.01) return;
      for (let i = 0; i < waves.length; i++) {
        const wp = waves[i];
        const { x, y, slope, crest, depth } = projectWave(
          wp.nx,
          wp.depth,
          reduceMotion ? 0 : t,
        );

        const lit = 0.35 + slope * 0.35 + Math.max(0, crest) * 0.2;
        const depthFade = 0.2 + depth * 0.75;
        const alpha = Math.min(
          0.95,
          wp.shade * lit * depthFade * 0.85 * alphaMul,
        );
        const base = 160 + lit * 70 + depth * 20;
        const g = Math.floor(Math.min(255, base));
        const r = Math.floor(g * (crest > 0.2 ? 1 : 0.88));
        const b = Math.floor(Math.min(255, g * (crest > 0.2 ? 0.95 : 1.08)));
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        const s = wp.size * (0.7 + depth * 0.8);
        ctx.fillRect(x, y, s, s);

        if (crest > 0.65 && depth > 0.4 && wp.shade > 0.6) {
          ctx.fillStyle = `rgba(255,255,255,${(0.35 + depth * 0.35) * alphaMul})`;
          ctx.fillRect(x, y - s * 0.6, s * 0.8, s * 0.8);
        }
      }
    };

    const drawForm = (t: number, from: Phase, to: Phase, morphT: number) => {
      const settling = Math.min(morphT, 1 - morphT);
      const starsW = phaseWeight("stars", from, to, morphT);
      const carouselW = phaseWeight("carousel", from, to, morphT);
      const flowersW = phaseWeight("flowers", from, to, morphT);
      const fireworksW = phaseWeight("fireworks", from, to, morphT);
      // Snap-follow for crisp spinning / timed fireworks
      const follow = reduceMotion
        ? 1
        : flowersW > 0.7 || fireworksW > 0.7
          ? 1
          : 0.28 + (1 - settling * 2) * 0.45;

      // Depth sort for carousel / stable layer order for flowers
      const order = Array.from({ length: formDots.length }, (_, i) => i);
      if (carouselW > 0.05 || flowersW > 0.05) {
        const depthAt = new Float32Array(formDots.length);
        for (let i = 0; i < formDots.length; i++) {
          const a = phaseScreen(from, t, i);
          const b = phaseScreen(to, t, i);
          depthAt[i] = a.z * (1 - morphT) + b.z * morphT;
        }
        order.sort((i, j) => depthAt[i] - depthAt[j]);
      }

      for (const i of order) {
        const a = phaseScreen(from, t, i);
        const b = phaseScreen(to, t, i);
        const tx = a.x + (b.x - a.x) * morphT;
        const ty = a.y + (b.y - a.y) * morphT;
        const tz = a.z + (b.z - a.z) * morphT;
        const lifeA = "life" in a && typeof a.life === "number" ? a.life : 1;
        const lifeB = "life" in b && typeof b.life === "number" ? b.life : 1;
        const life = lifeA * (1 - morphT) + lifeB * morphT;
        const hue =
          "hue" in b && typeof b.hue === "number"
            ? b.hue
            : "hue" in a && typeof a.hue === "number"
              ? a.hue
              : 0;
        const d = formDots[i];
        d.x += (tx - d.x) * follow;
        d.y += (ty - d.y) * follow;

        const twinkle =
          starsW > 0.05
            ? 0.75 + 0.25 * Math.sin(t * 2.1 + i * 0.37) * starsW
            : 1;
        // Flat flowers: no perspective size/light pulse
        const depthLit =
          carouselW > 0.05 ? 0.4 + 0.6 * Math.max(0, (tz + 0.55) / 1.2) : 1;
        const sizeMul =
          carouselW > 0.05
            ? 0.8 + 0.4 * Math.max(0, (tz + 0.5) / 1.1)
            : fireworksW > 0.05
              ? (() => {
                  const sp = FIREWORK_SPARKS[i % FIREWORK_SPARKS.length];
                  if (sp.layer === 0) return 1.55;
                  if (sp.layer === 2) return 0.7;
                  return 1.05 + (1 - sp.along) * 0.35;
                })()
              : 1;

        const base = 210 + d.shade * 45 * depthLit;
        let r = base;
        let g = base;
        let bl = Math.min(255, base + 6);

        if (flowersW > 0.05) {
          const fp = FLOWER_MESH[i % FLOWER_MESH.length];
          let fr = base;
          let fg = base;
          let fb = bl;
          if (fp.kind === "petal") {
            fr = 235 + d.shade * 20;
            fg = 215 + d.shade * 25;
            fb = 225 + d.shade * 25;
          } else {
            fr = 245 + d.shade * 10;
            fg = 225 + d.shade * 15;
            fb = 165 + d.shade * 25;
          }
          r = base * (1 - flowersW) + fr * flowersW;
          g = base * (1 - flowersW) + fg * flowersW;
          bl = bl * (1 - flowersW) + fb * flowersW;
        }

        if (fireworksW > 0.05) {
          // gold / pink / cyan / white / coral — tips hotter, trails cooler
          const palettes = [
            [255, 220, 130],
            [255, 150, 200],
            [150, 235, 255],
            [255, 252, 245],
            [255, 145, 105],
          ];
          const sp = FIREWORK_SPARKS[i % FIREWORK_SPARKS.length];
          let [fr, fg, fb] = palettes[hue % palettes.length];
          const tip = 1 - sp.along * 0.45;
          fr = Math.min(255, fr * tip + 40 * (1 - sp.along));
          fg = Math.min(255, fg * tip + 20 * (1 - sp.along));
          fb = Math.min(255, fb * tip);
          if (sp.layer === 0) {
            fr = Math.min(255, fr + 30);
            fg = Math.min(255, fg + 25);
            fb = Math.min(255, fb + 20);
          }
          r = base * (1 - fireworksW) + fr * fireworksW;
          g = base * (1 - fireworksW) + fg * fireworksW;
          bl = bl * (1 - fireworksW) + fb * fireworksW;
        }

        const alpha =
          (0.75 + d.shade * 0.2) *
          twinkle *
          depthLit *
          (fireworksW > 0.05 ? 0.25 + life * 0.75 : 1) *
          (1 - fireworksW + fireworksW * Math.max(0, Math.min(1, life)));
        if (alpha < 0.02) continue;
        ctx.fillStyle = `rgba(${Math.floor(r)},${Math.floor(g)},${Math.floor(bl)},${alpha})`;
        ctx.fillRect(d.x, d.y, d.size * sizeMul, d.size * sizeMul);
      }
    };

    const frame = (now: number) => {
      const elapsed = now - started;
      const t = elapsed / 1000;
      const { phase, fromPhase, t: morphT } = sceneState(elapsed);
      const shipBlend = phaseWeight("ship", fromPhase, phase, morphT);
      const flowersW = phaseWeight("flowers", fromPhase, phase, morphT);

      drawGradients();
      drawField(t, fromPhase, phase, morphT);
      drawWaves(t, shipBlend);
      drawFlowerRipples(t, flowersW);
      drawForm(t, fromPhase, phase, morphT);

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
      className="absolute inset-0 h-full w-full"
    />
  );
}
