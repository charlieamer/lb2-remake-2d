import type { Vec2 } from './types.js';

export const TAU = Math.PI * 2;
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const angleTo = (a: Vec2, b: Vec2): number => Math.atan2(b.y - a.y, b.x - a.x);
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (v: Vec2, n: number): Vec2 => ({ x: v.x * n, y: v.y * n });
export const fromAngle = (radians: number): Vec2 => ({ x: Math.cos(radians), y: Math.sin(radians) });

export const normalizeAngle = (angle: number): number => {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
};

export const rotateToward = (current: number, target: number, maxDelta: number): number => {
  const delta = normalizeAngle(target - current);
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
};

export const seededNoise = (x: number, y: number, seed = 7): number => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
};

export const smoothNoise = (x: number, y: number, seed = 7): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = seededNoise(ix, iy, seed);
  const b = seededNoise(ix + 1, iy, seed);
  const c = seededNoise(ix, iy + 1, seed);
  const d = seededNoise(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
};
