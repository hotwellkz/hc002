import { closestPointOnSegment } from "@/core/domain/wallJointGeometry";
import {
  tryJoinTwoRoofPlaneContoursMm,
  updateRoofPlaneEntityAfterContourEdit,
} from "@/core/domain/roofContourJoin";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import type { Point2D } from "@/core/geometry/types";

const MM_EPS = 1e-4;
/** Порог |eA×eB| для «параллельных» рёбер на плане (~arcsin(0.12) ≈ 6.9°). */
const PARALLEL_CROSS_MAX = 0.12;
const MIN_JOIN_GAP_MM = 25;
const MIN_EDGE_MM = 80;

function unit2(v: Point2D): Point2D | null {
  const L = Math.hypot(v.x, v.y);
  if (L < MM_EPS) {
    return null;
  }
  return { x: v.x / L, y: v.y / L };
}

/** Центроид многоугольника (шнуровая площадь). */
export function roofJoinPolygonCentroidMm(poly: readonly Point2D[]): Point2D {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const cross = xi * yj - xj * yi;
    a += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < MM_EPS) {
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Внутренняя нормаль к ребру (к центроиду), единичная. */
function edgeInteriorNormal(poly: readonly Point2D[], edgeIndex: number): Point2D | null {
  const n = poly.length;
  const a = poly[edgeIndex]!;
  const b = poly[(edgeIndex + 1) % n]!;
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const eu = unit2({ x: ux, y: uy });
  if (!eu) {
    return null;
  }
  let nx = -eu.y;
  let ny = eu.x;
  const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  const c = roofJoinPolygonCentroidMm(poly);
  if ((c.x - mid.x) * nx + (c.y - mid.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

/**
 * Единичное направление стрелки «в сторону стыка»: перпендикуляр к ребру.
 * Без цели — наружная нормаль (−внутренняя). С точкой toward — половина плоскости,
 * куда нужно сдвинуть ребро, чтобы встретиться с соседом.
 */
export function roofJoinArrowUnitWorldMm(
  poly: readonly Point2D[],
  edgeIndex: number,
  towardPoint: Point2D | null,
): Point2D | null {
  const nIn = edgeInteriorNormal(poly, edgeIndex);
  if (!nIn) {
    return null;
  }
  const n = poly.length;
  const a = poly[edgeIndex % n]!;
  const b = poly[(edgeIndex + 1) % n]!;
  const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  const outward = { x: -nIn.x, y: -nIn.y };
  if (!towardPoint) {
    return outward;
  }
  const vx = towardPoint.x - mid.x;
  const vy = towardPoint.y - mid.y;
  const dotOut = outward.x * vx + outward.y * vy;
  if (dotOut >= 0) {
    return outward;
  }
  return nIn;
}

/** Пересечение прямых (бесконечных) через a1–a2 и b1–b2. */
export function intersectLinesInfinite(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D | null {
  const x1 = a1.x;
  const y1 = a1.y;
  const x2 = a2.x;
  const y2 = a2.y;
  const x3 = b1.x;
  const y3 = b1.y;
  const x4 = b2.x;
  const y4 = b2.y;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < MM_EPS * MM_EPS) {
    return null;
  }
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

export function pickRoofPlaneEdgeIndexAtPointMm(
  worldMm: Point2D,
  rp: RoofPlaneEntity,
  tolMm: number,
): number | null {
  const poly = roofPlanePolygonMm(rp);
  if (poly.length < 3) {
    return null;
  }
  const tol2 = tolMm * tolMm;
  let bestI = -1;
  let bestD = tol2;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const q = closestPointOnSegment(a, b, worldMm).point;
    const dx = worldMm.x - q.x;
    const dy = worldMm.y - q.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD - 1e-9) {
      bestD = d2;
      bestI = i;
    }
  }
  return bestI >= 0 ? bestI : null;
}

/** Касательные к двум рёбрам почти параллельны (стык «вальмой» vs обрезка по хребту). */
export function roofJoinEdgeTangentsParallelMm(
  polyA: readonly Point2D[],
  edgeA: number,
  polyB: readonly Point2D[],
  edgeB: number,
): boolean {
  const nA = polyA.length;
  const nB = polyB.length;
  if (nA < 3 || nB < 3 || edgeA < 0 || edgeA >= nA || edgeB < 0 || edgeB >= nB) {
    return false;
  }
  const a0 = polyA[edgeA]!;
  const a1 = polyA[(edgeA + 1) % nA]!;
  const b0 = polyB[edgeB]!;
  const b1 = polyB[(edgeB + 1) % nB]!;
  const eA = unit2({ x: a1.x - a0.x, y: a1.y - a0.y });
  const eB = unit2({ x: b1.x - b0.x, y: b1.y - b0.y });
  if (!eA || !eB) {
    return false;
  }
  const cross = Math.abs(eA.x * eB.y - eA.y * eB.x);
  return cross <= PARALLEL_CROSS_MAX;
}

/** Два конкретных ребра параллельны (в пределах допуска) и ориентированы навстречу для стыковки по средней линии. */
export function areRoofJoinEdgePairCompatibleMm(
  polyA: readonly Point2D[],
  edgeA: number,
  polyB: readonly Point2D[],
  edgeB: number,
): boolean {
  const nA = polyA.length;
  const nB = polyB.length;
  if (nA < 3 || nB < 3 || edgeA < 0 || edgeA >= nA || edgeB < 0 || edgeB >= nB) {
    return false;
  }
  const a0 = polyA[edgeA]!;
  const a1 = polyA[(edgeA + 1) % nA]!;
  const b0 = polyB[edgeB]!;
  const b1 = polyB[(edgeB + 1) % nB]!;
  const eA = unit2({ x: a1.x - a0.x, y: a1.y - a0.y });
  const eB = unit2({ x: b1.x - b0.x, y: b1.y - b0.y });
  if (!eA || !eB) {
    return false;
  }
  const cross = Math.abs(eA.x * eB.y - eA.y * eB.x);
  if (cross > PARALLEL_CROSS_MAX) {
    return false;
  }
  const nAIn = edgeInteriorNormal(polyA, edgeA);
  const nBIn = edgeInteriorNormal(polyB, edgeB);
  if (!nAIn || !nBIn) {
    return false;
  }
  const midA = { x: (a0.x + a1.x) * 0.5, y: (a0.y + a1.y) * 0.5 };
  const midB = { x: (b0.x + b1.x) * 0.5, y: (b0.y + b1.y) * 0.5 };
  const toward = { x: midB.x - midA.x, y: midB.y - midA.y };
  const uToward = unit2(toward);
  if (!uToward) {
    return false;
  }
  const facingA = (-nAIn.x) * uToward.x + (-nAIn.y) * uToward.y;
  const facingB = nBIn.x * uToward.x + nBIn.y * uToward.y;
  return facingA >= 0.08 && facingB >= 0.08;
}

/**
 * Подобрать ребро второго многоугольника: параллельно исходному, ориентировано «навстречу».
 */
export function findCompatibleRoofJoinTargetEdge(
  polyA: readonly Point2D[],
  edgeA: number,
  polyB: readonly Point2D[],
): number | null {
  const nA = polyA.length;
  const nB = polyB.length;
  if (nA < 3 || nB < 3) {
    return null;
  }
  const a0 = polyA[edgeA]!;
  const a1 = polyA[(edgeA + 1) % nA]!;
  const eA = unit2({ x: a1.x - a0.x, y: a1.y - a0.y });
  if (!eA) {
    return null;
  }
  const midA = { x: (a0.x + a1.x) * 0.5, y: (a0.y + a1.y) * 0.5 };
  let bestJ = -1;
  let bestScore = -Infinity;
  for (let j = 0; j < nB; j++) {
    if (!areRoofJoinEdgePairCompatibleMm(polyA, edgeA, polyB, j)) {
      continue;
    }
    const b0 = polyB[j]!;
    const b1 = polyB[(j + 1) % nB]!;
    const eB = unit2({ x: b1.x - b0.x, y: b1.y - b0.y });
    if (!eB) {
      continue;
    }
    const midB = { x: (b0.x + b1.x) * 0.5, y: (b0.y + b1.y) * 0.5 };
    const toward = { x: midB.x - midA.x, y: midB.y - midA.y };
    const opp = -(eA.x * eB.x + eA.y * eB.y);
    const dist = Math.hypot(toward.x, toward.y);
    const score = opp * 0.35 - dist * 1e-7;
    if (score > bestScore) {
      bestScore = score;
      bestJ = j;
    }
  }
  return bestJ >= 0 ? bestJ : null;
}

/**
 * Пересечения бесконечной линии стыка с продолжениями соседних рёбер у ребра `edgeIndex`.
 */
function joinChordEndpointsOnInfiniteLineMm(
  poly: readonly Point2D[],
  edgeIndex: number,
  joinLineThrough: Point2D,
  joinTangentUnit: Point2D,
): { readonly p0: Point2D; readonly p1: Point2D } | null {
  const n = poly.length;
  if (n < 3) {
    return null;
  }
  const i = edgeIndex;
  const iPrev = (i + n - 1) % n;
  const iNext = (i + 2) % n;
  const Vi = poly[i]!;
  const Vi1 = poly[(i + 1) % n]!;
  const Vprev = poly[iPrev]!;
  const Vi2 = poly[iNext]!;
  const j2 = { x: joinLineThrough.x + joinTangentUnit.x, y: joinLineThrough.y + joinTangentUnit.y };
  const P0 = intersectLinesInfinite(Vprev, Vi, joinLineThrough, j2);
  const P1 = intersectLinesInfinite(Vi1, Vi2, joinLineThrough, j2);
  if (!P0 || !P1) {
    return null;
  }
  return { p0: P0, p1: P1 };
}

/**
 * Параметр t вдоль единичного eU: точка = pOrigin + eU * t (обе на одной прямой со стык).
 */
function scalarAlongJoinTangentMm(p: Point2D, pOrigin: Point2D, eU: Point2D): number {
  return (p.x - pOrigin.x) * eU.x + (p.y - pOrigin.y) * eU.y;
}

/**
 * Интервал [tMin, tMax] отрезка стыка для одного многоугольника до пересечения с соседями.
 */
function joinEdgeScalarIntervalMm(
  poly: readonly Point2D[],
  edgeIndex: number,
  pOnJoin: Point2D,
  eU: Point2D,
): { readonly tMin: number; readonly tMax: number } | null {
  const chord = joinChordEndpointsOnInfiniteLineMm(poly, edgeIndex, pOnJoin, eU);
  if (!chord) {
    return null;
  }
  const t0 = scalarAlongJoinTangentMm(chord.p0, pOnJoin, eU);
  const t1 = scalarAlongJoinTangentMm(chord.p1, pOnJoin, eU);
  return { tMin: Math.min(t0, t1), tMax: Math.max(t0, t1) };
}

function mergeScalarIntervalsMm(
  a: { readonly tMin: number; readonly tMax: number },
  b: { readonly tMin: number; readonly tMax: number },
): { readonly lo: number; readonly hi: number } | null {
  const lo = Math.max(a.tMin, b.tMin);
  const hi = Math.min(a.tMax, b.tMax);
  if (hi - lo < MIN_EDGE_MM) {
    return null;
  }
  return { lo, hi };
}

/**
 * Заменить ребро фиксированным отрезком (концы уже на линии стыка); порядок вершин — по обходу многоугольника.
 */
function replacePolygonEdgeWithJoinEndpointsMm(
  poly: readonly Point2D[],
  edgeIndex: number,
  qLo: Point2D,
  qHi: Point2D,
): Point2D[] | null {
  const n = poly.length;
  if (n < 3) {
    return null;
  }
  const i = edgeIndex;
  const Vi = poly[i]!;
  const Vi1 = poly[(i + 1) % n]!;
  const u = { x: Vi1.x - Vi.x, y: Vi1.y - Vi.y };
  const w0 = { x: qLo.x - Vi.x, y: qLo.y - Vi.y };
  const w1 = { x: qHi.x - Vi.x, y: qHi.y - Vi.y };
  const s0 = w0.x * u.x + w0.y * u.y;
  const s1 = w1.x * u.x + w1.y * u.y;
  const Q0 = s0 < s1 ? qLo : qHi;
  const Q1 = s0 < s1 ? qHi : qLo;
  const edgeLen = Math.hypot(Q1.x - Q0.x, Q1.y - Q0.y);
  if (edgeLen < MIN_EDGE_MM) {
    return null;
  }
  const out: Point2D[] = [];
  for (let k = 0; k < n; k++) {
    if (k === i) {
      out.push({ x: Q0.x, y: Q0.y }, { x: Q1.x, y: Q1.y });
    } else if (k === (i + 1) % n) {
      continue;
    } else {
      out.push({ x: poly[k]!.x, y: poly[k]!.y });
    }
  }
  return out;
}

/**
 * Заменить ребро `edgeIndex` (Vi–Vi+1) отрезком на линии стыка между двумя параллельными рёбрами.
 * Точки пересечения — с продолжениями соседних рёбер многоугольника.
 */
export function replacePolygonEdgeWithParallelJoinLine(
  poly: readonly Point2D[],
  edgeIndex: number,
  joinLineThrough: Point2D,
  joinTangentUnit: Point2D,
): Point2D[] | null {
  const chord = joinChordEndpointsOnInfiniteLineMm(poly, edgeIndex, joinLineThrough, joinTangentUnit);
  if (!chord) {
    return null;
  }
  return replacePolygonEdgeWithJoinEndpointsMm(poly, edgeIndex, chord.p0, chord.p1);
}

function polygonAreaSignedMm(poly: readonly Point2D[]): number {
  let s = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += poly[i]!.x * poly[j]!.y - poly[j]!.x * poly[i]!.y;
  }
  return s * 0.5;
}

/**
 * Два выпуклых контура, соединяемые рёбра почти параллельны.
 * Линия стыка — параллельна рёбрам и проходит посередине между прямыми, содержащими эти рёбра.
 */
export function joinParallelRoofPlaneEdgesToMidlineMm(
  planeA: RoofPlaneEntity,
  edgeA: number,
  planeB: RoofPlaneEntity,
  edgeB: number,
): { readonly a: RoofPlaneEntity; readonly b: RoofPlaneEntity } | { readonly error: string } {
  if (planeA.id === planeB.id) {
    return { error: "Соединение невозможно: выбрана одна и та же плоскость." };
  }
  const polyA0 = roofPlanePolygonMm(planeA);
  const polyB0 = roofPlanePolygonMm(planeB);
  if (polyA0.length < 3 || polyB0.length < 3) {
    return { error: "Соединение невозможно: некорректный контур." };
  }
  const polyA = polyA0.map((p) => ({ x: p.x, y: p.y }));
  const polyB = polyB0.map((p) => ({ x: p.x, y: p.y }));
  const nA = polyA.length;
  const nB = polyB.length;
  if (edgeA < 0 || edgeA >= nA || edgeB < 0 || edgeB >= nB) {
    return { error: "Соединение невозможно: неверное ребро." };
  }

  const a0 = polyA[edgeA]!;
  const a1 = polyA[(edgeA + 1) % nA]!;
  const b0 = polyB[edgeB]!;
  const b1 = polyB[(edgeB + 1) % nB]!;
  const eU = unit2({ x: a1.x - a0.x, y: a1.y - a0.y });
  const eBv = unit2({ x: b1.x - b0.x, y: b1.y - b0.y });
  if (!eU || !eBv) {
    return { error: "Соединение невозможно: слишком короткое ребро." };
  }
  if (Math.abs(eU.x * eBv.y - eU.y * eBv.x) > PARALLEL_CROSS_MAX) {
    return { error: "Соединение невозможно: рёбра не параллельны (текущий режим MVP)." };
  }

  const midA = { x: (a0.x + a1.x) * 0.5, y: (a0.y + a1.y) * 0.5 };
  const midB = { x: (b0.x + b1.x) * 0.5, y: (b0.y + b1.y) * 0.5 };
  /** Единичная нормаль к обоим ребрам на плане; направление от прямой A к прямой B. */
  let n = { x: -eU.y, y: eU.x };
  if ((midB.x - midA.x) * n.x + (midB.y - midA.y) * n.y < 0) {
    n = { x: -n.x, y: -n.y };
  }
  /**
   * Средняя линия стыка в одной системе координат (мм плана):
   * sA = n·midA, sB = n·midB — смещения середин выбранных рёбер вдоль общей нормали;
   * линия стыка: n·p = sJoin = (sA + sB) / 2 (эквивалентно середине между двумя параллельными прямыми).
   */
  const sA = n.x * midA.x + n.y * midA.y;
  const sB = n.x * midB.x + n.y * midB.y;
  const sJoin = (sA + sB) * 0.5;
  const distAbs = Math.abs(sB - sA);
  if (distAbs < MIN_JOIN_GAP_MM) {
    return { error: "Соединение невозможно: плоскости слишком близко или уже соприкасаются." };
  }
  const pOnJoin = { x: midA.x + n.x * (sJoin - sA), y: midA.y + n.y * (sJoin - sA) };

  const intA = joinEdgeScalarIntervalMm(polyA, edgeA, pOnJoin, eU);
  const intB = joinEdgeScalarIntervalMm(polyB, edgeB, pOnJoin, eU);
  if (!intA || !intB) {
    return { error: "Соединение невозможно: не удалось построить линию стыка." };
  }
  const merged = mergeScalarIntervalsMm(intA, intB);
  if (!merged) {
    return {
      error:
        "Соединение невозможно: выбранные рёбра не дают общего отрезка стыка (проверьте форму контуров).",
    };
  }
  const qLo = { x: pOnJoin.x + eU.x * merged.lo, y: pOnJoin.y + eU.y * merged.lo };
  const qHi = { x: pOnJoin.x + eU.x * merged.hi, y: pOnJoin.y + eU.y * merged.hi };

  const nextA = replacePolygonEdgeWithJoinEndpointsMm(polyA, edgeA, qLo, qHi);
  const nextB = replacePolygonEdgeWithJoinEndpointsMm(polyB, edgeB, qLo, qHi);
  if (!nextA || !nextB) {
    return { error: "Соединение невозможно: не удалось построить линию стыка." };
  }
  if (
    Math.abs(polygonAreaSignedMm(nextA)) <= MM_EPS ||
    Math.abs(polygonAreaSignedMm(nextB)) <= MM_EPS
  ) {
    return { error: "Соединение невозможно: контур стал нулевой площади." };
  }

  const t = new Date().toISOString();
  const withContourA = { ...planeA, planContourMm: nextA, updatedAt: t };
  const withContourB = { ...planeB, planContourMm: nextB, updatedAt: t };
  const syncA = updateRoofPlaneEntityAfterContourEdit(withContourA, nextA);
  const syncB = updateRoofPlaneEntityAfterContourEdit(withContourB, nextB);
  if (!syncA || !syncB) {
    return { error: "Соединение невозможно: не удалось пересчитать параметры ската." };
  }
  return { a: syncA, b: syncB };
}

/**
 * Стыковка по двум выбранным рёбрам.
 * Параллельные (на плане) рёбра → **средняя линия строго между этими рёбрами** (`joinParallelRoofPlaneEdgesToMidlineMm`),
 * без линии пересечения «высотных» плоскостей (она не совпадает с серединой выбранных сторон и давала асимметрию).
 * Непараллельные → обрезка по линии пересечения плоскостей скатов (вальма / разный уклон).
 */
export function joinTwoRoofPlaneContoursBySelectedEdgesMm(
  planeA: RoofPlaneEntity,
  edgeA: number,
  planeB: RoofPlaneEntity,
  edgeB: number,
): { readonly a: RoofPlaneEntity; readonly b: RoofPlaneEntity } | { readonly error: string } {
  if (planeA.id === planeB.id) {
    return { error: "Соединение невозможно: выберите второй скат." };
  }
  const polyA = roofPlanePolygonMm(planeA);
  const polyB = roofPlanePolygonMm(planeB);
  const nA = polyA.length;
  const nB = polyB.length;
  if (nA < 3 || nB < 3) {
    return { error: "Соединение невозможно: некорректный контур." };
  }
  if (edgeA < 0 || edgeA >= nA || edgeB < 0 || edgeB >= nB) {
    return { error: "Соединение невозможно: неверное ребро." };
  }

  const a0 = polyA[edgeA]!;
  const a1 = polyA[(edgeA + 1) % nA]!;
  const b0 = polyB[edgeB]!;
  const b1 = polyB[(edgeB + 1) % nB]!;
  const eA = unit2({ x: a1.x - a0.x, y: a1.y - a0.y });
  const eB = unit2({ x: b1.x - b0.x, y: b1.y - b0.y });
  if (!eA || !eB) {
    return { error: "Соединение невозможно: слишком короткое ребро." };
  }
  const cross = Math.abs(eA.x * eB.y - eA.y * eB.x);
  const parallel = cross <= PARALLEL_CROSS_MAX;

  if (parallel) {
    return joinParallelRoofPlaneEdgesToMidlineMm(planeA, edgeA, planeB, edgeB);
  }
  return tryJoinTwoRoofPlaneContoursMm(planeA, planeB, edgeA, edgeB);
}

/** Алиас к joinTwoRoofPlaneContoursBySelectedEdgesMm (тесты, внешние вызовы). */
export function joinTwoRoofPlaneContoursMvp(
  planeA: RoofPlaneEntity,
  edgeA: number,
  planeB: RoofPlaneEntity,
  edgeB: number,
): { readonly a: RoofPlaneEntity; readonly b: RoofPlaneEntity } | { readonly error: string } {
  return joinTwoRoofPlaneContoursBySelectedEdgesMm(planeA, edgeA, planeB, edgeB);
}
