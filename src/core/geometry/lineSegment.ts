import type { LineSegment2D, Point2D } from "./types";
import { nearlyZero } from "./compare";
import { dot, length } from "./vector";

export interface LineIntersectionResult {
  readonly type: "none" | "point" | "overlap";
  readonly point?: Point2D;
}

/**
 * Пересечение отрезков в 2D (включая касание).
 * Коллинеарное пересечение возвращает `overlap` без вычисления сегмента перекрытия (достаточно для CAD-предикатов).
 */
export function intersectLineSegments(s1: LineSegment2D, s2: LineSegment2D): LineIntersectionResult {
  const p = s1.a;
  const r = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
  const q = s2.a;
  const s = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };

  const rxs = cross2(r, s);
  const qmpx = { x: q.x - p.x, y: q.y - p.y };

  if (nearlyZero(rxs)) {
    if (!nearlyZero(cross2(qmpx, r))) {
      return { type: "none" };
    }
    return { type: "overlap" };
  }

  const t = cross2(qmpx, s) / rxs;
  const u = cross2(qmpx, r) / rxs;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      type: "point",
      point: { x: p.x + t * r.x, y: p.y + t * r.y },
    };
  }
  return { type: "none" };
}

function cross2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Ближайшая точка на отрезке к `p` и квадрат расстояния по норме Евклида.
 */
export function projectPointToSegment(p: Point2D, seg: LineSegment2D): { point: Point2D; distanceSq: number } {
  const ab = { x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y };
  const ap = { x: p.x - seg.a.x, y: p.y - seg.a.y };
  const abLenSq = dot(ab, ab);
  if (nearlyZero(abLenSq)) {
    const dx = p.x - seg.a.x;
    const dy = p.y - seg.a.y;
    return { point: seg.a, distanceSq: dx * dx + dy * dy };
  }
  const t = clamp01(dot(ap, ab) / abLenSq);
  const point: Point2D = {
    x: seg.a.x + t * ab.x,
    y: seg.a.y + t * ab.y,
  };
  const dx = p.x - point.x;
  const dy = p.y - point.y;
  return { point, distanceSq: dx * dx + dy * dy };
}

function clamp01(t: number): number {
  if (t < 0) {
    return 0;
  }
  if (t > 1) {
    return 1;
  }
  return t;
}

export function segmentLength(seg: LineSegment2D): number {
  return length({ x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y });
}
