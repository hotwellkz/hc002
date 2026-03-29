import type { Vector2D } from "./types";
import { nearlyZero } from "./compare";

export function length(v: Vector2D): number {
  return Math.hypot(v.x, v.y);
}

export function dot(a: Vector2D, b: Vector2D): number {
  return a.x * b.x + a.y * b.y;
}

export function normalize(v: Vector2D): Vector2D | null {
  const len = length(v);
  if (nearlyZero(len)) {
    return null;
  }
  return { x: v.x / len, y: v.y / len };
}

/** Угол между векторами в радианах, диапазон [0, π]. */
export function angleBetween(a: Vector2D, b: Vector2D): number {
  const la = length(a);
  const lb = length(b);
  if (nearlyZero(la) || nearlyZero(lb)) {
    return 0;
  }
  const c = clampCos(dot(a, b) / (la * lb));
  return Math.acos(c);
}

function clampCos(value: number): number {
  if (value > 1) {
    return 1;
  }
  if (value < -1) {
    return -1;
  }
  return value;
}
