import type { RoofPlaneEntity } from "./roofPlane";
import {
  roofPlaneDrainUnitPlanMm,
  roofPlaneExtrusionDirectionMm,
  roofPlaneMaxDotAlongDrainMm,
  roofPlanePolygonMm,
} from "./roofPlane";

/** Включить подробный лог стыка: `VITE_ROOF_JOIN_DEBUG=true` или `ROOF_JOIN_DEBUG=1` (vitest/node). */
export function isRoofJoinDebugEnabled(): boolean {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.["VITE_ROOF_JOIN_DEBUG"] === "true") {
      return true;
    }
  } catch {
    /* ignore */
  }
  if (typeof process !== "undefined" && process.env?.["ROOF_JOIN_DEBUG"] === "1") {
    return true;
  }
  return false;
}

/** Снимок ската для отладки стыка (план, уровень, сток). */
export interface RoofJoinDebugPlaneSnapMm {
  readonly id: string;
  readonly layerId: string;
  readonly profileId: string;
  readonly verticesPlanMm: readonly { readonly x: number; readonly y: number }[];
  readonly slopeDirection: { readonly x: number; readonly y: number };
  readonly extrusionDirection: { readonly x: number; readonly y: number };
  readonly angleDeg: number;
  readonly levelMm: number;
  readonly depthMm: number;
  readonly p1: { readonly x: number; readonly y: number };
  readonly p2: { readonly x: number; readonly y: number };
}

export function roofJoinDebugSnapPlaneMm(rp: RoofPlaneEntity): RoofJoinDebugPlaneSnapMm {
  const poly = roofPlanePolygonMm(rp);
  const ex = roofPlaneExtrusionDirectionMm(rp);
  return {
    id: rp.id,
    layerId: rp.layerId,
    profileId: rp.profileId,
    verticesPlanMm: poly.map((p) => ({ x: p.x, y: p.y })),
    slopeDirection: { x: rp.slopeDirection.x, y: rp.slopeDirection.y },
    extrusionDirection: { x: ex.x, y: ex.y },
    angleDeg: rp.angleDeg,
    levelMm: rp.levelMm,
    depthMm: rp.depthMm,
    p1: { x: rp.p1.x, y: rp.p1.y },
    p2: { x: rp.p2.x, y: rp.p2.y },
  };
}

/** Лог модели высоты ската (2D/3D): `VITE_ROOF_HEIGHT_DEBUG=true` или `ROOF_HEIGHT_DEBUG=1`. */
export function isRoofHeightDebugEnabled(): boolean {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.["VITE_ROOF_HEIGHT_DEBUG"] === "true") {
      return true;
    }
  } catch {
    /* ignore */
  }
  if (typeof process !== "undefined" && process.env?.["ROOF_HEIGHT_DEBUG"] === "1") {
    return true;
  }
  return false;
}

/**
 * Снимок данных для сравнения двух скатов: угол, сток, maxDot, levelMm, нормаль 3D (из той же формулы, что меш).
 */
export function roofPlaneHeightDebugSnapMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  zAdjustMm: number,
): {
  readonly id: string;
  readonly angleDeg: number;
  readonly levelMm: number;
  readonly zAdjustMm: number;
  readonly layerBaseMm: number;
  readonly slopeDirection: { readonly x: number; readonly y: number };
  readonly drainUnit: { readonly uxn: number; readonly uyn: number };
  readonly maxDotAlongDrain: number;
  readonly minDotAlongDrain: number;
  readonly runAlongDrainSpanMm: number;
  readonly planeContourVerticesMm: readonly { readonly x: number; readonly y: number }[];
  readonly heightFormula: "z = layerBase + levelMm + zAdjust + tan(angle)·(maxDot − p·û)";
} {
  const poly = roofPlanePolygonMm(rp);
  const { uxn, uyn } = roofPlaneDrainUnitPlanMm(rp);
  const maxDot = roofPlaneMaxDotAlongDrainMm(poly, uxn, uyn);
  let minDot = Number.POSITIVE_INFINITY;
  for (const p of poly) {
    minDot = Math.min(minDot, p.x * uxn + p.y * uyn);
  }
  return {
    id: rp.id,
    angleDeg: rp.angleDeg,
    levelMm: rp.levelMm,
    zAdjustMm,
    layerBaseMm,
    slopeDirection: { x: rp.slopeDirection.x, y: rp.slopeDirection.y },
    drainUnit: { uxn, uyn },
    maxDotAlongDrain: maxDot,
    minDotAlongDrain: minDot,
    runAlongDrainSpanMm: maxDot - minDot,
    planeContourVerticesMm: poly.map((p) => ({ x: p.x, y: p.y })),
    heightFormula: "z = layerBase + levelMm + zAdjust + tan(angle)·(maxDot − p·û)",
  };
}
