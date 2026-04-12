import type { Point2D } from "@/core/geometry/types";

/** Четыре вершины контура против часовой стрелки: совпадают с порядком {@link roofPlanePolygonMm}. */
export type RoofQuad4 = readonly [Point2D, Point2D, Point2D, Point2D];

export const ROOF_PLANE_QUAD_EDIT_MIN_EDGE_MM = 80;
export const ROOF_PLANE_QUAD_EDIT_MIN_AREA_MM2 = 4000;
/** Допуск: почти параллелограмм (сумма противоположных вершин). */
export const ROOF_PLANE_QUAD_PARALLEL_EPS_MM = 2.5;

function sub(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(a: Point2D, s: number): Point2D {
  return { x: a.x * s, y: a.y * s };
}

function len(a: Point2D): number {
  return Math.hypot(a.x, a.y);
}

function norm(a: Point2D): Point2D | null {
  const L = len(a);
  if (L < 1e-9) {
    return null;
  }
  return { x: a.x / L, y: a.y / L };
}

function cross2(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

function dot2(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

function quadSignedArea2x(q: readonly Point2D[]): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) & 3]!;
    s += a.x * b.y - a.y * b.x;
  }
  return s;
}

function quadAreaMm2(q: readonly Point2D[]): number {
  return Math.abs(quadSignedArea2x(q)) * 0.5;
}

function centroid4(q: readonly Point2D[]): Point2D {
  return {
    x: (q[0]!.x + q[1]!.x + q[2]!.x + q[3]!.x) / 4,
    y: (q[0]!.y + q[1]!.y + q[2]!.y + q[3]!.y) / 4,
  };
}

/** Отклонение от параллелограмма: |V0+V2-V1-V3|. */
export function roofQuadParallelogramDeviationMm(q: readonly Point2D[]): number {
  if (q.length !== 4) {
    return Number.POSITIVE_INFINITY;
  }
  const x = q[0]!.x + q[2]!.x - q[1]!.x - q[3]!.x;
  const y = q[0]!.y + q[2]!.y - q[1]!.y - q[3]!.y;
  return Math.hypot(x, y);
}

export function isRoofQuadEditorCompatible(q: readonly Point2D[]): boolean {
  if (q.length !== 4) {
    return false;
  }
  if (roofQuadParallelogramDeviationMm(q) > ROOF_PLANE_QUAD_PARALLEL_EPS_MM) {
    return false;
  }
  return validateRoofQuadGeometry(q).ok;
}

function validateRoofQuadGeometry(q: readonly Point2D[]): { ok: true } | { ok: false } {
  const area = quadAreaMm2(q);
  if (!Number.isFinite(area) || area < ROOF_PLANE_QUAD_EDIT_MIN_AREA_MM2) {
    return { ok: false };
  }
  const s = quadSignedArea2x(q);
  if (s <= 1e-6) {
    return { ok: false };
  }
  for (let k = 0; k < 4; k++) {
    const a = q[k]!;
    const b = q[(k + 1) & 3]!;
    if (len(sub(b, a)) < ROOF_PLANE_QUAD_EDIT_MIN_EDGE_MM) {
      return { ok: false };
    }
  }
  return { ok: true };
}

/**
 * Внешняя единичная нормаль к ребру k (от Vk к V(k+1)), для CCW-четырёхугольника —
 * направление «от центроида».
 */
export function roofQuadEdgeOutwardNormalUnit(q: RoofQuad4, edgeIndex: number): Point2D | null {
  const i = edgeIndex & 3;
  const a = q[i]!;
  const b = q[(i + 1) & 3]!;
  const t = norm(sub(b, a));
  if (!t) {
    return null;
  }
  const nLeft: Point2D = { x: -t.y, y: t.x };
  const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  const c = centroid4(q);
  const inward = sub(c, mid);
  let nOut = dot2(nLeft, inward) > 0 ? { x: -nLeft.x, y: -nLeft.y } : nLeft;
  const nl = len(nOut);
  if (nl < 1e-12) {
    return null;
  }
  return { x: nOut.x / nl, y: nOut.y / nl };
}

/**
 * Нормаль для смещения ребра — совпадает с внешней геометрической нормалью к сегменту в плане
 * (перпендикуляр к стороне, «наружу» от центроида).
 */
export function roofQuadEdgeOffsetNormalUnit(q: RoofQuad4, edgeIndex: number): Point2D | null {
  return roofQuadEdgeOutwardNormalUnit(q, edgeIndex);
}

function tryMoveQuadEdgeRaw(q0: RoofQuad4, edgeIndex: number, deltaMm: number): RoofQuad4 | null {
  const n = roofQuadEdgeOutwardNormalUnit(q0, edgeIndex);
  if (!n) {
    return null;
  }
  const i = edgeIndex & 3;
  const j = (i + 1) & 3;
  const sh = scale(n, deltaMm);
  const q: Point2D[] = [
    { ...q0[0]! },
    { ...q0[1]! },
    { ...q0[2]! },
    { ...q0[3]! },
  ];
  q[i] = add(q[i]!, sh);
  q[j] = add(q[j]!, sh);
  if (!validateRoofQuadGeometry(q).ok) {
    return null;
  }
  return [q[0]!, q[1]!, q[2]!, q[3]!];
}

/** Сдвиг ребра вдоль внешней нормали на deltaMm (положительно — наружу относительно центроида). */
export function tryMoveRoofQuadEdgeMm(
  q0: RoofQuad4,
  edgeIndex: number,
  deltaMm: number,
): { ok: true; quad: RoofQuad4 } | { ok: false } {
  const q = tryMoveQuadEdgeRaw(q0, edgeIndex, deltaMm);
  if (!q) {
    return { ok: false };
  }
  return { ok: true, quad: q };
}

/** Ограничивает delta так, чтобы геометрия оставалась валидной (бинарный поиск). */
export function clampRoofQuadEdgeDeltaMm(q0: RoofQuad4, edgeIndex: number, deltaMm: number): number {
  if (tryMoveRoofQuadEdgeMm(q0, edgeIndex, deltaMm).ok) {
    return deltaMm;
  }
  const eps = 0.05;
  if (Math.abs(deltaMm) < eps) {
    return 0;
  }
  if (deltaMm > 0) {
    let lo = 0;
    let hi = deltaMm;
    if (!tryMoveRoofQuadEdgeMm(q0, edgeIndex, hi).ok) {
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) * 0.5;
        if (tryMoveRoofQuadEdgeMm(q0, edgeIndex, mid).ok) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return lo;
    }
  } else {
    let lo = deltaMm;
    let hi = 0;
    if (!tryMoveRoofQuadEdgeMm(q0, edgeIndex, lo).ok) {
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) * 0.5;
        if (tryMoveRoofQuadEdgeMm(q0, edgeIndex, mid).ok) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return hi;
    }
  }
  return 0;
}

/**
 * Перемещение угла i с сохранением направлений рёбер, исходящих из этого угла (как у параллелограмма);
 * противоположная вершина неподвижна.
 */
export function tryMoveRoofQuadCornerMm(
  q0: RoofQuad4,
  cornerIndex: number,
  newCorner: Point2D,
): { ok: true; quad: RoofQuad4 } | { ok: false } {
  const i = cornerIndex & 3;
  const opp = (i + 2) & 3;
  const iNext = (i + 1) & 3;
  const iPrev = (i + 3) & 3;
  const Vopp = q0[opp]!;
  const u0 = norm(sub(q0[iNext]!, q0[i]!));
  const v0 = norm(sub(q0[iPrev]!, q0[i]!));
  if (!u0 || !v0) {
    return { ok: false };
  }
  const det = cross2(u0, v0);
  if (Math.abs(det) < 1e-9) {
    return { ok: false };
  }
  const rhs = sub(Vopp, newCorner);
  const s = cross2(rhs, v0) / det;
  const t = cross2(u0, rhs) / det;
  if (s < ROOF_PLANE_QUAD_EDIT_MIN_EDGE_MM || t < ROOF_PLANE_QUAD_EDIT_MIN_EDGE_MM) {
    return { ok: false };
  }
  const q: Point2D[] = [
    { ...q0[0]! },
    { ...q0[1]! },
    { ...q0[2]! },
    { ...q0[3]! },
  ];
  q[i] = { ...newCorner };
  q[iNext] = add(newCorner, scale(u0, s));
  q[iPrev] = add(newCorner, scale(v0, t));
  if (!validateRoofQuadGeometry(q).ok) {
    return { ok: false };
  }
  return { ok: true, quad: [q[0]!, q[1]!, q[2]!, q[3]!] };
}

/** Достижение целевой позиции угла с ограничениями: lerp от старой вершины к target. */
export function clampRoofQuadCornerTargetMm(q0: RoofQuad4, cornerIndex: number, target: Point2D): RoofQuad4 {
  const i = cornerIndex & 3;
  const from = q0[i]!;
  const direct = tryMoveRoofQuadCornerMm(q0, cornerIndex, target);
  if (direct.ok) {
    return direct.quad;
  }
  let lo = 0;
  let hi = 1;
  let best: RoofQuad4 = q0;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) * 0.5;
    const p = { x: from.x + (target.x - from.x) * mid, y: from.y + (target.y - from.y) * mid };
    const r = tryMoveRoofQuadCornerMm(q0, cornerIndex, p);
    if (r.ok) {
      best = r.quad;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}
