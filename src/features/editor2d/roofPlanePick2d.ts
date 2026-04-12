import type { SlabEntity } from "@/core/domain/slab";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import type { Point2D } from "@/core/geometry/types";

import { closestPointOnSlabBoundaryMm, pointInSlabPolygonEvenOdd } from "./slabPick2d";

function asPseudoSlab(pts: readonly Point2D[]): SlabEntity {
  return { pointsMm: pts } as SlabEntity;
}

export function pickClosestRoofPlaneAtPoint(
  worldMm: Point2D,
  planes: readonly RoofPlaneEntity[],
  tolMm: number,
): { readonly roofPlaneId: string } | null {
  const tol2 = tolMm * tolMm;
  let bestId: string | null = null;
  let bestD = tol2;
  for (const rp of planes) {
    const poly = asPseudoSlab(roofPlanePolygonMm(rp));
    if (poly.pointsMm.length < 3) {
      continue;
    }
    const onB = closestPointOnSlabBoundaryMm(poly, worldMm);
    const dEdge = dist2(worldMm, onB);
    const inside = pointInSlabPolygonEvenOdd(worldMm, poly);
    const d = inside ? 0 : dEdge;
    if (d < bestD - 1e-9) {
      bestD = d;
      bestId = rp.id;
    }
  }
  return bestId ? { roofPlaneId: bestId } : null;
}

function dist2(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
