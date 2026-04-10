import type { Profile, ProfileMaterialType } from "./profile";
import { sortProfileLayersByOrder } from "./profileOps";

const THICK_EPS_MM = 0.5;

/**
 * Минимальная толщина в px для обводок и швов между слоями на 2D-плане (Pixi и т.п.),
 * чтобы линии оставались читаемыми при любом zoom (геометрия — в мм, линии — в экранных px).
 */
export const MIN_WALL_2D_LAYER_LINE_STROKE_PX = 1.35;

export interface WallProfileLayerStripMm {
  readonly layerId: string;
  readonly materialType: ProfileMaterialType;
  /** Толщина слоя после согласования с wallThicknessMm. */
  readonly thicknessMm: number;
}

/**
 * Слои профиля для визуализации (2D/3D): порядок orderIndex, сумма толщин = wallThicknessMm.
 * null — если не layered или недостаточно слоёв.
 */
export function resolveWallProfileLayerStripsMm(wallThicknessMm: number, profile: Profile): WallProfileLayerStripMm[] | null {
  if (profile.compositionMode !== "layered") {
    return null;
  }
  const sorted = sortProfileLayersByOrder([...profile.layers]);
  if (sorted.length < 2) {
    return null;
  }
  const T = wallThicknessMm;
  let raw = sorted.map((l) => Math.max(0, l.thicknessMm));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum < 1e-6) {
    return null;
  }
  if (Math.abs(sum - T) > THICK_EPS_MM) {
    const k = T / sum;
    raw = raw.map((t) => t * k);
  }
  return sorted.map((l, i) => ({
    layerId: l.id,
    materialType: l.materialType,
    thicknessMm: raw[i]!,
  }));
}

export function isInsulationCoreMaterial(materialType: ProfileMaterialType): boolean {
  return materialType === "eps" || materialType === "xps" || materialType === "insulation";
}

export interface WallProfileCoreBandMm {
  readonly offStartMm: number;
  readonly offEndMm: number;
  readonly materialType: ProfileMaterialType;
}

/**
 * Смещения по нормали (мм) от оси стены для зоны ядра (утеплитель): первая непрерывная
 * полоса слоёв eps/xps/insulation (если в профиле несколько подряд — объединяются).
 */
export function coreLayerNormalOffsetsMm(
  wallThicknessMm: number,
  profile: Profile,
): { readonly offStartMm: number; readonly offEndMm: number } | null {
  const band = resolveWallProfileCoreBandMm(wallThicknessMm, profile);
  return band ? { offStartMm: band.offStartMm, offEndMm: band.offEndMm } : null;
}

export function resolveWallProfileCoreBandMm(
  wallThicknessMm: number,
  profile: Profile,
): WallProfileCoreBandMm | null {
  const strips = resolveWallProfileLayerStripsMm(wallThicknessMm, profile);
  if (!strips || strips.length < 2) {
    return null;
  }
  const T = wallThicknessMm;
  let acc = -T / 2;
  let bandStart: number | null = null;
  let bandEnd: number | null = null;
  for (const strip of strips) {
    const off0 = acc;
    const off1 = acc + strip.thicknessMm;
    if (isInsulationCoreMaterial(strip.materialType)) {
      if (bandStart === null) {
        bandStart = off0;
      }
      bandEnd = off1;
    } else if (bandStart !== null && bandEnd !== null) {
      return { offStartMm: bandStart, offEndMm: bandEnd, materialType: "insulation" };
    }
    acc = off1;
  }
  if (bandStart !== null && bandEnd !== null) {
    return { offStartMm: bandStart, offEndMm: bandEnd, materialType: "insulation" };
  }

  const offsets: { off0: number; off1: number; mt: ProfileMaterialType }[] = [];
  acc = -T / 2;
  for (const strip of strips) {
    const off0 = acc;
    const off1 = acc + strip.thicknessMm;
    offsets.push({ off0, off1, mt: strip.materialType });
    acc = off1;
  }
  if (offsets.length >= 3) {
    const mid = offsets.slice(1, offsets.length - 1);
    const start = mid[0]!.off0;
    const end = mid[mid.length - 1]!.off1;
    const dominant = [...mid].sort((a, b) => (b.off1 - b.off0) - (a.off1 - a.off0))[0]!;
    return { offStartMm: start, offEndMm: end, materialType: dominant.mt };
  }
  if (offsets.length > 0) {
    const dominant = [...offsets].sort((a, b) => (b.off1 - b.off0) - (a.off1 - a.off0))[0]!;
    return { offStartMm: dominant.off0, offEndMm: dominant.off1, materialType: dominant.mt };
  }
  return null;
}
