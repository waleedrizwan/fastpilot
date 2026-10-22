// Timing and path generators that make input look like a person's hand,
// scaled by the speed setting. Pure functions, no chrome APIs (unit-testable).

import type { Speed } from '../shared/types';

export interface Point { x: number; y: number }
export interface PathStep extends Point { dt: number }

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Minimum-jerk profile: slow start, fast middle, slow finish, like a real reach.
const minJerk = (t: number) => t * t * t * (10 - 15 * t + 6 * t * t);

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Mouse positions (with delay before each) from `from` to `to`. The last step is exactly `to`. */
export function mousePath(from: Point, to: Point, speed: Speed): PathStep[] {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (speed === 'instant' || dist < 2) return [{ ...to, dt: 0 }];

  const [lo, hi] = speed === 'fast' ? [70, 150] : [220, 600];
  // Fitts-like: longer moves take longer, with diminishing returns.
  const duration = clamp((lo + (hi - lo) * Math.min(1, Math.log2(1 + dist / 200) / 3)) * rand(0.85, 1.15), lo, hi);

  const overshoot = speed === 'natural' && dist > 300 && Math.random() < 0.6;
  const ux = (to.x - from.x) / dist, uy = (to.y - from.y) / dist;
  const end = overshoot ? { x: to.x + ux * rand(4, 12), y: to.y + uy * rand(4, 12) } : to;

  // Bend the path sideways a little; real arm movements are arcs, not lines.
  const bend = rand(-0.2, 0.2) * Math.min(dist, 400);
  const c1 = { x: from.x + (end.x - from.x) * 0.3 - uy * bend, y: from.y + (end.y - from.y) * 0.3 + ux * bend };
  const c2 = { x: from.x + (end.x - from.x) * 0.7 - uy * bend * rand(0.4, 1), y: from.y + (end.y - from.y) * 0.7 + ux * bend * rand(0.4, 1) };

  const steps = Math.max(4, Math.round(duration / (speed === 'fast' ? 12 : 16)));
  const jitter = speed === 'natural' ? 0.6 : 0;
  const out: PathStep[] = [];
  for (let i = 1; i <= steps; i++) {
    const p = bezier(from, c1, c2, end, minJerk(i / steps));
    const j = i === steps ? 0 : jitter;
    out.push({ x: p.x + rand(-j, j), y: p.y + rand(-j, j), dt: duration / steps });
  }
  if (overshoot) {
    const back = Math.round(rand(3, 5));
    const corr = rand(60, 120);
    for (let i = 1; i <= back; i++) {
      const t = minJerk(i / back);
      out.push({ x: end.x + (to.x - end.x) * t, y: end.y + (to.y - end.y) * t, dt: corr / back });
    }
  }
  out[out.length - 1] = { ...to, dt: out[out.length - 1].dt };
  return out;
}

/** A click point inside the element, not always the dead center. */
export function clickPoint(cx: number, cy: number, w: number, h: number, speed: Speed): Point {
  if (speed === 'instant') return { x: cx, y: cy };
  return { x: cx + rand(-0.2, 0.2) * Math.min(w, 120), y: cy + rand(-0.2, 0.2) * Math.min(h, 40) };
}

/** How long the button stays down during a click. */
export function pressHold(speed: Speed): number {
  return speed === 'instant' ? 0 : speed === 'fast' ? rand(15, 35) : rand(50, 110);
}

/** Delay after typing `ch`. */
export function keyDelay(speed: Speed, ch: string): number {
  if (speed === 'instant') return 0;
  if (speed === 'fast') return rand(5, 14);
  let d = rand(45, 120);
  if (ch === ' ' || /[.,!?]/.test(ch)) d += rand(20, 70);
  if (Math.random() < 0.04) d += rand(150, 350); // occasional hesitation
  return d;
}

/** Splits a scroll distance into wheel ticks with delays between them. */
export function wheelTicks(deltaY: number, speed: Speed): { dy: number; dt: number }[] {
  if (speed === 'instant') return [{ dy: deltaY, dt: 0 }];
  const ticks: { dy: number; dt: number }[] = [];
  let left = deltaY;
  while (Math.abs(left) > 0.5) {
    const step = Math.sign(left) * Math.min(Math.abs(left), rand(90, 130));
    ticks.push({ dy: step, dt: speed === 'fast' ? rand(8, 18) : rand(30, 70) });
    left -= step;
  }
  return ticks;
}
