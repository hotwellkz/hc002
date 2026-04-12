import type { Point2D } from "../geometry/types";

import type { Project } from "./project";
import type { RoofPlaneEntity } from "./roofPlane";
import { roofPlaneDrainUnitPlanMm, roofPlaneMaxDotAlongDrainMm, roofPlanePolygonMm } from "./roofPlane";

/** Строгое совпадение вершин (наследие, тесты). */
const VERTEX_MATCH_MM = 2.5;

/**
 * Допуск примыкания скатов в плане для стыковки по высоте (мм).
 * После «Соединить контур» общая линия конька может давать разные наборы вершин у соседних полигонов;
 * тогда вершина одного контура лежит близко к ребру другого, а не к вершине — учитываем это.
 */
export const ROOF_PLAN_ADJACENCY_MAX_MM = 14;

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
  const { uxn, uyn } = roofPlaneDrainUnitPlanMm(rp);
  const maxDot = roofPlaneMaxDotAlongDrainMm(poly, uxn, uyn);
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

function closestPointOnSegmentMm(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { readonly x: number; readonly y: number; readonly dist2: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) {
    const dx = px - ax;
    const dy = py - ay;
    return { x: ax, y: ay, dist2: dx * dx + dy * dy };
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx, y: cy, dist2: dx * dx + dy * dy };
}

function polyEdges(poly: readonly Point2D[]): { readonly p0: Point2D; readonly p1: Point2D }[] {
  const n = poly.length;
  const out: { readonly p0: Point2D; readonly p1: Point2D }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ p0: poly[i]!, p1: poly[(i + 1) % n]! });
  }
  return out;
}

/**
 * Точка на плане для выравнивания Z двух скатов: середина между ближайшими элементами границ
 * (вершина–вершина или вершина–ребро). `null`, если контуры дальше `maxDistMm`.
 */
export function findRoofPlanAdjacencyTiePointMm(
  a: readonly Point2D[],
  b: readonly Point2D[],
  maxDistMm: number = ROOF_PLAN_ADJACENCY_MAX_MM,
): Point2D | null {
  const maxD2 = maxDistMm * maxDistMm;
  let bestD2 = maxD2;
  let best: Point2D | null = null;

  for (const pa of a) {
    for (const pb of b) {
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { x: (pa.x + pb.x) * 0.5, y: (pa.y + pb.y) * 0.5 };
      }
    }
  }

  const edgesB = polyEdges(b);
  for (const pa of a) {
    for (const { p0, p1 } of edgesB) {
      const cl = closestPointOnSegmentMm(pa.x, pa.y, p0.x, p0.y, p1.x, p1.y);
      if (cl.dist2 < bestD2) {
        bestD2 = cl.dist2;
        best = { x: (pa.x + cl.x) * 0.5, y: (pa.y + cl.y) * 0.5 };
      }
    }
  }

  const edgesA = polyEdges(a);
  for (const pb of b) {
    for (const { p0, p1 } of edgesA) {
      const cl = closestPointOnSegmentMm(pb.x, pb.y, p0.x, p0.y, p1.x, p1.y);
      if (cl.dist2 < bestD2) {
        bestD2 = cl.dist2;
        best = { x: (pb.x + cl.x) * 0.5, y: (pb.y + cl.y) * 0.5 };
      }
    }
  }

  return best;
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
      if (findRoofPlanAdjacencyTiePointMm(polys[i]!, polys[j]!) != null) {
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
      const shared = findRoofPlanAdjacencyTiePointMm(pA, pB);
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

/**
 * Поправка Z для **всех** скатов проекта: связные по плану группы обрабатываются отдельно.
 * Раньше поправка считалась только внутри одной записи `roofAssemblyCalculations`, из‑за чего
 * два соприкасающихся ската из разных расчётов оставались со сдвигом по высоте в 3D.
 */
export function computeAllRoofPlanesZAdjustMmByPlaneIdInProject(
  project: Project,
  layerBaseForLayerId: (layerId: string) => number,
): ReadonlyMap<string, number> {
  const planes = project.roofPlanes;
  if (planes.length === 0) {
    return new Map();
  }

  const byId = new Map(planes.map((p) => [p.id, p] as const));
  const adj = new Map<string, Set<string>>();
  for (const p of planes) {
    adj.set(p.id, new Set());
  }

  const polys = planes.map((p) => [...roofPlanePolygonMm(p)]);
  const nPl = planes.length;
  for (let i = 0; i < nPl; i++) {
    for (let j = i + 1; j < nPl; j++) {
      if (findRoofPlanAdjacencyTiePointMm(polys[i]!, polys[j]!) != null) {
        const ia = planes[i]!.id;
        const ib = planes[j]!.id;
        adj.get(ia)!.add(ib);
        adj.get(ib)!.add(ia);
      }
    }
  }

  const out = new Map<string, number>();
  const visited = new Set<string>();

  for (const p of planes) {
    if (visited.has(p.id)) {
      continue;
    }
    const comp: RoofPlaneEntity[] = [];
    const stack = [p.id];
    visited.add(p.id);
    while (stack.length > 0) {
      const curId = stack.pop()!;
      comp.push(byId.get(curId)!);
      for (const nb of adj.get(curId) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    const local = computeRoofGroupZAdjustMmByPlaneId(comp, layerBaseForLayerId);
    for (const [id, z] of local) {
      out.set(id, z);
    }
  }

  return out;
}
