import type { Profile } from "./profile";

/**
 * Настройки производственного расчёта для профиля категории «стена» (SIP и т.п.).
 * Глубина досок (joint/plate depth) по умолчанию берётся из ядра (EPS), а не из полной толщины стены.
 */
export interface WallManufacturingSettings {
  /** Режим расчёта стенового профиля. */
  readonly calculationModel?: "sip" | "frame";
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
  /** Шаг стоек/профилей внутреннего каркаса (мм). */
  readonly studSpacingMm?: number;
  /** Материал каркаса для расчётных элементов. */
  readonly frameMaterial?: "wood" | "steel";
  /**
   * Явная ширина/глубина сечения профиля каркаса (мм), для режима frame/GKL.
   * Если не задана — берётся из слоя стали/дерева между обшивкой или дефолт 80 мм.
   */
  readonly frameMemberWidthMm?: number;
  /**
   * Металлическая перегородка (frame + steel): стойка — сечение в мм (ширина по нормали к стене × полка вдоль стены).
   * По умолчанию 75×50, если не задано и `frameMaterial === "steel"`.
   */
  readonly framePartitionStudWidthMm?: number;
  readonly framePartitionStudDepthAlongWallMm?: number;
  /**
   * Металлическая перегородка: направляющая / перемычка — сечение в мм (ширина × высота профиля в фасаде).
   * По умолчанию 75×40 для steel frame.
   */
  readonly framePartitionTrackWidthMm?: number;
  readonly framePartitionTrackDepthMm?: number;
  /**
   * Схема обрамления дверного проёма.
   * `frame_gkl_door` — каркас/ГКЛ: полноразмерные боковые стойки, перемычка с заходом в стойки; металл — криплы над перемычкой.
   */
  readonly doorOpeningFramingPreset?: DoorOpeningFramingPreset;
  /** Схема обрамления оконного проёма (расширяемая). */
  readonly windowOpeningFramingPreset?: WindowOpeningFramingPreset;
}

/** Пресет правил проёма для двери. */
export type DoorOpeningFramingPreset = "sip_standard" | "frame_gkl_door";

/** Пресет правил проёма для окна. */
export type WindowOpeningFramingPreset = "sip_standard" | "frame_gkl_window" | "frame_reinforced";

export const DEFAULT_WALL_MANUFACTURING: WallManufacturingSettings = {
  calculationModel: "sip",
  panelNominalWidthMm: 1250,
  panelNominalHeightMm: 2500,
  minPanelWidthMm: 250,
  jointBoardThicknessMm: 45,
  jointBoardDepthMm: 145,
  plateBoardThicknessMm: 45,
  plateBoardDepthMm: 145,
  maxBoardLengthMm: 6000,
  includeEndBoards: true,
  studSpacingMm: 600,
  frameMaterial: "wood",
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

const DEFAULT_FRAME_MEMBER_WIDTH_MM = 80;
/** Типовое сечение металлической ГКЛ-перегородки (мм). */
const DEFAULT_STEEL_PARTITION_STUD_WIDTH_MM = 75;
const DEFAULT_STEEL_PARTITION_STUD_DEPTH_ALONG_MM = 50;
const DEFAULT_STEEL_PARTITION_TRACK_WIDTH_MM = 75;
const DEFAULT_STEEL_PARTITION_TRACK_DEPTH_MM = 40;

/**
 * Толщина металлического/деревянного слоя каркаса между обшивкой (ГКЛ–сталь–ГКЛ и т.п.).
 * Иначе — максимальная толщина стального/деревянного слоя в профиле.
 */
export function inferFrameMemberWidthMmFromProfile(profile: Profile): number | null {
  if (profile.compositionMode !== "layered" || profile.layers.length < 2) {
    return null;
  }
  const sorted = [...profile.layers].sort((a, b) => a.orderIndex - b.orderIndex);
  const isStud = (t: string) => t === "steel" || t === "wood";
  const maxOf = (layers: typeof sorted) => {
    const xs = layers.filter((l) => isStud(l.materialType) && l.thicknessMm > 0).map((l) => l.thicknessMm);
    return xs.length === 0 ? null : Math.round(Math.max(...xs));
  };
  if (sorted.length >= 3 && sorted[0]!.materialType === "gypsum" && sorted[sorted.length - 1]!.materialType === "gypsum") {
    const mid = maxOf(sorted.slice(1, -1));
    if (mid != null) {
      return mid;
    }
  }
  return maxOf(sorted);
}

export function resolveWallCalculationModel(profile: Profile): "sip" | "frame" {
  const explicit = profile.wallManufacturing?.calculationModel;
  if (explicit === "sip" || explicit === "frame") {
    return explicit;
  }
  if (profile.compositionMode !== "layered" || profile.layers.length < 2) {
    return "sip";
  }
  const layers = profile.layers.slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const first = layers[0]?.materialType;
  const last = layers[layers.length - 1]?.materialType;
  const hasGypsum = layers.some((l) => l.materialType === "gypsum");
  const hasOsbShell = first === "osb" && last === "osb";
  if (hasGypsum) {
    return "frame";
  }
  if (hasOsbShell) {
    return "sip";
  }
  return "frame";
}

export function resolveEffectiveWallManufacturing(profile: Profile): EffectiveWallManufacturingSettings {
  const base = profile.wallManufacturing;
  const calculationModel = resolveWallCalculationModel(profile);
  const profileSheetW =
    profile.defaultWidthMm != null && profile.defaultWidthMm > 0 ? Math.round(profile.defaultWidthMm) : null;
  const profileSheetH =
    profile.defaultHeightMm != null && profile.defaultHeightMm > 0 ? Math.round(profile.defaultHeightMm) : null;
  const inferredCoreFromLayers = inferCoreDepthMmFromProfile(profile);
  const layeredInteriorCore =
    profile.compositionMode === "layered" && profile.layers.length >= 3
      ? Math.max(
          0,
          profile.layers
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .slice(1, profile.layers.length - 1)
            .reduce((s, l) => s + Math.max(0, l.thicknessMm), 0),
        )
      : 0;
  const core =
    base?.coreDepthMm ??
    (inferredCoreFromLayers != null && inferredCoreFromLayers > 0
      ? inferredCoreFromLayers
      : layeredInteriorCore > 0
        ? layeredInteriorCore
        : undefined) ??
    (profile.defaultThicknessMm != null && profile.defaultThicknessMm > 0
      ? profile.defaultThicknessMm
      : DEFAULT_WALL_MANUFACTURING.jointBoardDepthMm);

  /**
   * Каркас / ГКЛ (frame): модуль листа — `defaultWidthMm`; без него — явный `panelNominalWidthMm` в профиле
   * или запасной 1200 мм (не SIP-дефолт 1250).
   * SIP: сохранённый `panelNominalWidthMm` в профиле и профильные default* как раньше.
   */
  const panelNominalWidthMm =
    calculationModel === "frame" && profileSheetW != null
      ? profileSheetW
      : calculationModel === "frame"
        ? base?.panelNominalWidthMm != null && base.panelNominalWidthMm > 0
          ? Math.round(base.panelNominalWidthMm)
          : 1200
        : base?.panelNominalWidthMm ?? profileSheetW ?? DEFAULT_WALL_MANUFACTURING.panelNominalWidthMm;
  const panelNominalHeightMm =
    calculationModel === "frame" && profileSheetH != null
      ? profileSheetH
      : base?.panelNominalHeightMm ?? profileSheetH ?? DEFAULT_WALL_MANUFACTURING.panelNominalHeightMm;

  const inferredFrameMm =
    calculationModel === "frame"
      ? (base?.frameMemberWidthMm ??
        inferFrameMemberWidthMmFromProfile(profile) ??
        DEFAULT_FRAME_MEMBER_WIDTH_MM)
      : null;

  const frameMaterial = base?.frameMaterial ?? DEFAULT_WALL_MANUFACTURING.frameMaterial;
  const isSteelFramePartition = calculationModel === "frame" && frameMaterial === "steel";

  const studW = base?.framePartitionStudWidthMm ?? DEFAULT_STEEL_PARTITION_STUD_WIDTH_MM;
  const studAlong = base?.framePartitionStudDepthAlongWallMm ?? DEFAULT_STEEL_PARTITION_STUD_DEPTH_ALONG_MM;
  const trackW = base?.framePartitionTrackWidthMm ?? DEFAULT_STEEL_PARTITION_TRACK_WIDTH_MM;
  const trackD = base?.framePartitionTrackDepthMm ?? DEFAULT_STEEL_PARTITION_TRACK_DEPTH_MM;

  /**
   * Каркас frame/GKL: дерево — одно сечение как раньше; металл перегородки — стойка 75×50 и направляющая 75×40
   * (или явные `framePartition*` в профиле).
   */
  const jointBoardThicknessMm = isSteelFramePartition
    ? studAlong
    : calculationModel === "frame" && inferredFrameMm != null
      ? inferredFrameMm
      : base?.jointBoardThicknessMm ?? DEFAULT_WALL_MANUFACTURING.jointBoardThicknessMm;
  const jointBoardDepthMm = isSteelFramePartition
    ? studW
    : calculationModel === "frame" && inferredFrameMm != null
      ? inferredFrameMm
      : base?.jointBoardDepthMm ?? core;
  const plateBoardThicknessMm = isSteelFramePartition
    ? trackD
    : calculationModel === "frame" && inferredFrameMm != null
      ? inferredFrameMm
      : base?.plateBoardThicknessMm ?? DEFAULT_WALL_MANUFACTURING.plateBoardThicknessMm;
  const plateBoardDepthMm = isSteelFramePartition
    ? trackW
    : calculationModel === "frame" && inferredFrameMm != null
      ? inferredFrameMm
      : base?.plateBoardDepthMm ?? core;

  /**
   * Для каркаса/ГКЛ всегда схема «Каркас / ГКЛ», не SIP: иначе в профиле мог остаться
   * `sip_standard` и дверной проём строился бы с сегментами SIP-стоек (неверные длины/позиции).
   */
  const doorOpeningFramingPreset: DoorOpeningFramingPreset =
    calculationModel === "frame" ? "frame_gkl_door" : (base?.doorOpeningFramingPreset ?? "sip_standard");
  const windowOpeningFramingPreset: WindowOpeningFramingPreset =
    calculationModel === "frame"
      ? base?.windowOpeningFramingPreset === "sip_standard" || base?.windowOpeningFramingPreset == null
        ? "frame_gkl_window"
        : base.windowOpeningFramingPreset
      : (base?.windowOpeningFramingPreset ?? "sip_standard");

  return {
    ...DEFAULT_WALL_MANUFACTURING,
    ...base,
    frameMaterial,
    panelNominalWidthMm,
    panelNominalHeightMm,
    frameMemberWidthMm: calculationModel === "frame" ? (isSteelFramePartition ? studAlong : inferredFrameMm ?? undefined) : base?.frameMemberWidthMm,
    framePartitionStudWidthMm: isSteelFramePartition ? studW : base?.framePartitionStudWidthMm,
    framePartitionStudDepthAlongWallMm: isSteelFramePartition ? studAlong : base?.framePartitionStudDepthAlongWallMm,
    framePartitionTrackWidthMm: isSteelFramePartition ? trackW : base?.framePartitionTrackWidthMm,
    framePartitionTrackDepthMm: isSteelFramePartition ? trackD : base?.framePartitionTrackDepthMm,
    jointBoardThicknessMm,
    jointBoardDepthMm,
    plateBoardThicknessMm,
    plateBoardDepthMm,
    doorOpeningFramingPreset,
    windowOpeningFramingPreset,
  };
}

/** Пресеты обрамления проёмов из профиля (после `resolveEffectiveWallManufacturing`). */
export function resolveOpeningFramingPresets(profile: Profile): {
  readonly model: "sip" | "frame";
  readonly door: DoorOpeningFramingPreset;
  readonly window: WindowOpeningFramingPreset;
} {
  const m = resolveEffectiveWallManufacturing(profile);
  return {
    model: resolveWallCalculationModel(profile),
    door: m.doorOpeningFramingPreset ?? "sip_standard",
    window: m.windowOpeningFramingPreset ?? "sip_standard",
  };
}
