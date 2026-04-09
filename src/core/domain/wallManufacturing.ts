import type { Profile } from "./profile";

/**
 * Настройки производственного расчёта для профиля категории «стена» (SIP и т.п.).
 * Глубина досок (joint/plate depth) по умолчанию берётся из ядра (EPS), а не из полной толщины стены.
 */
export interface WallManufacturingSettings {
  readonly panelNominalWidthMm: number;
  /** Номинальная высота листа SIP (мм); если задана, высота панели в расчёте не превышает min(между обвязками, это значение). */
  readonly panelNominalHeightMm?: number;
  readonly minPanelWidthMm: number;
  readonly jointBoardThicknessMm: number;
  readonly jointBoardDepthMm: number;
  readonly plateBoardThicknessMm: number;
  readonly plateBoardDepthMm: number;
  readonly maxBoardLengthMm: number;
  readonly includeEndBoards: boolean;
  /** Явная глубина несущего ядра (мм); иначе выводится из слоёв профиля. */
  readonly coreDepthMm?: number;
}

export const DEFAULT_WALL_MANUFACTURING: WallManufacturingSettings = {
  panelNominalWidthMm: 1250,
  panelNominalHeightMm: 2500,
  minPanelWidthMm: 250,
  jointBoardThicknessMm: 45,
  jointBoardDepthMm: 145,
  plateBoardThicknessMm: 45,
  plateBoardDepthMm: 145,
  maxBoardLengthMm: 6000,
  includeEndBoards: true,
};

/** Оценка толщины утеплителя/ядра по слоям (EPS/XPS между оболочками или максимальный такой слой). */
export function inferCoreDepthMmFromProfile(profile: Profile): number | null {
  if (profile.compositionMode !== "layered" || profile.layers.length === 0) {
    return null;
  }
  const layers = [...profile.layers].sort((a, b) => a.orderIndex - b.orderIndex);
  const isCore = (t: string) => t === "eps" || t === "xps" || t === "insulation";
  let best = 0;
  for (const L of layers) {
    if (isCore(L.materialType) && L.thicknessMm > best) {
      best = L.thicknessMm;
    }
  }
  return best > 0 ? best : null;
}

export type EffectiveWallManufacturingSettings = WallManufacturingSettings;

export function resolveEffectiveWallManufacturing(profile: Profile): EffectiveWallManufacturingSettings {
  const base = profile.wallManufacturing ?? DEFAULT_WALL_MANUFACTURING;
  const core =
    base.coreDepthMm ??
    inferCoreDepthMmFromProfile(profile) ??
    (profile.defaultThicknessMm != null && profile.defaultThicknessMm > 0
      ? profile.defaultThicknessMm
      : DEFAULT_WALL_MANUFACTURING.jointBoardDepthMm);

  return {
    ...DEFAULT_WALL_MANUFACTURING,
    ...base,
    jointBoardDepthMm: base.jointBoardDepthMm ?? core,
    plateBoardDepthMm: base.plateBoardDepthMm ?? core,
  };
}
