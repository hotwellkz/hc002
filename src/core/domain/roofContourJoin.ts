import type { Point2D } from "../geometry/types";
import type { RoofPlaneEntity } from "./roofPlane";
import {
  roofPlaneExtrusionDirectionMm,
  roofPlanePolygonMm,
} from "./roofPlane";

const EPS = 1e-4;
const MIN_AREA_MM2 = 500;
const MIN_EDGE_MM = 50;
const PARALLEL_DOT = 0.92;

/** Линия на плане: нормаль (a,b) не обязательно единичная; внутри f(x,y)=a*x+b*y-d. */
export interface PlanLine2d {
  readonly a: number;
  readonly b: number;
  readonly d: number;
}

export type RoofContourJoinPhase = "pickSourceEdge" | "pickTargetEdge";

export interface RoofContourJoinSession {
  readonly phase: RoofContourJoinPhase;
  readonly hoverPlaneId: string | null;
  readonly hoverEdgeIndex: number | null;
  readonly sourcePlaneId: string | null;
  readonly sourceEdgeIndex: number | null;
  readonly targetHoverPlaneId: string | null;
  readonly targetHoverEdgeIndex: number | null;
  readonly hint: string | null;
}

export function initialRoofContourJoinSession(): RoofContourJoinSession {
  return {
    phase: "pickSourceEdge",
    hoverPlaneId: null,
    hoverEdgeIndex: null,
    sourcePlaneId: null,
    sourceEdgeIndex: null,
    targetHoverPlaneId: null,
    targetHoverEdgeIndex: null,
    hint: "Выберите первое ребро для соединения",
  };
}

function unit2(v: Point2D): Point2D | null {
  const len = Math.hypot(v.x, v.y);
  if (len < EPS) {
    return null;
  }
  return { x: v.x / len, y: v.y / len };
}

/** Удвоенная площадь (знак = обход). */
function signedDoubleArea(poly: readonly Point2D[]): number {
  const n = poly.length;
  if (n < 3) {
    return 0;
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += poly[i]!.x * poly[j]!.y - poly[j]!.x * poly[i]!.y;
  }
  return s;
}

function ensurePolygonCcWMm(poly: Point2D[]): Point2D[] {
  if (signedDoubleArea(poly) < 0) {
    return [...poly].reverse();
  }
  return poly;
}

function lineValue(L: PlanLine2d, p: Point2D): number {
  return L.a * p.x + L.b * p.y - L.d;
}

function intersectSegmentsWithLine(
  s: Point2D,
  e: Point2D,
  L: PlanLine2d,
): Point2D | null {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const den = L.a * dx + L.b * dy;
  if (Math.abs(den) < EPS) {
    return null;
  }
  const t = (L.d - L.a * s.x - L.b * s.y) / den;
  if (t < -EPS || t > 1 + EPS) {
    return null;
  }
  const u = Math.max(0, Math.min(1, t));
  return { x: s.x + dx * u, y: s.y + dy * u };
}

/**
 * Отсечение многоугольника полуплоскостью: оставляем вершины, для которых
 * keepPositive ? (f>=-tol) : (f<=tol), f=a*x+b*y-d.
 */
export function clipPolygonToHalfPlaneMm(
  poly: readonly Point2D[],
  L: PlanLine2d,
  keepPositive: boolean,
  tol = 1e-3,
): Point2D[] | null {
  const n = poly.length;
  if (n < 3) {
    return null;
  }
  const out: Point2D[] = [];
  const inside = (p: Point2D) => {
    const v = lineValue(L, p);
    return keepPositive ? v >= -tol : v <= tol;
  };

  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const aIn = inside(a);
    const bIn = inside(b);
    if (bIn) {
      if (!aIn) {
        const is = intersectSegmentsWithLine(a, b, L);
        if (is) {
          out.push(is);
        }
      }
      out.push(b);
    } else if (aIn) {
      const is = intersectSegmentsWithLine(a, b, L);
      if (is) {
        out.push(is);
      }
    }
  }

  if (out.length < 3) {
    return null;
  }
  return dedupeConsecutiveVerticesMm(out);
}

function dedupeConsecutiveVerticesMm(pts: Point2D[]): Point2D[] {
  const r: Point2D[] = [];
  const eq = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5;
  for (const p of pts) {
    if (r.length === 0 || !eq(p, r[r.length - 1]!)) {
      r.push(p);
    }
  }
  if (r.length >= 2 && eq(r[0]!, r[r.length - 1]!)) {
    r.pop();
  }
  return r;
}

function roofPlaneTanK(rp: RoofPlaneEntity): number | null {
  const rad = (rp.angleDeg * Math.PI) / 180;
  const k = Math.tan(rad);
  if (!Number.isFinite(k) || Math.abs(k) < 1e-5) {
    return null;
  }
  return k;
}

/** Опорная точка на «нижней» кромке (минимум вдоль направления подъёма ската). */
function eaveReferencePointMm(rp: RoofPlaneEntity, poly: readonly Point2D[]): Point2D | null {
  const e = unit2(roofPlaneExtrusionDirectionMm(rp));
  if (!e) {
    return null;
  }
  let best = poly[0]!;
  let bestDot = best.x * e.x + best.y * e.y;
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i]!;
    const d = p.x * e.x + p.y * e.y;
    if (d < bestDot - 1e-6) {
      bestDot = d;
      best = p;
    }
  }
  return best;
}

/**
 * z(P) ≈ k * dot(P, ê) + const; const подобран так, что z = levelMm в eaveRef.
 */
export function roofPlaneHeightConstantMm(rp: RoofPlaneEntity): {
  readonly k: number;
  readonly e: Point2D;
  readonly c: number;
} | null {
  const k = roofPlaneTanK(rp);
  if (k == null) {
    return null;
  }
  const e = unit2(roofPlaneExtrusionDirectionMm(rp));
  if (!e) {
    return null;
  }
  const poly = roofPlanePolygonMm(rp);
  if (poly.length < 3) {
    return null;
  }
  const eave = eaveReferencePointMm(rp, poly);
  if (!eave) {
    return null;
  }
  const c = rp.levelMm - k * (eave.x * e.x + eave.y * e.y);
  return { k, e, c };
}

/**
 * Проекция линии пересечения двух наклонных плоскостей скатов на план XY.
 * Расширяемо: при других моделях высоты заменить построение PlanLine2d.
 */
export function ridgeLineBetweenRoofPlanesMm(
  a: RoofPlaneEntity,
  b: RoofPlaneEntity,
): PlanLine2d | null {
  const ha = roofPlaneHeightConstantMm(a);
  const hb = roofPlaneHeightConstantMm(b);
  if (!ha || !hb) {
    return null;
  }
  const aa = ha.k * ha.e.x;
  const ba = ha.k * ha.e.y;
  const ab = hb.k * hb.e.x;
  const bb = hb.k * hb.e.y;
  const aL = aa - ab;
  const bL = ba - bb;
  const len = Math.hypot(aL, bL);
  if (len < 1e-6) {
    return null;
  }
  const d = hb.c - ha.c;
  return { a: aL, b: bL, d };
}

function edgeMidpointMm(poly: readonly Point2D[], edgeIndex: number): Point2D {
  const n = poly.length;
  const a = poly[edgeIndex % n]!;
  const b = poly[(edgeIndex + 1) % n]!;
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

/**
 * Обрезка контуров по линии пересечения **высотных** плоскостей скатов в плане (hip / сильно непараллельные кромки).
 * Для двух почти параллельных выбранных рёбер используйте `joinParallelRoofPlaneEdgesToMidlineMm` — там линия стыка
 * посередине между рёбрами, а не по этой формуле.
 */
export function tryJoinTwoRoofPlaneContoursMm(
  source: RoofPlaneEntity,
  target: RoofPlaneEntity,
  sourceEdgeIndex: number,
  targetEdgeIndex: number,
): { readonly a: RoofPlaneEntity; readonly b: RoofPlaneEntity } | { readonly error: string } {
  if (source.id === target.id) {
    return { error: "Выберите другую плоскость." };
  }
  const line = ridgeLineBetweenRoofPlanesMm(source, target);
  if (!line) {
    return {
      error: "Соединение невозможно: плоскости несовместимы (уклон или геометрия).",
    };
  }
  const polyA0 = [...roofPlanePolygonMm(source)];
  const polyB0 = [...roofPlanePolygonMm(target)];
  if (polyA0.length < 3 || polyB0.length < 3) {
    return { error: "Соединение невозможно: некорректный контур." };
  }

  const midS = edgeMidpointMm(polyA0, sourceEdgeIndex);
  const midT = edgeMidpointMm(polyB0, targetEdgeIndex);
  const sideA = lineValue(line, midS);
  const sideB = lineValue(line, midT);
  if (sideA * sideB > 0) {
    return {
      error: "Соединение невозможно: плоскости несовместимы (нет линии стыка между ними).",
    };
  }

  const keepAPos = sideA >= 0;
  const keepBPos = sideB >= 0;
  const clipA = clipPolygonToHalfPlaneMm(polyA0, line, keepAPos);
  const clipB = clipPolygonToHalfPlaneMm(polyB0, line, keepBPos);
  if (!clipA || !clipB) {
    return { error: "Соединение невозможно: обрезка контура дала вырожденный многоугольник." };
  }
  const ccwA = ensurePolygonCcWMm(clipA);
  const ccwB = ensurePolygonCcWMm(clipB);
  const areaA = Math.abs(signedDoubleArea(ccwA)) * 0.5;
  const areaB = Math.abs(signedDoubleArea(ccwB)) * 0.5;
  if (areaA < MIN_AREA_MM2 || areaB < MIN_AREA_MM2) {
    return { error: "Соединение невозможно: слишком малый остаток контура." };
  }

  const nextA = updateRoofPlaneEntityAfterContourEdit(source, ccwA);
  const nextB = updateRoofPlaneEntityAfterContourEdit(target, ccwB);
  if (!nextA || !nextB) {
    return { error: "Соединение невозможно: не удалось пересчитать параметры ската." };
  }
  return { a: nextA, b: nextB };
}

/**
 * После правки planContourMm восстанавливаем p1,p2,depthMm по направлению уклона (slopeDirection не меняем).
 * `updateBaseContour: false` — только расчётный контур (свесы), базовый `planContourBaseMm` не трогаем.
 */
export function updateRoofPlaneEntityAfterContourEdit(
  rp: RoofPlaneEntity,
  contourCcW: Point2D[],
  opts?: { readonly updateBaseContour?: boolean },
): RoofPlaneEntity | null {
  if (contourCcW.length < 3) {
    return null;
  }
  const e = unit2(roofPlaneExtrusionDirectionMm(rp));
  if (!e) {
    return null;
  }
  let minDot = Infinity;
  let minIdx = 0;
  for (let i = 0; i < contourCcW.length; i++) {
    const p = contourCcW[i]!;
    const d = p.x * e.x + p.y * e.y;
    if (d < minDot) {
      minDot = d;
      minIdx = i;
    }
  }
  const n = contourCcW.length;
  const v0 = contourCcW[minIdx]!;
  const vPrev = contourCcW[(minIdx + n - 1) % n]!;
  const vNext = contourCcW[(minIdx + 1) % n]!;
  const edgeAlong = (a: Point2D, b: Point2D) => {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    return Math.abs(ux * e.x + uy * e.y);
  };
  const usePrev = edgeAlong(v0, vPrev) < edgeAlong(v0, vNext);
  const p1 = v0;
  const p2 = usePrev ? vPrev : vNext;
  if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < MIN_EDGE_MM) {
    return null;
  }
  let maxAlong = -Infinity;
  for (const p of contourCcW) {
    const along = (p.x - p1.x) * e.x + (p.y - p1.y) * e.y;
    maxAlong = Math.max(maxAlong, along);
  }
  if (maxAlong < MIN_EDGE_MM) {
    return null;
  }
  const t = new Date().toISOString();
  const updateBase = opts?.updateBaseContour !== false;
  const baseCopy = contourCcW.map((p) => ({ x: p.x, y: p.y }));
  return {
    ...rp,
    p1,
    p2,
    depthMm: maxAlong,
    planContourMm: baseCopy,
    ...(updateBase ? { planContourBaseMm: baseCopy } : {}),
    updatedAt: t,
  };
}

export function edgeUnitAlongPolyMm(
  poly: readonly Point2D[],
  edgeIndex: number,
): Point2D | null {
  const n = poly.length;
  if (n < 2) {
    return null;
  }
  const a = poly[edgeIndex % n]!;
  const b = poly[(edgeIndex + 1) % n]!;
  return unit2({ x: b.x - a.x, y: b.y - a.y });
}

export function inferCompatibleTargetEdgeIndexMm(
  source: RoofPlaneEntity,
  sourceEdgeIndex: number,
  target: RoofPlaneEntity,
): number | null {
  const polyS = roofPlanePolygonMm(source);
  const polyT = roofPlanePolygonMm(target);
  const uS = edgeUnitAlongPolyMm(polyS, sourceEdgeIndex);
  const eS = unit2(roofPlaneExtrusionDirectionMm(source));
  const eT = unit2(roofPlaneExtrusionDirectionMm(target));
  if (!uS || !eS || !eT) {
    return null;
  }
  const nS = polyS.length;
  const a = polyS[sourceEdgeIndex % nS]!;
  const b = polyS[(sourceEdgeIndex + 1) % nS]!;
  const midS = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };

  let bestJ = -1;
  let bestScore = -Infinity;
  const nT = polyT.length;
  for (let j = 0; j < nT; j++) {
    const p0 = polyT[j]!;
    const p1 = polyT[(j + 1) % nT]!;
    const uT = unit2({ x: p1.x - p0.x, y: p1.y - p0.y });
    if (!uT) {
      continue;
    }
    const parallel = Math.abs(Math.abs(uS.x * uT.x + uS.y * uT.y) - 1);
    if (parallel > 1 - PARALLEL_DOT) {
      continue;
    }
    const midT = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
    const toward = (midT.x - midS.x) * eS.x + (midT.y - midS.y) * eS.y;
    const towardB = (midS.x - midT.x) * eT.x + (midS.y - midT.y) * eT.y;
    if (toward <= 1 || towardB <= 1) {
      continue;
    }
    const opp = uS.x * uT.x + uS.y * uT.y;
    const facingOpposite = opp < 0;
    const score =
      (facingOpposite ? 4000 : 0) +
      Math.min(toward, towardB) -
      parallel * 1000 -
      Math.hypot(midT.x - midS.x, midT.y - midS.y) * 0.01;
    if (score > bestScore) {
      bestScore = score;
      bestJ = j;
    }
  }
  return bestJ >= 0 ? bestJ : null;
}
