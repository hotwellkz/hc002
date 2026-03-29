import type { BBox2D, Point2D, Rect2D } from "./types";
import { unionBBox } from "./bbox";

export function rectToBBox(rect: Rect2D): BBox2D {
  const x1 = rect.origin.x;
  const y1 = rect.origin.y;
  const x2 = rect.origin.x + rect.width;
  const y2 = rect.origin.y + rect.height;
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
}

export function rectCorners(rect: Rect2D): [Point2D, Point2D, Point2D, Point2D] {
  const { origin: o, width: w, height: h } = rect;
  return [
    o,
    { x: o.x + w, y: o.y },
    { x: o.x + w, y: o.y + h },
    { x: o.x, y: o.y + h },
  ];
}

export function unionRects(a: Rect2D, b: Rect2D): BBox2D {
  return unionBBox(rectToBBox(a), rectToBBox(b));
}
