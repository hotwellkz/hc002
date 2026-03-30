import type { Opening } from "./opening";
import type { ProfileMaterialType } from "./profile";
import type { WallManufacturingSettings } from "./wallManufacturing";
import type { WallJoint } from "./wallJoint";

/** Версия схемы результата расчёта (этап 3: проёмы, узлы стен). */
export const WALL_CALCULATION_VERSION = 3 as const;

/** Снимок параметров на момент расчёта (аудит / будущие сравнения). */
export interface WallCalcSettingsSnapshot extends WallManufacturingSettings {
  readonly wallLengthMm: number;
  readonly profileId?: string;
  /** Этап 3: учтены ли обрамления проёмов и узлы стен. */
  readonly stage3OpeningFraming?: boolean;
  readonly stage3WallConnections?: boolean;
}

/** Производственная роль пиломатериала. */
export type LumberRole =
  | "upper_plate"
  | "lower_plate"
  | "joint_board"
  | "edge_board"
  | "opening_left_stud"
  | "opening_right_stud"
  | "opening_header"
  | "opening_sill"
  | "tee_joint_board"
  | "corner_joint_board"
  | "framing_member_generic";

export type LumberOrientation = "along_wall" | "across_wall";

export interface SipPanelRegion {
  readonly id: string;
  readonly wallId: string;
  readonly calculationId: string;
  readonly index: number;
  readonly startOffsetMm: number;
  readonly endOffsetMm: number;
  readonly widthMm: number;
  /** Марка панели, напр. W_1-SP-1 (для спецификации, не на основном 2D). */
  readonly pieceMark: string;
  /** Высота панели в плоскости стены (между обвязками), мм. */
  readonly heightMm: number;
  /** Толщина ядра / панели по нормали к стене, мм. */
  readonly thicknessMm: number;
}

export interface LumberPiece {
  readonly id: string;
  readonly wallId: string;
  /** Марка стены на момент расчёта (копия wall.markLabel или запасной ярлык). */
  readonly wallMark: string;
  readonly calculationId: string;
  readonly role: LumberRole;
  /** Порядковый номер детали внутри типа на этой стене в данном расчёте (TB-1 → 1). */
  readonly sequenceNumber: number;
  /** Человекочитаемая марка, напр. W_1-TB-2. */
  readonly pieceMark: string;
  readonly sectionThicknessMm: number;
  readonly sectionDepthMm: number;
  readonly startOffsetMm: number;
  readonly endOffsetMm: number;
  /**
   * Производственная длина детали, мм: для обвязки — длина вдоль стены; для вертикали — между плитами (высота минус обвязки);
   * для горизонталей проёма — длина вдоль стены (ширина пролёта между стойками).
   */
  readonly lengthMm: number;
  readonly orientation: LumberOrientation;
  readonly materialType: ProfileMaterialType;
  readonly sortKey: number;
  readonly displayOrder: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WallCalculationResult {
  readonly id: string;
  readonly wallId: string;
  readonly version: number;
  readonly generatedAt: string;
  readonly settingsSnapshot: WallCalcSettingsSnapshot;
  readonly sipRegions: readonly SipPanelRegion[];
  readonly lumberPieces: readonly LumberPiece[];
}

/** Легаси-роли этапа 1 → этап 2. */
export const LEGACY_LUMBER_ROLE_MAP: Readonly<Record<string, LumberRole>> = {
  plate_top: "upper_plate",
  plate_bottom: "lower_plate",
  sip_joint_vertical: "joint_board",
  end_board_vertical: "edge_board",
};

const KNOWN_ROLES = new Set<LumberRole>([
  "upper_plate",
  "lower_plate",
  "joint_board",
  "edge_board",
  "opening_left_stud",
  "opening_right_stud",
  "opening_header",
  "opening_sill",
  "tee_joint_board",
  "corner_joint_board",
  "framing_member_generic",
]);

export function normalizeLumberRole(role: string): LumberRole {
  if (KNOWN_ROLES.has(role as LumberRole)) {
    return role as LumberRole;
  }
  const mapped = LEGACY_LUMBER_ROLE_MAP[role];
  if (mapped) {
    return mapped;
  }
  return "framing_member_generic";
}

const ROLE_MARK_CODE: Readonly<Record<LumberRole, string>> = {
  upper_plate: "TB",
  lower_plate: "BB",
  joint_board: "JB",
  edge_board: "EB",
  opening_left_stud: "OSL",
  opening_right_stud: "OSR",
  opening_header: "OH",
  opening_sill: "OSI",
  tee_joint_board: "TJ",
  corner_joint_board: "CJ",
  framing_member_generic: "FM",
};

export function lumberRoleToMarkCode(role: LumberRole): string {
  return ROLE_MARK_CODE[normalizeLumberRole(role)];
}

export function buildPieceMark(wallMark: string, role: LumberRole, sequenceNumber: number): string {
  const code = ROLE_MARK_CODE[normalizeLumberRole(role)];
  const safeWall = wallMark.trim() || "WALL";
  return `${safeWall}-${code}-${sequenceNumber}`;
}

/** Марка SIP-панели по стене: W_x-SP-1, W_x-SP-2, … */
export function buildSipPanelPieceMark(wallMark: string, zeroBasedIndex: number): string {
  const safeWall = wallMark.trim() || "WALL";
  return `${safeWall}-SP-${zeroBasedIndex + 1}`;
}

/** Счётчики по ролям для нумерации (сброс на каждый расчёт). */
/** Опции этапа 3 (модалка расчёта). */
export interface WallCalculationStage3Options {
  readonly includeOpeningFraming: boolean;
  readonly includeWallConnectionElements: boolean;
}

export const DEFAULT_WALL_CALC_STAGE3_OPTIONS: WallCalculationStage3Options = {
  includeOpeningFraming: true,
  includeWallConnectionElements: true,
};

/** Контекст расчёта: проёмы и узлы стен из проекта. */
export interface WallCalculationBuildContext {
  readonly openings: readonly Opening[];
  readonly wallJoints: readonly WallJoint[];
  readonly options: WallCalculationStage3Options;
  /** Для этих openingId не генерировать авто-обрамление (есть openingFramingPieces в проекте). */
  readonly skipAutoOpeningFramingForOpeningIds?: ReadonlySet<string>;
}

export function emptyLumberRoleCounters(): Record<LumberRole, number> {
  return {
    upper_plate: 0,
    lower_plate: 0,
    joint_board: 0,
    edge_board: 0,
    opening_left_stud: 0,
    opening_right_stud: 0,
    opening_header: 0,
    opening_sill: 0,
    tee_joint_board: 0,
    corner_joint_board: 0,
    framing_member_generic: 0,
  };
}
