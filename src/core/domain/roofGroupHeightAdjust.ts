import type { Point2D } from "../geometry/types";

import type { RoofPlaneEntity } from "./roofPlane";
import { roofPlanePolygonMm } from "./roofPlane";

const VERTEX_MATCH_MM = 2.5;

/**
 * Z по «сырой» модели ската: отметка карниза (низ по стоку) + подъём к коньку.
 * Без поправки стыков между скатами.
 */
export function rawRoofZUpAtPlanPointMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  px: number,
  py: number,
): number {
  const poly = roofPlanePolygonMm(rp);
  const ux = rp.slopeDirection.x;
  const uy = rp.slopeDirection.y;
  const ulen = Math.hypot(ux, uy);
  const uxn = ulen > 1e-9 ? ux / ulen : 1;
  const uyn = ulen > 1e-9 ? uy / ulen : 0;
  let maxDot = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    maxDot = Math.max(maxDot, p.x * uxn + p.y * uyn);
  }
  const d = px * uxn + py * uyn;
  const tanP = Math.tan((rp.angleDeg * Math.PI) / 180);
  return layerBaseMm + rp.levelMm + (maxDot - d) * tanP;
}

function distMm(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Первая пара близких вершин двух контуров → середина (мм плана). */
export function findSharedPlanPointBetweenRoofPlanesMm(
  a: readonly Point2D[],
  b: readonly Point2D[],
): Point2D | null {
  for (const pa of a) {
    for (const pb of b) {
      if (distMm(pa, pb) <= VERTEX_MATCH_MM) {
        return { x: (pa.x + pb.x) * 0.5, y: (pa.y + pb.y) * 0.5 };
      }
    }
  }
  return null;
}

/**
 * Поправка +Δ к `levelMm` (добавляется к высоте всей плоскости ската), чтобы
 * соседние скаты с общими вершинами в плане совпадали по Z в 3D.
 *
 * Причина расхождений: у каждого ската свой `maxDot` по своему полигону, из‑за чего
 * одна и та же точка на стыке получала разный подъём.
 */
export function computeRoofGroupZAdjustMmByPlaneId(
  planes: readonly RoofPlaneEntity[],
  layerBaseForLayerId: (layerId: string) => number,
): ReadonlyMap<string, number> {
  if (planes.length === 0) {
    return new Map();
  }
  if (planes.length === 1) {
    return new Map([[planes[0]!.id, 0]]);
  }

  const byId = new Map(planes.map((p) => [p.id, p] as const));
  const adj = new Map<string, Set<string>>();
  for (const p of planes) {
    adj.set(p.id, new Set());
  }

  const polys = planes.map((p) => [...roofPlanePolygonMm(p)]);
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      if (findSharedPlanPointBetweenRoofPlanesMm(polys[i]!, polys[j]!)) {
        const ia = planes[i]!.id;
        const ib = planes[j]!.id;
        adj.get(ia)!.add(ib);
        adj.get(ib)!.add(ia);
      }
    }
  }

  const adjust = new Map<string, number>();
  const root = planes[0]!.id;
  adjust.set(root, 0);
  const queue: string[] = [root];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const pc = byId.get(cur)!;
    const baseC = layerBaseForLayerId(pc.layerId);
    for (const nb of adj.get(cur) ?? []) {
      if (adjust.has(nb)) {
        continue;
      }
      const pn = byId.get(nb)!;
      const baseN = layerBaseForLayerId(pn.layerId);
      const pA = roofPlanePolygonMm(pc);
      const pB = roofPlanePolygonMm(pn);
      const shared = findSharedPlanPointBetweenRoofPlanesMm(pA, pB);
      if (!shared) {
        continue;
      }
      const zCur = rawRoofZUpAtPlanPointMm(pc, baseC, shared.x, shared.y) + (adjust.get(cur) ?? 0);
      const zNbRaw = rawRoofZUpAtPlanPointMm(pn, baseN, shared.x, shared.y);
      const delta = zCur - zNbRaw;
      adjust.set(nb, delta);
      queue.push(nb);
    }
  }

  for (const p of planes) {
    if (!adjust.has(p.id)) {
      adjust.set(p.id, 0);
    }
  }
  return adjust;
}
