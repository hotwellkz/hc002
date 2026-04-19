/**
 * Ортогональная проекция модели на вертикальную плоскость фасада.
 * План (мм): X, Y; высота Z (мм вверх) — как в {@link roofPlanVertexToThreeMm} / 3D.
 */

import type { Point2D } from "@/core/geometry/types";

/** Направление взгляда на дом (камера смотрит к центру здания). */
export type ElevationCardinal = "front" | "left" | "back" | "right";

/**
 * Точка в координатах фасадного отчёта: u — горизонталь вдоль листа, v — высота (мир Z вверх).
 * Далее в compileReport кладётся в (xMm, yMm) примитивов с тем же смыслом, что и у плана (y вверх до трансформации на лист).
 */
export function planPointAndZToElevationUv(
  planX: number,
  planY: number,
  zUpMm: number,
  facing: ElevationCardinal,
): Point2D {
  switch (facing) {
    case "front":
      return { x: planX, y: zUpMm };
    case "back":
      return { x: -planX, y: zUpMm };
    case "right":
      return { x: planY, y: zUpMm };
    case "left":
      return { x: -planY, y: zUpMm };
    default: {
      const _e: never = facing;
      return _e;
    }
  }
}

/** Вершина крыши в мм: [planX, zUp, -planY] как в roofAssemblyGeometry3d. */
export function roofThreeMmToElevationUv(
  tx: number,
  tyUp: number,
  tzNegPlanY: number,
  facing: ElevationCardinal,
): Point2D {
  return planPointAndZToElevationUv(tx, -tzNegPlanY, tyUp, facing);
}

function cross2(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Выпуклая оболочка (Andrew monotone chain), CCW; при ≤2 точках — как есть. */
export function convexHull2D(points: readonly Point2D[]): Point2D[] {
  if (points.length <= 1) {
    return [...points];
  }
  const uniq: Point2D[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    const k = `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    uniq.push(p);
  }
  if (uniq.length <= 2) {
    return uniq;
  }
  uniq.sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point2D[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2D[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]!;
    while (upper.length >= 2 && cross2(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}
