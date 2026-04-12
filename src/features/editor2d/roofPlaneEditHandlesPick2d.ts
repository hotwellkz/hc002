import type { Point2D } from "@/core/geometry/types";

import {
  roofQuadEdgeOutwardNormalUnit,
  type RoofQuad4,
} from "@/core/domain/roofPlaneQuadEditGeometry";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";
import { worldToScreen } from "@/core/geometry/viewportTransform";

export type RoofPlaneEditHandleHit =
  | { readonly kind: "corner"; readonly cornerIndex: number }
  | { readonly kind: "edge"; readonly edgeIndex: number; readonly nOut: Point2D };

/** Предыдущий hover того же ската — для гистерезиса (без planeId). */
export type RoofPlaneEditScreenSticky = {
  readonly kind: "edge" | "corner";
  readonly edgeIndex?: number;
  readonly cornerIndex?: number;
} | null;

function dist2(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function closestOnSegment(a: Point2D, b: Point2D, p: Point2D): { t: number; q: Point2D } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const den = abx * abx + aby * aby;
  const t0 = den < 1e-18 ? 0 : (apx * abx + apy * aby) / den;
  const t = Math.max(0, Math.min(1, t0));
  return { t, q: { x: a.x + abx * t, y: a.y + aby * t } };
}

/** Расстояние от точки экрана до отрезка в пикселях. */
export function distScreenPxToSegmentPx(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const den = abx * abx + aby * aby;
  if (den < 1e-12) {
    return Math.hypot(apx, apy);
  }
  let t = (apx * abx + apy * aby) / den;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  return Math.hypot(px - qx, py - qy);
}

/** Допуск хит-теста в мм для ~`screenPx` пикселей на экране при текущем zoom. */
export function roofPlaneEditHandlePickToleranceMm(
  zoomPixelsPerMm: number,
  screenPx: number = 12,
): number {
  const z = Math.max(zoomPixelsPerMm, 1e-9);
  return Math.max(1.2, screenPx / z);
}

/** Приоритет угла: если курсор близко к вершине, не перехватывать ребро. */
const CORNER_PRIORITY_PX = 13;
/** Если расстояние до угла не больше, чем до ребра + этот запас (px), выбираем угол. */
const CORNER_OVER_EDGE_SLACK_PX = 8;
/** Невидимая зона захвата ребра (экран, px). */
const EDGE_GRAB_PX = 22;
/** Удержание hover по ребру после выхода из EDGE_GRAB_PX. */
const EDGE_STICKY_RELEASE_PX = 32;
/** Нужно оказаться заметно ближе к другому ребру, чтобы переключиться. */
const EDGE_SWITCH_HYST_PX = 10;

const CORNER_STICKY_RELEASE_PX = 22;
const CORNER_EDGE_OVERTAKE_PX = 8;

/**
 * Hit-test в координатах экрана (как Pixi `ev.global`) + гистерезис по предыдущему hover.
 * Визуальный маркер может быть маленьким — интерактивная зона шире.
 */
export function pickRoofPlaneEditHandleScreen(
  screenPxX: number,
  screenPxY: number,
  quad: RoofQuad4,
  viewport: ViewportTransform,
  sticky: RoofPlaneEditScreenSticky,
): RoofPlaneEditHandleHit | null {
  const sc: { readonly x: number; readonly y: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const p = quad[i]!;
    sc.push(worldToScreen(p.x, p.y, viewport));
  }

  let bestCi = 0;
  let bestCd = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 4; i++) {
    const p = sc[i]!;
    const d = Math.hypot(screenPxX - p.x, screenPxY - p.y);
    if (d < bestCd) {
      bestCd = d;
      bestCi = i;
    }
  }

  let bestEi = 0;
  let bestEd = Number.POSITIVE_INFINITY;
  for (let e = 0; e < 4; e++) {
    const a = sc[e]!;
    const b = sc[(e + 1) & 3]!;
    const d = distScreenPxToSegmentPx(screenPxX, screenPxY, a.x, a.y, b.x, b.y);
    if (d < bestEd) {
      bestEd = d;
      bestEi = e;
    }
  }

  const edgeHit = (ei: number): RoofPlaneEditHandleHit | null => {
    const nOut = roofQuadEdgeOutwardNormalUnit(quad, ei);
    if (!nOut) {
      return null;
    }
    return { kind: "edge", edgeIndex: ei, nOut };
  };

  let primary: RoofPlaneEditHandleHit | null = null;
  if (bestCd <= CORNER_PRIORITY_PX && bestCd <= bestEd + CORNER_OVER_EDGE_SLACK_PX) {
    primary = { kind: "corner", cornerIndex: bestCi };
  } else if (bestEd <= EDGE_GRAB_PX) {
    primary = edgeHit(bestEi);
  }

  if (sticky?.kind === "edge" && sticky.edgeIndex != null) {
    const e0 = sticky.edgeIndex;
    const a0 = sc[e0]!;
    const b0 = sc[(e0 + 1) & 3]!;
    const dSticky = distScreenPxToSegmentPx(screenPxX, screenPxY, a0.x, a0.y, b0.x, b0.y);
    if (dSticky <= EDGE_STICKY_RELEASE_PX) {
      if (bestCd <= CORNER_PRIORITY_PX && bestCd < dSticky - 4) {
        return { kind: "corner", cornerIndex: bestCi };
      }
      if (primary?.kind === "edge" && primary.edgeIndex !== e0) {
        const e1 = primary.edgeIndex;
        const a1 = sc[e1]!;
        const b1 = sc[(e1 + 1) & 3]!;
        const dNew = distScreenPxToSegmentPx(screenPxX, screenPxY, a1.x, a1.y, b1.x, b1.y);
        if (dNew < dSticky - EDGE_SWITCH_HYST_PX) {
          return primary;
        }
      }
      return edgeHit(e0);
    }
  }

  if (sticky?.kind === "corner" && sticky.cornerIndex != null) {
    const c0 = sticky.cornerIndex;
    const p0 = sc[c0]!;
    const dStickyC = Math.hypot(screenPxX - p0.x, screenPxY - p0.y);
    if (dStickyC <= CORNER_STICKY_RELEASE_PX) {
      if (primary?.kind === "edge" && bestEd < dStickyC - CORNER_EDGE_OVERTAKE_PX) {
        return primary;
      }
      return { kind: "corner", cornerIndex: c0 };
    }
  }

  return primary;
}

/** Для world-mm pick у вершин приоритет у угловых хендлов. */
const EDGE_MM_HIT_T_LO = 0.08;
const EDGE_MM_HIT_T_HI = 0.92;

/**
 * Подбор по мировым мм (резерв / тесты): внутренняя часть ребра; у вершин — угол.
 */
export function pickRoofPlaneEditHandleMm(
  worldMm: Point2D,
  quad: RoofQuad4,
  tolMm: number,
): RoofPlaneEditHandleHit | null {
  const tol2 = tolMm * tolMm;

  let bestEdge: RoofPlaneEditHandleHit | null = null;
  let bestEdgeD2 = Number.POSITIVE_INFINITY;
  for (let e = 0; e < 4; e++) {
    const a = quad[e]!;
    const b = quad[(e + 1) & 3]!;
    const { t, q } = closestOnSegment(a, b, worldMm);
    if (t < EDGE_MM_HIT_T_LO || t > EDGE_MM_HIT_T_HI) {
      continue;
    }
    const d2 = dist2(worldMm, q);
    if (d2 > tol2) {
      continue;
    }
    const nOut = roofQuadEdgeOutwardNormalUnit(quad, e);
    if (!nOut) {
      continue;
    }
    if (d2 < bestEdgeD2 - 1e-9) {
      bestEdgeD2 = d2;
      bestEdge = { kind: "edge", edgeIndex: e, nOut };
    }
  }

  let bestCorner: RoofPlaneEditHandleHit | null = null;
  let bestCornerD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 4; i++) {
    const d2 = dist2(worldMm, quad[i]!);
    if (d2 > tol2) {
      continue;
    }
    if (d2 < bestCornerD2 - 1e-9) {
      bestCornerD2 = d2;
      bestCorner = { kind: "corner", cornerIndex: i };
    }
  }

  if (bestCorner && (!bestEdge || bestCornerD2 < bestEdgeD2 - 1e-9)) {
    return bestCorner;
  }
  return bestEdge;
}

export function roofQuadEdgeMidpointMm(quad: RoofQuad4, edgeIndex: number): Point2D {
  const e = edgeIndex & 3;
  const a = quad[e]!;
  const b = quad[(e + 1) & 3]!;
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}
