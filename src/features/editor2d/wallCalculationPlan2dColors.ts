/**
 * Цвета заливки расчётного слоя в плане (SIP core + доски) — общие для Pixi и SVG «Вид сверху».
 */

import { normalizeLumberRole, type LumberRole } from "@/core/domain/wallCalculation";
import type { ProfileMaterialType } from "@/core/domain/profile";
import type { Profile } from "@/core/domain/profile";
import { isInsulationCoreMaterial, resolveWallProfileCoreBandMm } from "@/core/domain/wallProfileLayers";
import { resolveWallCalculationModel } from "@/core/domain/wallManufacturing";
import { fillColor2dForMaterialType, plan2dLayerFillAlpha } from "./materials2d";

/** Fallback заливки ядра SIP в расчётном слое плана — светлый приглушённый тон, низкая альфа. */
export const SIP_PLAN2D_FILL_HEX = 0xc5d4cc;
export const SIP_PLAN2D_FILL_ALPHA = 0.14;

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
  // Только чистый каркас/ГКЛ — серая подложка; листовой без каркаса и SIP — ниже по core.
  if (resolveWallCalculationModel(profile) === "frame") {
    return { color: 0x94a3b8, alpha: 0.22 };
  }
  /** Листовой материал: сегменты расчёта — не SIP-ядро; заливка как у наружного листа, без тона EPS. */
  if (resolveWallCalculationModel(profile) === "sheet") {
    const layers = [...profile.layers].sort((a, b) => a.orderIndex - b.orderIndex);
    const first = layers.find((l) => !isInsulationCoreMaterial(l.materialType));
    const mt: ProfileMaterialType = first?.materialType ?? "osb";
    return { color: fillColor2dForMaterialType(mt), alpha: plan2dLayerFillAlpha(mt, 0.18) };
  }
  const core = resolveWallProfileCoreBandMm(wallThicknessMm, profile);
  const mt = core?.materialType;
  if (!mt || mt === "eps" || mt === "xps" || mt === "insulation") {
    return { color: SIP_PLAN2D_FILL_HEX, alpha: SIP_PLAN2D_FILL_ALPHA };
  }
  return { color: fillColor2dForMaterialType(mt), alpha: plan2dLayerFillAlpha(mt, 0.24) };
}

export function lumberPlan2dFillForRole(role: LumberRole): { readonly color: number; readonly alpha: number } {
  return lumberPlan2dFillForRoleAndMaterial(role, "wood");
}

export function lumberPlan2dFillForRoleAndMaterial(
  role: LumberRole,
  materialType: ProfileMaterialType,
): { readonly color: number; readonly alpha: number } {
  if (materialType === "steel") {
    return { color: 0x8a9098, alpha: 0.58 };
  }
  const r = normalizeLumberRole(role);
  if (r === "upper_plate" || r === "lower_plate") {
    return { color: PLATE_FILL, alpha: PLATE_ALPHA };
  }
  if (r === "opening_left_stud" || r === "opening_right_stud") {
    return { color: OPENING_STUD_FILL, alpha: LUMBER_ALPHA };
  }
  if (r === "opening_header" || r === "opening_cripple" || r === "opening_sill") {
    return { color: OPENING_HEADER_FILL, alpha: LUMBER_ALPHA };
  }
  if (r === "tee_joint_board" || r === "corner_joint_board") {
    return { color: TEE_CORNER_FILL, alpha: LUMBER_ALPHA };
  }
  return { color: LUMBER_FILL, alpha: LUMBER_ALPHA };
}
