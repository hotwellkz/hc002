import { normalizeLayerDomain, type LayerDomain } from "./layerDomain";

export type LayerLevelMode = "absolute" | "relativeToBelow";

export interface Layer {
  readonly id: string;
  readonly name: string;
  /** Раздел проекта: план / перекрытие / фундамент / крыша (единый реестр слоёв). */
  readonly domain: LayerDomain;
  /**
   * Порядок в вертикальном стеке слоёв: меньше = ниже по зданию (ближе к нулю/низу стека).
   * Совпадает с сортировкой списка слоёв снизу вверх.
   */
  readonly orderIndex: number;
  /**
   * Базовый уровень (мм) в режиме «абсолютный»; для нижнего слоя в относительном режиме — запасное значение при отсутствии слоя ниже.
   */
  readonly elevationMm: number;
  readonly levelMode: LayerLevelMode;
  /** Смещение от верха предыдущего слоя в стеке (мм), только для relativeToBelow. */
  readonly offsetFromBelowMm: number;
  /**
   * Участвует в верхе слоя: итог = max(макс. геометрия, computedBase + manualHeightMm).
   * Нужен для пустого слоя или как минимальный/дополнительный запас по высоте.
   */
  readonly manualHeightMm: number;
  readonly isVisible: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Дополняет поля старых файлов проекта значениями по умолчанию. */
export function normalizeLayer(input: Layer): Layer {
  return {
    ...input,
    domain: normalizeLayerDomain((input as { domain?: unknown }).domain),
    levelMode: input.levelMode === "relativeToBelow" ? "relativeToBelow" : "absolute",
    offsetFromBelowMm: typeof input.offsetFromBelowMm === "number" && Number.isFinite(input.offsetFromBelowMm) ? input.offsetFromBelowMm : 0,
    manualHeightMm: typeof input.manualHeightMm === "number" && Number.isFinite(input.manualHeightMm) ? input.manualHeightMm : 0,
    elevationMm: typeof input.elevationMm === "number" && Number.isFinite(input.elevationMm) ? input.elevationMm : 0,
  };
}
