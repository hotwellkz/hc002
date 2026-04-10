/**
 * Цвета заливки расчётного слоя в плане (SIP core + доски) — общие для Pixi и SVG «Вид сверху».
 */

import { normalizeLumberRole, type LumberRole } from "@/core/domain/wallCalculation";
import type { Profile } from "@/core/domain/profile";
import { resolveWallProfileCoreBandMm } from "@/core/domain/wallProfileLayers";
import { fillColor2dForMaterialType } from "./materials2d";

export const SIP_PLAN2D_FILL_HEX = 0x2d6a3e;
export const SIP_PLAN2D_FILL_ALPHA = 0.28;

const LUMBER_FILL = 0x6b4a1a;
const LUMBER_ALPHA = 0.55;
const PLATE_FILL = 0x5a4a2a;
const PLATE_ALPHA = 0.52;
const OPENING_STUD_FILL = 0x7a4a3a;
const OPENING_HEADER_FILL = 0x5a4a6a;
const TEE_CORNER_FILL = 0x6a6a3a;

export function wallCalcCorePlan2dFill(
  wallThicknessMm: number,
  profile?: Profile,
): { readonly color: number; readonly alpha: number } {
  if (!profile) {
    return { color: SIP_PLAN2D_FILL_HEX, alpha: SIP_PLAN2D_FILL_ALPHA };
  }
  const core = resolveWallProfileCoreBandMm(wallThicknessMm, profile);
  const mt = core?.materialType;
  if (!mt || mt === "eps" || mt === "xps" || mt === "insulation") {
    return { color: SIP_PLAN2D_FILL_HEX, alpha: SIP_PLAN2D_FILL_ALPHA };
  }
  return { color: fillColor2dForMaterialType(mt), alpha: 0.24 };
}

export function lumberPlan2dFillForRole(role: LumberRole): { readonly color: number; readonly alpha: number } {
  const r = normalizeLumberRole(role);
  if (r === "upper_plate" || r === "lower_plate") {
    return { color: PLATE_FILL, alpha: PLATE_ALPHA };
  }
  if (r === "opening_left_stud" || r === "opening_right_stud") {
    return { color: OPENING_STUD_FILL, alpha: LUMBER_ALPHA };
  }
  if (r === "opening_header" || r === "opening_sill") {
    return { color: OPENING_HEADER_FILL, alpha: LUMBER_ALPHA };
  }
  if (r === "tee_joint_board" || r === "corner_joint_board") {
    return { color: TEE_CORNER_FILL, alpha: LUMBER_ALPHA };
  }
  return { color: LUMBER_FILL, alpha: LUMBER_ALPHA };
}
