/**
 * Разбиение прямоугольника грани стены (ось вдоль стены u × высота y) без проёмов.
 * Без CSG: последовательное вычитание осевых прямоугольников проёмов.
 */

const EPS = 0.5;
const MIN_MM = 2;

export interface WallFaceRectMm {
  readonly u0: number;
  readonly u1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface WallOpeningFaceMm {
  readonly lo: number;
  readonly hi: number;
  readonly y0: number;
  readonly y1: number;
}

function subtractOneRect(r: WallFaceRectMm, o: WallOpeningFaceMm): WallFaceRectMm[] {
  const iu0 = Math.max(r.u0, o.lo);
  const iu1 = Math.min(r.u1, o.hi);
  const iy0 = Math.max(r.y0, o.y0);
  const iy1 = Math.min(r.y1, o.y1);
  if (iu1 - iu0 <= EPS || iy1 - iy0 <= EPS) {
    return [r];
  }
  if (iu0 >= r.u1 - EPS || iu1 <= r.u0 + EPS || iy0 >= r.y1 - EPS || iy1 <= r.y0 + EPS) {
    return [r];
  }

  const out: WallFaceRectMm[] = [];
  if (r.u0 < iu0 - EPS) {
    out.push({ u0: r.u0, u1: iu0, y0: r.y0, y1: r.y1 });
  }
  if (iu1 < r.u1 - EPS) {
    out.push({ u0: iu1, u1: r.u1, y0: r.y0, y1: r.y1 });
  }
  const um0 = Math.max(r.u0, iu0);
  const um1 = Math.min(r.u1, iu1);
  if (um1 - um0 > EPS) {
    if (r.y0 < iy0 - EPS) {
      out.push({ u0: um0, u1: um1, y0: r.y0, y1: iy0 });
    }
    if (iy1 < r.y1 - EPS) {
      out.push({ u0: um0, u1: um1, y0: iy1, y1: r.y1 });
    }
  }
  return out.filter((q) => q.u1 - q.u0 > MIN_MM && q.y1 - q.y0 > MIN_MM);
}

/**
 * Возвращает набор непересекающихся прямоугольников «остатка» грани стены после вычитания проёмов.
 */
export function subtractOpeningFacesFromWallRect(
  wallLenMm: number,
  wallHeightMm: number,
  openings: readonly WallOpeningFaceMm[],
): readonly WallFaceRectMm[] {
  let rects: WallFaceRectMm[] = [{ u0: 0, u1: wallLenMm, y0: 0, y1: wallHeightMm }];
  for (const o of openings) {
    if (o.hi - o.lo <= EPS || o.y1 - o.y0 <= EPS) {
      continue;
    }
    const next: WallFaceRectMm[] = [];
    for (const r of rects) {
      next.push(...subtractOneRect(r, o));
    }
    rects = next;
  }
  return rects;
}
