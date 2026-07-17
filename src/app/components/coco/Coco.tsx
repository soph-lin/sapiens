"use client";

import { useEffect, useRef, useState } from "react";
import { Hearts, Snoring } from "./effects";
import {
  COCO_CX,
  COCO_CY,
  COCO_IDLE_PITCH,
  COCO_IDLE_ROLL,
  COCO_IDLE_YAW,
  COCO_REST_PITCH,
  COCO_REST_ROLL,
  COCO_REST_YAW,
  COCO_SCALE,
} from "./placement";

/** Rub travel (px) + hold time before idle → happy */
const RUB_TRAVEL = 90;
const RUB_HOLD_MS = 650;
/** Stay happy briefly after releasing the rub */
const HAPPY_LINGER_MS = 1800;

type Kind = "body" | "eye" | "mouth" | "blush" | "ear" | "tail";

type FormDot = {
  x: number;
  y: number;
  nx: number;
  ny: number;
  nz: number;
  shade: number;
  size: number;
  kind: Kind;
  z: number;
  /** 0–1 along tail spine (animated) */
  u?: number;
  /** cross-section offset on tail (along normal) */
  v?: number;
  /** cross-section offset on tail (along binormal) */
  w?: number;
  /** −1 left / +1 right ear */
  earSide?: -1 | 1;
};

const BODY_R = 0.34;
const FACE_Y = 0.0;
const LEFT_EYE_X = -0.2;
const RIGHT_EYE_X = 0.2;

/** Tail idle bob rate (higher = faster up/down) */
const TAIL_SPEED = 2.05;

/** Body/ear idle squish — vertical breathe */
const EAR_SQUISH_SPEED = 1.15;
const EAR_SQUISH_AMOUNT = 0.045;

/** Talking */
const TALK_SQUISH_SPEED = 15;
const TALK_SQUISH_AMOUNT = 0.055;
const TALK_BOB_AMP = 0.028;
const TALK_OUT_MUL = 0.75; // stronger X/Z spread than idle's 0.55

function distToSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby || 1e-8;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

export type CocoExpression = "sleeping" | "idle" | "happy" | "talking";
export type CocoColor = "default" | "gray";

function restPose(expression: CocoExpression) {
  if (
    expression === "idle" ||
    expression === "happy" ||
    expression === "talking"
  ) {
    return {
      yaw: COCO_IDLE_YAW,
      pitch: COCO_IDLE_PITCH,
      roll: COCO_IDLE_ROLL,
    };
  }
  return {
    yaw: COCO_REST_YAW,
    pitch: COCO_REST_PITCH,
    roll: COCO_REST_ROLL,
  };
}

function squishMotion(expression: CocoExpression) {
  if (expression === "talking") {
    return {
      speed: TALK_SQUISH_SPEED,
      amount: TALK_SQUISH_AMOUNT,
      bob: TALK_BOB_AMP,
      outMul: TALK_OUT_MUL,
    };
  }
  return {
    speed: EAR_SQUISH_SPEED,
    amount: EAR_SQUISH_AMOUNT,
    bob: 0,
    outMul: 0.55,
  };
}

/** Closed caret eyes — ˅˅ (sleeping) */
function eyeCaretDist(x: number, y: number, cx: number, cy: number) {
  const half = 0.045;
  const tipX = cx;
  const tipY = cy + half * 0.7;
  const left = distToSeg(x, y, cx - half, cy - half * 0.35, tipX, tipY);
  const right = distToSeg(x, y, cx + half, cy - half * 0.35, tipX, tipY);
  return Math.min(left, right);
}

/** Open dot eyes — ˙˙ (idle) */
function eyeDotDist(x: number, y: number, cx: number, cy: number) {
  return Math.hypot(x - cx, y - cy);
}

/**
 * Happy arc eyes — ◝ ◜ (upper quadrant arcs).
 * Face y increases downward.
 */
function eyeHappyArcDist(
  x: number,
  y: number,
  cx: number,
  cy: number,
  side: "left" | "right",
) {
  const r = 0.036;
  const dx = x - cx;
  const dy = y - cy;
  const ang = Math.atan2(dy, dx); // 0 = right, −π/2 = up
  // ◝ left eye: upper-right; ◜ right eye: upper-left
  const a0 = side === "left" ? -Math.PI / 2 : -Math.PI;
  const a1 = side === "left" ? 0 : -Math.PI / 2;
  const radial = Math.hypot(dx, dy);
  if (ang >= a0 && ang <= a1) return Math.abs(radial - r);

  const e0x = cx + Math.cos(a0) * r;
  const e0y = cy + Math.sin(a0) * r;
  const e1x = cx + Math.cos(a1) * r;
  const e1y = cy + Math.sin(a1) * r;
  return Math.min(Math.hypot(x - e0x, y - e0y), Math.hypot(x - e1x, y - e1y));
}

function mouthDist(x: number, y: number) {
  const w = 0.075;
  const k = 0.032;
  const cy = FACE_Y + 0.006;
  const t = Math.max(-1, Math.min(1, x / w));
  const ax = t * w;
  const ay = cy + (1 - t * t) * k;
  return Math.hypot(x - ax, y - ay);
}

function blushDist(x: number, y: number, cx: number, cy: number) {
  const dx = (x - cx) / 0.048;
  const dy = (y - cy) / 0.036;
  return Math.hypot(dx, dy);
}

function eyesMatch(x: number, y: number, expression: CocoExpression): boolean {
  if (expression === "idle" || expression === "talking") {
    return (
      eyeDotDist(x, y, LEFT_EYE_X, FACE_Y) < 0.026 ||
      eyeDotDist(x, y, RIGHT_EYE_X, FACE_Y) < 0.026
    );
  }
  if (expression === "happy") {
    return (
      eyeHappyArcDist(x, y, LEFT_EYE_X, FACE_Y, "left") < 0.014 ||
      eyeHappyArcDist(x, y, RIGHT_EYE_X, FACE_Y, "right") < 0.014
    );
  }
  return (
    eyeCaretDist(x, y, LEFT_EYE_X, FACE_Y) < 0.015 ||
    eyeCaretDist(x, y, RIGHT_EYE_X, FACE_Y) < 0.015
  );
}

function faceKind(
  x: number,
  y: number,
  expression: CocoExpression,
): Kind | null {
  if (eyesMatch(x, y, expression)) return "eye";
  if (mouthDist(x, y) < 0.015) return "mouth";
  if (
    blushDist(x, y, -0.22, FACE_Y + 0.05) < 0.8 ||
    blushDist(x, y, 0.22, FACE_Y + 0.05) < 0.8
  ) {
    return "blush";
  }
  return null;
}

/**
 * Monkey-face ♥ outline at the crown.
 * Keep the two lobe humps; carve the cleft AND everything above / outside
 * the heart silhouette (top left/right white caps), matching the drawn contour.
 */
function inHeartDip(x: number, y: number): boolean {
  // Tip of the cleft (above eyes)
  const tipY = -0.09;
  // Two large soft lobes — white "shoulders" of the heart
  const lobeR = 0.17;
  const sep = 0.125;
  const cy = tipY + lobeR * 0.1;

  // Below the tip: face stays intact
  if (y > tipY) return false;

  const dL = Math.hypot(x + sep, y - cy);
  const dR = Math.hypot(x - sep, y - cy);

  // Inside either lobe → keep (the rounded ♥ bumps)
  if (dL <= lobeR || dR <= lobeR) return false;

  // Everything else above tipY is outside the heart outline → carve
  // (cleft + crown + leftover top-left / top-right caps)
  return true;
}

/** Sphere / flattened disk shell — front (+z) and thinner back (−z) */
function addSphereShell(
  pts: Omit<FormDot, "x" | "y" | "z">[],
  cx: number,
  cy: number,
  cz: number,
  r: number,
  step: number,
  kind: Kind,
  opts?: {
    onlyOutsideBody?: boolean;
    faceOnFront?: boolean;
    /** Flatten along Z (1 = sphere, lower = flatter disk) */
    flatZ?: number;
    earSide?: -1 | 1;
    expression?: CocoExpression;
  },
) {
  const flatZ = opts?.flatZ ?? 1;
  const expression = opts?.expression ?? "sleeping";
  let i = 0;
  for (let y = cy - r; y <= cy + r; y += step) {
    for (let x = cx - r; x <= cx + r; x += step) {
      const dx = x - cx;
      const dy = y - cy;
      const rr = dx * dx + dy * dy;
      if (rr > r * r) continue;
      const edge = Math.sqrt(rr) / r;
      if (edge > 0.97 && i % 2 === 0) {
        i++;
        continue;
      }
      const zMag = Math.sqrt(Math.max(0, r * r - rr)) * flatZ;
      const baseShade = 0.55 + (1 - edge) * 0.3 + (i % 5) * 0.025;

      const push = (z: number, k: Kind, shadeMul = 1) => {
        if (opts?.onlyOutsideBody) {
          const d = Math.hypot(x, y, z);
          if (d < BODY_R * 0.94) return;
        }
        // Heart-face dip: carve white dots from the front forehead cleft
        if (opts?.faceOnFront && z >= cz && k === "body" && inHeartDip(x, y)) {
          return;
        }
        pts.push({
          nx: x,
          ny: y,
          nz: z,
          shade: baseShade * shadeMul,
          size: kind === "ear" ? 1.2 : 1.2,
          kind: k,
          earSide: opts?.earSide,
        });
      };

      const frontKind =
        opts?.faceOnFront && zMag + cz > 0
          ? (faceKind(x, y, expression) ?? kind)
          : kind;
      push(cz + zMag, frontKind, 1);
      if (zMag > step * 1.2 && i % 2 === 0) {
        push(cz - zMag, kind, 0.85);
      }
      i++;
    }
  }
}

/**
 * Awake tail — two curves out; undulates along the tube.
 */
function tailSpineAwake(u: number, t: number) {
  const rootX = 0.08;
  const rootY = 0.24;
  const rootZ = -0.18;
  const phase = t * TAIL_SPEED;

  const doubleCurve = Math.sin(u * Math.PI * 2);
  const firstBow = Math.sin(u * Math.PI);
  const len = u * 0.4;

  const undulate = Math.sin(u * Math.PI * 2.4 - phase) * 0.11 * u;

  return {
    x: rootX + firstBow * 0.12 + len * 0.14,
    y: rootY + doubleCurve * 0.14 + firstBow * 0.035 + undulate,
    z: rootZ - len * 0.55 + doubleCurve * 0.09 - firstBow * 0.055,
  };
}

/**
 * Asleep tail — rooted on the back surface, then curled around the body.
 */
function tailSpineAsleep(u: number, t: number) {
  // Match awake root neighborhood, pinned to back surface
  const rootX = 0.08;
  const rootY = 0.24;
  const rootZ = -Math.sqrt(
    Math.max(0.001, BODY_R * BODY_R - rootX * rootX - rootY * rootY),
  );

  const startAng = Math.atan2(rootX, -rootZ);
  const wrap = u * Math.PI * 1.75;
  const ang = startAng + wrap;
  const hug = BODY_R + 0.04;
  const aroundY = rootY * (1 - u) + -0.08 * u + Math.sin(u * Math.PI) * 0.04;
  const settle = Math.sin(t * TAIL_SPEED * 0.35 + u * 1.8) * 0.008 * u;

  const around = {
    x: Math.sin(ang) * hug,
    y: aroundY + settle,
    z: -Math.cos(ang) * hug,
  };

  // Ease out of the exact back root so the tube is visibly connected
  const w = u < 0.001 ? 0 : Math.min(1, u / 0.14);
  const s = w * w * (3 - 2 * w); // smoothstep
  return {
    x: rootX + (around.x - rootX) * s,
    y: rootY + (around.y - rootY) * s,
    z: rootZ + (around.z - rootZ) * s,
  };
}

function tailSpine(u: number, t: number, expression: CocoExpression) {
  // Sleeping: curled around body. Idle / happy / talking: upright undulating.
  return expression === "sleeping"
    ? tailSpineAsleep(u, t)
    : tailSpineAwake(u, t);
}

/** Ear disk layout — shared by mesh + idle flap */
const EAR_R = 0.118;
const EAR_DIST = BODY_R + EAR_R * 0.48;
const EAR_X = EAR_DIST * 0.92;
const EAR_Y = -EAR_DIST * 0.38;
const EAR_Z = 0.02;

function buildCocoMesh(
  expression: CocoExpression,
  step = 0.012,
): Omit<FormDot, "x" | "y" | "z">[] {
  const pts: Omit<FormDot, "x" | "y" | "z">[] = [];

  // Spherical head/body
  addSphereShell(pts, 0, 0, 0, BODY_R, step, "body", {
    faceOnFront: true,
    expression,
  });

  // Larger flatter ears, lower on the sides
  addSphereShell(pts, -EAR_X, EAR_Y, EAR_Z, EAR_R, step * 0.9, "ear", {
    onlyOutsideBody: true,
    flatZ: 0.4,
    earSide: -1,
  });
  addSphereShell(pts, EAR_X, EAR_Y, EAR_Z, EAR_R, step * 0.9, "ear", {
    onlyOutsideBody: true,
    flatZ: 0.4,
    earSide: 1,
  });

  // Tail tube — modest radius, full ring along spine
  const tailSteps = 40;
  const ringAngles = 8;
  const tubeR = 0.026;
  for (let i = 0; i <= tailSteps; i++) {
    const u = i / tailSteps;
    const thick = (0.88 + 0.18 * (1 - u)) * tubeR;
    for (let k = 0; k < ringAngles; k++) {
      if (i % 2 !== 0 && k % 2 !== 0) continue;
      const ang = (k / ringAngles) * Math.PI * 2;
      pts.push({
        nx: 0,
        ny: 0,
        nz: 0,
        shade: 0.58 + (i % 5) * 0.05,
        size: 1.4,
        kind: "tail",
        u,
        v: Math.cos(ang) * thick,
        w: Math.sin(ang) * thick,
      });
    }
  }

  return pts;
}

function rotatePoint(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
) {
  let cos = Math.cos(roll);
  let sin = Math.sin(roll);
  const x1 = x * cos - y * sin;
  const y1 = x * sin + y * cos;
  const z1 = z;

  cos = Math.cos(pitch);
  sin = Math.sin(pitch);
  const y2 = y1 * cos - z1 * sin;
  const z2 = y1 * sin + z1 * cos;
  const x2 = x1;

  cos = Math.cos(yaw);
  sin = Math.sin(yaw);
  const x3 = x2 * cos + z2 * sin;
  const z3 = -x2 * sin + z2 * cos;
  const y3 = y2;

  return { x: x3, y: y3, z: z3 };
}

type CocoProps = {
  /**
   * Face + posture:
   * - sleeping — caret eyes ˅˅, curled tail (+ Snoring)
   * - idle — open eyes ˙˙, upright undulating tail
   * - happy — arc eyes ◝ ◜, same posture as idle (+ Hearts)
   * - talking — idle face/pose, faster bob + stronger jelly squish
   *
   * Rubbing while idle promotes to happy automatically.
   */
  expression?: CocoExpression;
  /** Body palette. The default preserves Coco's original warm ivory appearance. */
  color?: CocoColor;
  /** Optional normalized placement within the containing stage. */
  center?: { x: number; y: number };
  /** Optional size multiplier. The default preserves the original scene scale. */
  scale?: number;
};

/** Coco — pixel blob companion. Drag to rotate / rub in 3D. */
export function Coco({
  expression = "sleeping",
  color = "default",
  center,
  scale: scaleProp,
}: CocoProps) {
  const centerX = center?.x ?? COCO_CX;
  const centerY = center?.y ?? COCO_CY;
  const cocoScale = scaleProp ?? COCO_SCALE;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rubHappy, setRubHappy] = useState(false);
  const [exprProp, setExprProp] = useState(expression);
  if (expression !== exprProp) {
    setExprProp(expression);
    setRubHappy(false);
  }
  const liveExpression: CocoExpression =
    rubHappy && expression === "idle" ? "happy" : expression;

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
    let formDots: FormDot[] = [];
    let mesh = buildCocoMesh(expression);
    let live = expression;
    const started = performance.now();
    let rest = restPose(live);

    let yaw = rest.yaw;
    let pitch = rest.pitch;
    let roll = rest.roll;
    let targetYaw = rest.yaw;
    let targetPitch = rest.pitch;
    let targetRoll = rest.roll;

    let dragging = false;
    let lastPx = 0;
    let lastPy = 0;
    let velYaw = 0;
    let velPitch = 0;

    let rubTravel = 0;
    let rubStartedAt = 0;
    let happyTimer = 0;

    const applyExpression = (next: CocoExpression) => {
      if (next === live) return;
      live = next;
      mesh = buildCocoMesh(live);
      rest = restPose(live);
      seedForm();
      setRubHappy(next === "happy");
    };

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
      seedForm();
    };

    const seedForm = () => {
      const scale = Math.min(w, h) * cocoScale;
      const cx = w * centerX;
      const cy = h * centerY;
      formDots = mesh.map((p) => {
        let lx = p.nx;
        let ly = p.ny;
        let lz = p.nz;
        if (p.kind === "tail") {
          const s = tailSpine(p.u ?? 0, 0, live);
          lx = s.x;
          ly = s.y;
          lz = s.z;
        }
        const r = rotatePoint(lx, ly, lz, yaw, pitch, roll);
        const persp = 1.65 / (1.65 + r.z + 0.55);
        return {
          ...p,
          x: cx + r.x * persp * scale,
          y: cy + r.y * persp * scale,
          z: r.z,
        };
      });
    };

    const project = (d: FormDot, t: number) => {
      const scale = Math.min(w, h) * cocoScale;
      const cx = w * centerX;
      const cy = h * centerY;

      const motion = squishMotion(live);
      // Soft squash & stretch on body + ears (tail keeps its own undulation)
      const breath = reduceMotion
        ? 0
        : Math.sin(t * motion.speed) * motion.amount;
      // Compress Y, spread X/Z — talking spreads out more
      const sx = 1 + breath * motion.outMul;
      const sy = 1 - breath;
      const sz = 1 + breath * (motion.outMul * 0.65);
      const bobY = reduceMotion ? 0 : Math.sin(t * motion.speed) * motion.bob;

      let lx = d.nx;
      let ly = d.ny;
      let lz = d.nz;

      if (d.kind === "tail") {
        const u = d.u ?? 0;
        const vv = d.v ?? 0;
        const ww = d.w ?? 0;
        const animT = reduceMotion ? 0 : t;
        const a = tailSpine(u, animT, live);
        const b = tailSpine(Math.min(1, u + 0.02), animT, live);
        const tx = b.x - a.x;
        const ty = b.y - a.y;
        const tz = b.z - a.z;
        // Orthonormal frame around spine for a fat tube
        let px = -ty;
        let py = tx;
        let pz = 0;
        let plen = Math.hypot(px, py, pz);
        if (plen < 1e-5) {
          px = 0;
          py = -tz;
          pz = ty;
          plen = Math.hypot(px, py, pz) || 1;
        }
        px /= plen;
        py /= plen;
        pz /= plen;
        const bx = ty * pz - tz * py;
        const by = tz * px - tx * pz;
        const bz = tx * py - ty * px;
        const bl = Math.hypot(bx, by, bz) || 1;
        lx = a.x + px * vv + (bx / bl) * ww;
        ly = a.y + py * vv + (by / bl) * ww;
        lz = a.z + pz * vv + (bz / bl) * ww;
        // Talk-bob rides along with the body
        ly += bobY;
      } else {
        // Body + ears share idle/talk squish + bob
        lx *= sx;
        ly = ly * sy + bobY;
        lz *= sz;
      }

      const r = rotatePoint(lx, ly, lz, yaw, pitch, roll);
      const persp = 1.65 / (1.65 + r.z + 0.55);
      return {
        x: cx + r.x * persp * scale,
        y: cy + r.y * persp * scale,
        z: r.z,
        persp,
      };
    };

    const colorFor = (d: FormDot, breath: number, depthLit: number) => {
      const lit = (0.9 + breath * 1.2) * depthLit;

      if (d.kind === "blush") {
        const br = (200 + d.shade * 40) * lit;
        const mix = 0.62;
        const r = Math.floor(br * (1 - mix) + 228 * mix);
        const g = Math.floor(br * 0.97 * (1 - mix) + 148 * mix);
        const b = Math.floor(br * 0.92 * (1 - mix) + 158 * mix);
        return `rgba(${r},${g},${b},${0.85})`;
      }

      if (d.kind === "eye" || d.kind === "mouth") {
        const c = Math.floor(38 + d.shade * 16);
        return `rgba(${c},${c + 2},${c + 8},${0.98})`;
      }

      // Ears + tail share body grain (same creature)
      const base = (color === "gray" ? 142 : 200) + d.shade * (color === "gray" ? 38 : 45);
      const r = Math.floor(Math.min(255, base * lit));
      const g = Math.floor(Math.min(255, base * lit * (color === "gray" ? 1 : 0.98)));
      const b = Math.floor(
        Math.min(255, base * lit * (color === "gray" ? 1.02 : 0.93) + (color === "gray" ? 2 : 6)),
      );
      const alpha =
        d.kind === "tail" ? 0.68 + d.shade * 0.2 : 0.72 + d.shade * 0.2;
      return `rgba(${r},${g},${b},${alpha})`;
    };

    const drawForm = (t: number) => {
      const motion = squishMotion(live);
      const breath = reduceMotion
        ? 0
        : Math.sin(t * motion.speed) * motion.amount;
      const follow = reduceMotion ? 1 : 0.38;

      const projected: {
        d: FormDot;
        sx: number;
        sy: number;
        z: number;
        persp: number;
      }[] = [];

      for (let i = 0; i < formDots.length; i++) {
        const d = formDots[i];
        const target = project(d, t);
        // Tail needs snappy follow; body/ears stay soft with squish
        const f = d.kind === "tail" ? (reduceMotion ? 1 : 0.55) : follow;
        d.x += (target.x - d.x) * f;
        d.y += (target.y - d.y) * f;
        d.z = target.z;
        projected.push({
          d,
          sx: d.x,
          sy: d.y,
          z: target.z,
          persp: target.persp,
        });
      }

      projected.sort((a, b) => a.z - b.z);

      for (const p of projected) {
        const depthLit = 0.55 + 0.55 * Math.max(0, (p.z + 0.4) / 0.8);
        const sizeMul = 0.85 + 0.35 * p.persp;
        ctx.fillStyle = colorFor(p.d, breath, depthLit);
        ctx.fillRect(p.sx, p.sy, p.d.size * sizeMul, p.d.size * sizeMul);
      }
    };

    const frame = (now: number) => {
      const t = (now - started) / 1000;

      if (!dragging && !reduceMotion) {
        targetYaw += velYaw;
        targetPitch += velPitch;
        velYaw *= 0.92;
        velPitch *= 0.92;
        targetYaw += (rest.yaw - targetYaw) * 0.02;
        targetPitch += (rest.pitch - targetPitch) * 0.02;
        targetRoll += (rest.roll - targetRoll) * 0.04;
      }

      yaw += (targetYaw - yaw) * 0.18;
      pitch += (targetPitch - pitch) * 0.18;
      roll += (targetRoll - roll) * 0.18;

      targetPitch = Math.max(-1.2, Math.min(1.0, targetPitch));
      targetYaw = Math.max(-1.8, Math.min(1.8, targetYaw));

      ctx.clearRect(0, 0, w, h);
      drawForm(t);
      raf = requestAnimationFrame(frame);
    };

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      velYaw = 0;
      velPitch = 0;
      lastPx = e.clientX;
      lastPy = e.clientY;
      rubTravel = 0;
      rubStartedAt = performance.now();
      if (happyTimer) {
        window.clearTimeout(happyTimer);
        happyTimer = 0;
      }
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastPx;
      const dy = e.clientY - lastPy;
      lastPx = e.clientX;
      lastPy = e.clientY;
      const sens = 0.0055;
      targetYaw += dx * sens;
      targetPitch -= dy * sens;
      velYaw = dx * sens * 0.35;
      velPitch = -dy * sens * 0.35;

      // Idle rub → happy + hearts
      if (expression === "idle" || live === "happy") {
        rubTravel += Math.hypot(dx, dy);
        const held = performance.now() - rubStartedAt;
        if (
          live === "idle" &&
          expression === "idle" &&
          rubTravel >= RUB_TRAVEL &&
          held >= RUB_HOLD_MS
        ) {
          applyExpression("happy");
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      canvas.style.cursor = "grab";

      if (live === "happy" && expression === "idle") {
        happyTimer = window.setTimeout(() => {
          happyTimer = 0;
          if (!dragging) applyExpression("idle");
        }, HAPPY_LINGER_MS);
      }
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    const resizeObserver = new ResizeObserver(resize);
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      cancelAnimationFrame(raf);
      if (happyTimer) window.clearTimeout(happyTimer);
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
    // Base prop only — happy is applied in-place without remounting
  }, [cocoScale, color, centerX, centerY, expression]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="Coco — drag to rotate"
        className="absolute inset-0 h-full w-full cursor-grab touch-none"
      />
      {liveExpression === "sleeping" && (
        <Snoring centerX={centerX} centerY={centerY} scale={cocoScale} />
      )}
      <Hearts active={liveExpression === "happy"} />
    </>
  );
}
