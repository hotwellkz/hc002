import type { Point2D } from "./types";

/** Ось-ориентированный прямоугольник в мм (мир 2D). */
export interface AxisAlignedRectMm {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function normalizeRectMmFromCorners(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): AxisAlignedRectMm {
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minY: Math.min(y0, y1),
    maxY: Math.max(y0, y1),
  };
}

export function segmentBoundsMm(a: Point2D, b: Point2D): AxisAlignedRectMm {
  return normalizeRectMmFromCorners(a.x, a.y, b.x, b.y);
}

export function rectsIntersectMm(a: AxisAlignedRectMm, b: AxisAlignedRectMm): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function pointInRectMm(p: Point2D, r: AxisAlignedRectMm): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
}
