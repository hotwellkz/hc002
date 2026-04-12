import type { Point2D } from "../geometry/types";

import type { RoofPlaneEntity } from "./roofPlane";
import { roofPlanePolygonMm } from "./roofPlane";

const EDGE_TOUCH_MM = 12;

function distPointSeg2(p: Point2D, a: Point2D, b: Point2D): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) {
    return Math.hypot(apx, apy);
  }
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * abx;
  const qy = a.y + t * aby;
  return Math.hypot(p.x - qx, p.y - qy);
}

function minDistSegSeg2(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): number {
  const d =
    Math.min(
      distPointSeg2(a1, b1, b2),
      distPointSeg2(a2, b1, b2),
      distPointSeg2(b1, a1, a2),
      distPointSeg2(b2, a1, a2),
    );
  return d;
}

function minPolygonEdgeDistanceMm(polyA: readonly Point2D[], polyB: readonly Point2D[]): number {
  let m = Number.POSITIVE_INFINITY;
  const na = polyA.length;
  const nb = polyB.length;
  for (let i = 0; i < na; i++) {
    const a1 = polyA[i]!;
    const a2 = polyA[(i + 1) % na]!;
    for (let j = 0; j < nb; j++) {
      const b1 = polyB[j]!;
      const b2 = polyB[(j + 1) % nb]!;
      m = Math.min(m, minDistSegSeg2(a1, a2, b1, b2));
    }
  }
  return m;
}

function polygonsTouch(polyA: readonly Point2D[], polyB: readonly Point2D[]): boolean {
  return minPolygonEdgeDistanceMm(polyA, polyB) <= EDGE_TOUCH_MM;
}

/**
 * Возвращает число связных компонент среди выбранных скатов по близости рёбер контура (план).
 */
export function countRoofPlaneConnectivityComponents(planes: readonly RoofPlaneEntity[]): number {
  if (planes.length <= 1) {
    return planes.length === 0 ? 0 : 1;
  }
  const polys = planes.map((p) => [...roofPlanePolygonMm(p)]);
  const n = planes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) {
      parent[ri] = rj;
    }
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (polygonsTouch(polys[i]!, polys[j]!)) {
        union(i, j);
      }
    }
  }
  const roots = new Set<number>();
  for (let i = 0; i < n; i++) {
    roots.add(find(i));
  }
  return roots.size;
}
