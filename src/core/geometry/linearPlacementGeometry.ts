import type { Point2D } from "./types";

/**
 * Режим привязки линейного профиля к траектории построения (стена, балка, борт…).
 * «Лево/право» — относительно направления движения от первой точки ко второй.
 */
export type LinearProfilePlacementMode = "center" | "leftEdge" | "rightEdge";

export function linearPlacementModeLabelRu(mode: LinearProfilePlacementMode): string {
  switch (mode) {
    case "center":
      return "Режим: по центру";
    case "leftEdge":
      return "Режим: по левому краю";
    case "rightEdge":
      return "Режим: по правому краю";
  }
}

export interface WallFrameAxes {
  readonly tangent: Point2D;
  /** Перпендикуляр влево от направления (CCW), нормализованный. */
  readonly normalLeft: Point2D;
  /** Перпендикуляр вправо (CW). */
  readonly normalRight: Point2D;
}

export interface WallFrameFromReferenceResult {
  /** Осевая линия стены (центр толщины). */
  readonly centerStart: Point2D;
  readonly centerEnd: Point2D;
  readonly axes: WallFrameAxes;
}

const EPS_LEN = 1e-9;

/**
 * Базис направления: tangent = start→end, normalLeft = CCW(-90°), normalRight = CW(+90°).
 * Система координат плана: Y вверх (как в Editor2D).
 */
export function computeWallFrameAxes(refStart: Point2D, refEnd: Point2D): WallFrameAxes | null {
  const dx = refEnd.x - refStart.x;
  const dy = refEnd.y - refStart.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS_LEN) {
    return null;
  }
  const tx = dx / len;
  const ty = dy / len;
  const tangent: Point2D = { x: tx, y: ty };
  const normalLeft: Point2D = { x: -ty, y: tx };
  const normalRight: Point2D = { x: ty, y: -tx };
  return { tangent, normalLeft, normalRight };
}

/**
 * Из опорной линии построения (две точки курсора) и толщины — осевая линия стены.
 *
 * - center: опорная линия = ось стены
 * - leftEdge: опорная линия = левый край; ось смещена на thickness/2 по normalRight
 * - rightEdge: опорная линия = правый край; ось смещена на thickness/2 по normalLeft
 */
export function computeWallCenterlineFromReferenceLine(
  refStart: Point2D,
  refEnd: Point2D,
  thicknessMm: number,
  mode: LinearProfilePlacementMode,
): WallFrameFromReferenceResult | null {
  const axes = computeWallFrameAxes(refStart, refEnd);
  if (!axes) {
    return null;
  }
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) {
    return null;
  }
  const half = thicknessMm / 2;

  if (mode === "center") {
    return {
      centerStart: { x: refStart.x, y: refStart.y },
      centerEnd: { x: refEnd.x, y: refEnd.y },
      axes,
    };
  }
  if (mode === "leftEdge") {
    const ox = axes.normalRight.x * half;
    const oy = axes.normalRight.y * half;
    return {
      centerStart: { x: refStart.x + ox, y: refStart.y + oy },
      centerEnd: { x: refEnd.x + ox, y: refEnd.y + oy },
      axes,
    };
  }
  const ox = axes.normalLeft.x * half;
  const oy = axes.normalLeft.y * half;
  return {
    centerStart: { x: refStart.x + ox, y: refStart.y + oy },
    centerEnd: { x: refEnd.x + ox, y: refEnd.y + oy },
    axes,
  };
}
