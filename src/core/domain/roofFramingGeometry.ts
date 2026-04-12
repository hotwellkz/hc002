import { intersectLineSegments } from "@/core/geometry/lineSegment";
import type { LineSegment2D } from "@/core/geometry/types";
import { pointInPolygonOrNearBoundaryMm } from "./roofRafterGeometry";
import type { Point2D } from "../geometry/types";
import type { Project } from "./project";
import type { Wall } from "./wall";

/**
 * Отрезок в плане пересекает ось стены (отрезок стены) не только в общей вершине —
 * грубая проверка для отсечения подкосов через перегородки.
 */
export function planSegmentCrossesWallInterior(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  wall: Wall,
): boolean {
  const s1: LineSegment2D = { a: { x: ax, y: ay }, b: { x: bx, y: by } };
  const s2: LineSegment2D = { a: { ...wall.start }, b: { ...wall.end } };
  const hit = intersectLineSegments(s1, s2);
  if (hit.type !== "point" || !hit.point) {
    return hit.type === "overlap";
  }
  const { x, y } = hit.point;
  const dA = Math.hypot(x - ax, y - ay);
  const dB = Math.hypot(x - bx, y - by);
  const dWall = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const dWs = Math.hypot(x - wall.start.x, y - wall.start.y);
  const dWe = Math.hypot(x - wall.end.x, y - wall.end.y);
  const tol = 25;
  if (dA < tol || dB < tol) {
    return false;
  }
  if (dWs < tol || dWe < tol) {
    return false;
  }
  if (dWall < tol) {
    return false;
  }
  return true;
}

export function planStrutClearOfWalls(
  project: Project,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  layerId: string,
): boolean {
  for (const w of project.walls) {
    if (w.layerId !== layerId) {
      continue;
    }
    if (planSegmentCrossesWallInterior(ax, ay, bx, by, w)) {
      return false;
    }
  }
  return true;
}

/** Середина отрезка в контуре крыши — грубая проверка для подкосов. */
export function planSegmentMidpointInsideFootprint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  footprint: readonly Point2D[],
): boolean {
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  return pointInPolygonOrNearBoundaryMm(mx, my, footprint, 8);
}

/**
 * Ищет t ∈ [tLo, tHi] на линии стропила (низ–верх), чтобы угол к горизонтали был ~45–60°.
 */
export function findRafterParameterForElevationAngleDeg(
  footX: number,
  footY: number,
  footZ: number,
  ridgeX: number,
  ridgeY: number,
  ridgeZ: number,
  postX: number,
  postY: number,
  postBottomZ: number,
  tLo: number,
  tHi: number,
  minDeg: number,
  maxDeg: number,
): number | null {
  const fx = ridgeX - footX;
  const fy = ridgeY - footY;
  const fz = ridgeZ - footZ;
  let bestT: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const steps = 36;
  for (let i = 0; i <= steps; i++) {
    const t = tLo + ((tHi - tLo) * i) / steps;
    const x = footX + fx * t;
    const y = footY + fy * t;
    const z = footZ + fz * t;
    const horiz = Math.hypot(x - postX, y - postY);
    const vert = z - postBottomZ;
    if (!(horiz > 15)) {
      continue;
    }
    const ang = (Math.atan2(vert, horiz) * 180) / Math.PI;
    if (ang >= minDeg && ang <= maxDeg) {
      const score = Math.abs(ang - (minDeg + maxDeg) * 0.5);
      if (score < bestScore) {
        bestScore = score;
        bestT = t;
      }
    }
  }
  if (bestT != null) {
    return bestT;
  }
  let fallback: number | null = null;
  let fbScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= steps; i++) {
    const t = tLo + ((tHi - tLo) * i) / steps;
    const x = footX + fx * t;
    const y = footY + fy * t;
    const z = footZ + fz * t;
    const horiz = Math.hypot(x - postX, y - postY);
    const vert = z - postBottomZ;
    if (!(horiz > 10)) {
      continue;
    }
    const ang = (Math.atan2(vert, horiz) * 180) / Math.PI;
    const clamped = Math.max(minDeg - 8, Math.min(maxDeg + 8, ang));
    const score = Math.abs(clamped - ang);
    if (ang >= minDeg - 8 && ang <= maxDeg + 8 && score < fbScore) {
      fbScore = score;
      fallback = t;
    }
  }
  return fallback;
}
