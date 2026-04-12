import type { ProfileMaterialType } from "@/core/domain/profile";

/** Заливка плана (Pixi fill), приглушённые тона под тёмный UI. */
const FALLBACK = 0x6a7585;

/**
 * Цвета 2D-плана по типу материала.
 * EPS / XPS / утеплитель — очень светлые «фоновые» оттенки (CAD-стиль: не перебивают OSB и контуры).
 */
const FILL: Readonly<Record<ProfileMaterialType, number>> = {
  osb: 0xa88a5c,
  eps: 0xe8ecf0,
  xps: 0xe3e9ee,
  wood: 0x8b7355,
  steel: 0x8a9098,
  gypsum: 0xc5c8ce,
  concrete: 0x6e757d,
  membrane: 0x5a626c,
  insulation: 0xedf0f3,
  custom: FALLBACK,
};

export function fillColor2dForMaterialType(mt: ProfileMaterialType): number {
  return FILL[mt] ?? FALLBACK;
}

/**
 * Непрозрачность заливки полосы стены в плане: утеплитель ослабляем дополнительно к светлому цвету,
 * чтобы слой оставался заметным, но второстепенным относительно OSB/каркаса.
 */
export function plan2dLayerFillAlpha(mt: ProfileMaterialType, baseAlpha: number): number {
  if (mt === "eps" || mt === "xps" || mt === "insulation") {
    return baseAlpha * 0.52;
  }
  return baseAlpha;
}
