import type { Point2D } from "./types";
import { nearlyEqual } from "./compare";
import { length } from "./vector";

export function distance(a: Point2D, b: Point2D): number {
  return length({ x: b.x - a.x, y: b.y - a.y });
}

export function pointsEqual(a: Point2D, b: Point2D, eps?: number): boolean {
  return nearlyEqual(a.x, b.x, eps) && nearlyEqual(a.y, b.y, eps);
}
