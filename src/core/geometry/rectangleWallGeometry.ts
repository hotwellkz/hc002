import type { LinearProfilePlacementMode } from "./linearPlacementGeometry";
import type { Point2D } from "./types";

export interface AxisAlignedRectMm {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const EPS = 1e-6;

export function axisAlignedRectFromCorners(a: Point2D, b: Point2D): AxisAlignedRectMm {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function rectWidthHeightMm(r: AxisAlignedRectMm): { readonly w: number; readonly h: number } {
  return { w: r.maxX - r.minX, h: r.maxY - r.minY };
}

/**
 * Для прямоугольного контура:
 * - center — оси стен по границе нарисованного прямоугольника
 * - leftEdge — оси смещены внутрь на t/2 (контур «внутрь»)
 * - rightEdge — оси смещены наружу на t/2 (контур «наружу»)
 */
export function adjustedRectForRectanglePlacement(
  ref: AxisAlignedRectMm,
  thicknessMm: number,
  mode: LinearProfilePlacementMode,
): AxisAlignedRectMm | null {
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) {
    return null;
  }
  const half = thicknessMm / 2;
  const { w, h } = rectWidthHeightMm(ref);
  if (w < EPS || h < EPS) {
    return null;
  }

  if (mode === "center") {
    return { ...ref };
  }
  if (mode === "leftEdge") {
    const minX = ref.minX + half;
    const minY = ref.minY + half;
    const maxX = ref.maxX - half;
    const maxY = ref.maxY - half;
    if (maxX - minX < EPS || maxY - minY < EPS) {
      return null;
    }
    return { minX, minY, maxX, maxY };
  }
  return {
    minX: ref.minX - half,
    minY: ref.minY - half,
    maxX: ref.maxX + half,
    maxY: ref.maxY + half,
  };
}

/** Четыре сегмента осевых линий стен (CCW: низ, право, верх, лево). */
export function fourWallCenterSegmentsFromRect(r: AxisAlignedRectMm): readonly { readonly start: Point2D; readonly end: Point2D }[] {
  const { minX, minY, maxX, maxY } = r;
  return [
    { start: { x: minX, y: minY }, end: { x: maxX, y: minY } },
    { start: { x: maxX, y: minY }, end: { x: maxX, y: maxY } },
    { start: { x: maxX, y: maxY }, end: { x: minX, y: maxY } },
    { start: { x: minX, y: maxY }, end: { x: minX, y: minY } },
  ];
}

/**
 * Четыре оси стен прямоугольника с miter-удлинением на 90°: на каждом конце сегмента
 * ось продлевается на thicknessMm/2 вдоль направления стены (наружу от угла контура).
 * Так толщина T по перпендикуляру закрывает внешние углы без щелей (2D/3D).
 *
 * Порядок CCW, как в fourWallCenterSegmentsFromRect: низ → право → верх → лево.
 */
export function fourWallMiteredCenterSegmentsFromRect(
  r: AxisAlignedRectMm,
  thicknessMm: number,
): readonly { readonly start: Point2D; readonly end: Point2D }[] | null {
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) {
    return null;
  }
  const h = thicknessMm / 2;
  const { minX, minY, maxX, maxY } = r;
  return [
    { start: { x: minX - h, y: minY }, end: { x: maxX + h, y: minY } },
    { start: { x: maxX, y: minY - h }, end: { x: maxX, y: maxY + h } },
    { start: { x: maxX + h, y: maxY }, end: { x: minX - h, y: maxY } },
    { start: { x: minX, y: maxY + h }, end: { x: minX, y: minY - h } },
  ];
}

/** Δ от первой точки ко второй (мм), как в UI. */
export function deltaMmFromFirstToSecond(first: Point2D, second: Point2D): { readonly dx: number; readonly dy: number; readonly d: number } {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  return { dx, dy, d: Math.hypot(dx, dy) };
}
