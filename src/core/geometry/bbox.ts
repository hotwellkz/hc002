import type { BBox2D, Point2D } from "./types";
import { nearlyEqual } from "./compare";

export function emptyBBox(): BBox2D {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

export function isEmptyBBox(b: BBox2D): boolean {
  return b.minX > b.maxX || b.minY > b.maxY;
}

export function unionBBox(a: BBox2D, b: BBox2D): BBox2D {
  if (isEmptyBBox(a)) {
    return b;
  }
  if (isEmptyBBox(b)) {
    return a;
  }
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function expandBBoxToPoint(b: BBox2D, p: Point2D): BBox2D {
  if (isEmptyBBox(b)) {
    return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  }
  return {
    minX: Math.min(b.minX, p.x),
    minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x),
    maxY: Math.max(b.maxY, p.y),
  };
}

export function bboxWidth(b: BBox2D): number {
  return b.maxX - b.minX;
}

export function bboxHeight(b: BBox2D): number {
  return b.maxY - b.minY;
}

export function bboxContainsPoint(b: BBox2D, p: Point2D, eps?: number): boolean {
  return (
    p.x + (eps ?? 0) >= b.minX &&
    p.x - (eps ?? 0) <= b.maxX &&
    p.y + (eps ?? 0) >= b.minY &&
    p.y - (eps ?? 0) <= b.maxY
  );
}

export function bboxesEqual(a: BBox2D, b: BBox2D, eps = 1e-6): boolean {
  return (
    nearlyEqual(a.minX, b.minX, eps) &&
    nearlyEqual(a.minY, b.minY, eps) &&
    nearlyEqual(a.maxX, b.maxX, eps) &&
    nearlyEqual(a.maxY, b.maxY, eps)
  );
}
