/**
 * Единая геометрия расчётного слоя в плане стены (SIP core + доски в полосе core),
 * как в drawWallCalculationOverlay2d — источник для 2D Pixi и для SVG «Вид сверху» в режиме «Вид стены».
 */

import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";
import type { LumberRole, WallCalculationResult } from "@/core/domain/wallCalculation";
import type { ProfileMaterialType } from "@/core/domain/profile";
import { pieceAlongIntervalMm } from "@/core/domain/wallCalculation3dSpecs";
import { boardCoreNormalOffsetsMm } from "@/core/domain/wallLumberBoard2dOffsets";
import { clampAlongWallRangeMm } from "@/core/domain/wallLumberPlan2dGeometry";
import { isLumberRoleDrawnInPlan2d } from "@/core/domain/wallCalculationPlan2dPolicy";

import type { Point2dMm } from "./wallPlanGeometry2d";
import { quadCornersAlongWallMm } from "./wallPlanGeometry2d";

function wallSegmentEndpoints(
  wall: Wall,
  s0: number,
  s1: number,
  lengthMm: number,
): { readonly sx: number; readonly sy: number; readonly ex: number; readonly ey: number } {
  const t0 = s0 / lengthMm;
  const t1 = s1 / lengthMm;
  return {
    sx: wall.start.x + (wall.end.x - wall.start.x) * t0,
    sy: wall.start.y + (wall.end.y - wall.start.y) * t0,
    ex: wall.start.x + (wall.end.x - wall.start.x) * t1,
    ey: wall.start.y + (wall.end.y - wall.start.y) * t1,
  };
}

export type WallCalculationPlanQuad =
  | { readonly kind: "sip"; readonly corners: readonly Point2dMm[] }
  | {
      readonly kind: "lumber";
      readonly role: LumberRole;
      readonly materialType: ProfileMaterialType;
      readonly corners: readonly Point2dMm[];
    };

/**
 * Четырёхугольники SIP core и досок (across_wall) в полосе core — та же логика, что drawWallCalculationOverlay2d.
 * `wall` — в координатах плана (на «Вид сверху» в режиме «Вид стены» передают стену, выровненную вдоль +X 0…L).
 */
export function collectWallCalculationPlanQuads(
  wall: Wall,
  project: Project,
  calc: WallCalculationResult,
): readonly WallCalculationPlanQuad[] {
  const L = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  if (L < 1e-6) {
    return [];
  }
  const coreOff = boardCoreNormalOffsetsMm(wall, calc, project);
  const out: WallCalculationPlanQuad[] = [];

  for (const r of calc.sipRegions) {
    const span = clampAlongWallRangeMm(r.startOffsetMm, r.endOffsetMm, L);
    if (!span) {
      continue;
    }
    const seg = wallSegmentEndpoints(wall, span.lo, span.hi, L);
    const corners = quadCornersAlongWallMm(seg.sx, seg.sy, seg.ex, seg.ey, coreOff.offStartMm, coreOff.offEndMm);
    if (corners) {
      out.push({ kind: "sip", corners });
    }
  }

  for (const piece of calc.lumberPieces) {
    if (!isLumberRoleDrawnInPlan2d(piece.role)) {
      continue;
    }
    if (piece.orientation !== "across_wall") {
      continue;
    }
    /** Тот же интервал вдоль стены, что и фасад «Вид стены» / 3D (`lumberPieceWallElevationRectMm`), со сдвигом joint_board и т.д. */
    const [alongLo, alongHi] = pieceAlongIntervalMm(piece);
    const along = clampAlongWallRangeMm(alongLo, alongHi, L);
    if (!along) {
      continue;
    }
    const seg = wallSegmentEndpoints(wall, along.lo, along.hi, L);
    const corners = quadCornersAlongWallMm(seg.sx, seg.sy, seg.ex, seg.ey, coreOff.offStartMm, coreOff.offEndMm);
    if (corners) {
      out.push({ kind: "lumber", role: piece.role, materialType: piece.materialType ?? "wood", corners });
    }
  }

  return out;
}
