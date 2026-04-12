import type { Point2D } from "../geometry/types";

const EPS = 1e-6;

function unit2(v: Point2D): Point2D | null {
  const len = Math.hypot(v.x, v.y);
  if (len < EPS) {
    return null;
  }
  return { x: v.x / len, y: v.y / len };
}

/** Внешняя нормаль к ребру poly[i]→poly[i+1] при обходе CCW. */
function outwardNormalEdgeCcWMm(a: Point2D, b: Point2D): Point2D | null {
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const len = Math.hypot(tx, ty);
  if (len < EPS) {
    return null;
  }
  const tnx = tx / len;
  const tny = ty / len;
  return { x: tny, y: -tnx };
}

/** Прямая dot(p, n) = c; n не обязательно единичная. */
function intersectLinesMm(
  n1x: number,
  n1y: number,
  c1: number,
  n2x: number,
  n2y: number,
  c2: number,
): Point2D | null {
  const det = n1x * n2y - n1y * n2x;
  if (Math.abs(det) < EPS * EPS) {
    return null;
  }
  const x = (c1 * n2y - n1y * c2) / det;
  const y = (n1x * c2 - c1 * n2x) / det;
  return { x, y };
}

/**
 * Параллельный перенос рёбер выпуклого многоугольника CCW на расстояния edgeOffset[i] наружу.
 * edgeOffset[i] соответствует ребру i → i+1.
 */
export function offsetConvexPolygonByEdgeDistancesMm(
  polyCcW: readonly Point2D[],
  edgeOffset: readonly number[],
): Point2D[] | null {
  const n = polyCcW.length;
  if (n < 3 || edgeOffset.length !== n) {
    return null;
  }
  const lines: { readonly nx: number; readonly ny: number; readonly c: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = polyCcW[i]!;
    const b = polyCcW[(i + 1) % n]!;
    const on = outwardNormalEdgeCcWMm(a, b);
    if (!on) {
      return null;
    }
    const d = Math.max(0, edgeOffset[i]!);
    const c = a.x * on.x + a.y * on.y + d;
    lines.push({ nx: on.x, ny: on.y, c });
  }
  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const L0 = lines[(i + n - 1) % n]!;
    const L1 = lines[i]!;
    const p = intersectLinesMm(L0.nx, L0.ny, L0.c, L1.nx, L1.ny, L1.c);
    if (!p) {
      return null;
    }
    out.push(p);
  }
  return out;
}

/**
 * Для четырёхугольника CCW: `slopeDirection` — нормализованное направление стока (как стрелка на плане).
 * Карниз — ребро, центр которого дальше всех по этому вектору (max dot(mid, fall)); конёк — min;
 * два остальных ребра — боковые свесы.
 *
 * Эквивалентно для прямоугольника: внешняя нормаль карниза сонаправлена со стоком (max dot(n_out, fall)).
 * Раньше ошибочно брали min dot(n_out, fall) как карниз — свес уходил на конёк.
 */
export interface QuadEdgeOverhangOptions {
  /**
   * Индексы рёбер четырёхугольника (ребро i: вершина i → i+1), на которых **не** накладывать свес.
   * Нужно для **внутреннего стыка** двух скатов: у каждого полигона внешняя нормаль к общему ребру
   * направлена в противоположные стороны; боковой свес сдвигает линии в разные стороны на ~2×side,
   * из‑за чего «один скат длиннее», линия стыка расходится в 2D/3D.
   */
  readonly zeroOffsetEdgeIndices?: ReadonlySet<number>;
}

export function quadEdgeOverhangDistancesMm(
  quadCcW: readonly Point2D[],
  slopeDirection: Point2D,
  eaveOverhangMm: number,
  sideOverhangMm: number,
  opts?: QuadEdgeOverhangOptions,
): readonly number[] {
  const fall = unit2(slopeDirection);
  const n = quadCcW.length;
  if (!fall) {
    return new Array(n).fill(0);
  }
  /** Проекция центра ребра на направление стока: чем больше, тем «ниже по склону» эта сторона (карниз). */
  const scores: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = quadCcW[i]!;
    const b = quadCcW[(i + 1) % n]!;
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    scores.push(mx * fall.x + my * fall.y);
  }
  let iEave = 0;
  let iRidge = 0;
  for (let i = 1; i < n; i++) {
    if (scores[i]! > scores[iEave]!) {
      iEave = i;
    }
    if (scores[i]! < scores[iRidge]!) {
      iRidge = i;
    }
  }
  const dist = new Array(n).fill(0);
  const e = Math.max(0, eaveOverhangMm);
  const s = Math.max(0, sideOverhangMm);
  const zero = opts?.zeroOffsetEdgeIndices;
  for (let i = 0; i < n; i++) {
    if (zero?.has(i)) {
      dist[i] = 0;
    } else if (i === iEave) {
      dist[i] = e;
    } else if (i === iRidge) {
      dist[i] = 0;
    } else {
      dist[i] = s;
    }
  }
  return dist;
}

/**
 * Применяет свесы профиля к базовому четырёхугольнику CCW.
 * Для n≠4 возвращает копию без изменений (пока только прямоугольные скаты).
 */
export function applyRoofProfileOverhangToPlanPolygonMm(
  basePolygonCcW: readonly Point2D[],
  slopeDirection: Point2D,
  eaveOverhangMm: number,
  sideOverhangMm: number,
  opts?: QuadEdgeOverhangOptions,
): Point2D[] {
  if (basePolygonCcW.length !== 4) {
    return basePolygonCcW.map((p) => ({ x: p.x, y: p.y }));
  }
  if (eaveOverhangMm <= EPS && sideOverhangMm <= EPS) {
    return basePolygonCcW.map((p) => ({ x: p.x, y: p.y }));
  }
  const dist = quadEdgeOverhangDistancesMm(basePolygonCcW, slopeDirection, eaveOverhangMm, sideOverhangMm, opts);
  const next = offsetConvexPolygonByEdgeDistancesMm(basePolygonCcW, dist);
  return next ?? basePolygonCcW.map((p) => ({ x: p.x, y: p.y }));
}

/** Совпадение отрезков с точностью до направления (концы могут быть переставлены), мм. */
export function roofQuadEdgesCoincideUndirectedMm(
  a0: Point2D,
  a1: Point2D,
  b0: Point2D,
  b1: Point2D,
  tolMm: number,
): boolean {
  const dFwd = Math.hypot(a0.x - b0.x, a0.y - b0.y) + Math.hypot(a1.x - b1.x, a1.y - b1.y);
  const dRev = Math.hypot(a0.x - b1.x, a0.y - b1.y) + Math.hypot(a1.x - b0.x, a1.y - b0.y);
  return Math.min(dFwd, dRev) <= tolMm * 4;
}

/**
 * Пары индексов рёбер (i → i+1) двух четырёхугольников CCW, которые совпадают в плане (стык скатов).
 */
export function roofQuadSharedEdgeIndexPairsMm(
  quadCcWA: readonly Point2D[],
  quadCcWB: readonly Point2D[],
  tolMm = 2,
): readonly { readonly indexA: number; readonly indexB: number }[] {
  if (quadCcWA.length !== 4 || quadCcWB.length !== 4) {
    return [];
  }
  const pairs: { readonly indexA: number; readonly indexB: number }[] = [];
  for (let ia = 0; ia < 4; ia++) {
    const a0 = quadCcWA[ia]!;
    const a1 = quadCcWA[(ia + 1) % 4]!;
    for (let ib = 0; ib < 4; ib++) {
      const b0 = quadCcWB[ib]!;
      const b1 = quadCcWB[(ib + 1) % 4]!;
      if (roofQuadEdgesCoincideUndirectedMm(a0, a1, b0, b1, tolMm)) {
        pairs.push({ indexA: ia, indexB: ib });
      }
    }
  }
  return pairs;
}
