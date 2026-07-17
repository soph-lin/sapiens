export type Vec2 = { x: number; y: number };

/** Sailboat — hull + mast + sail (shared with PixelWaveHero) */
export const SHIP: Vec2[] = (() => {
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

/** Draw the pixel sailboat centered at (cx, cy) in screen space. */
export function drawPixelShip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  opts?: { tilt?: number; alpha?: number },
) {
  const tilt = opts?.tilt ?? 0;
  const alpha = opts?.alpha ?? 1;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const pixel = Math.max(1, scale * 0.028);

  for (const p of SHIP) {
    const rx = p.x * cos - (p.y - 0.12) * sin;
    const ry = p.x * sin + (p.y - 0.12) * cos + 0.12;
    const x = cx + rx * scale;
    const y = cy + ry * scale;
    const g = 210 + Math.floor((p.y + 0.42) * 35);
    ctx.fillStyle = `rgba(${g},${g},${Math.min(255, g + 8)},${alpha})`;
    ctx.fillRect(x, y, pixel, pixel);
  }
}
