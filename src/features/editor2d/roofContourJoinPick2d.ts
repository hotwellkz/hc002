import { closestPointOnSegment } from "@/core/domain/wallJointGeometry";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import type { Point2D } from "@/core/geometry/types";

import { pickClosestRoofPlaneAtPoint } from "./roofPlanePick2d";

function dist2(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function pickRoofPlaneEdgeIndexAtPointMm(
  poly: readonly Point2D[],
  worldMm: Point2D,
  tolMm: number,
  stickyEdgeIndex: number | null,
): number | null {
  const n = poly.length;
  if (n < 3) {
    return null;
  }
  const tol2 = tolMm * tolMm;
  const stickyTol2 = (tolMm * 1.28) ** 2;

  let bestI = -1;
  let bestD = tol2;

  const consider = (i: number, maxD2: number) => {
    const a = poly[i % n]!;
    const b = poly[(i + 1) % n]!;
    const { point } = closestPointOnSegment(a, b, worldMm);
    const d = dist2(worldMm, point);
    if (d <= maxD2 && d < bestD - 1e-9) {
      bestD = d;
      bestI = i;
    }
  };

  if (stickyEdgeIndex != null) {
    consider(stickyEdgeIndex, stickyTol2);
  }
  for (let i = 0; i < n; i++) {
    consider(i, tol2);
  }
  return bestI >= 0 ? bestI : null;
}

export function pickRoofContourJoinHoverMm(
  worldMm: Point2D,
  planes: readonly RoofPlaneEntity[],
  tolMm: number,
  stickyPlaneId: string | null,
  stickyEdgeIndex: number | null,
): { readonly planeId: string; readonly edgeIndex: number } | null {
  const hitPlane = pickClosestRoofPlaneAtPoint(worldMm, planes, tolMm);
  if (!hitPlane) {
    return null;
  }
  const rp = planes.find((p) => p.id === hitPlane.roofPlaneId);
  if (!rp) {
    return null;
  }
  const poly = roofPlanePolygonMm(rp);
  const stickyEdge = stickyPlaneId === rp.id ? stickyEdgeIndex : null;
  const edge = pickRoofPlaneEdgeIndexAtPointMm(poly, worldMm, tolMm, stickyEdge);
  if (edge == null) {
    return null;
  }
  return { planeId: rp.id, edgeIndex: edge };
}

/** Второй шаг стыковки: только другие скаты, не `excludePlaneId`. */
export function pickRoofContourJoinSecondEdgeHoverMm(
  worldMm: Point2D,
  planes: readonly RoofPlaneEntity[],
  excludePlaneId: string,
  tolMm: number,
  stickyPlaneId: string | null,
  stickyEdgeIndex: number | null,
): { readonly planeId: string; readonly edgeIndex: number } | null {
  const candidates = planes.filter((p) => p.id !== excludePlaneId);
  if (candidates.length === 0) {
    return null;
  }
  const hitPlane = pickClosestRoofPlaneAtPoint(worldMm, candidates, tolMm);
  if (!hitPlane) {
    return null;
  }
  const rp = candidates.find((p) => p.id === hitPlane.roofPlaneId);
  if (!rp) {
    return null;
  }
  const poly = roofPlanePolygonMm(rp);
  const stickyEdge = stickyPlaneId === rp.id ? stickyEdgeIndex : null;
  const edge = pickRoofPlaneEdgeIndexAtPointMm(poly, worldMm, tolMm, stickyEdge);
  if (edge == null) {
    return null;
  }
  return { planeId: rp.id, edgeIndex: edge };
}
