import type { ProfileMaterialType } from "./profile";
import { computeProfileTotalThicknessMm, getProfileById } from "./profileOps";
import type { Project } from "./project";
import type { Wall } from "./wall";
import {
  buildPieceMark,
  buildSipPanelPieceMark,
  emptyLumberRoleCounters,
  LEGACY_LUMBER_ROLE_MAP,
  normalizeLumberRole,
  type LumberPiece,
  type LumberRole,
  type SipPanelRegion,
  type WallCalculationResult,
} from "./wallCalculation";

/** Черновик детали до нумерации (sipWallLayout → numberAndSortLumberPieces). */
export type LumberPieceDraftInput = {
  readonly id: string;
  readonly wallId: string;
  readonly calculationId: string;
  readonly role: LumberRole | string;
  readonly sectionThicknessMm: number;
  readonly sectionDepthMm: number;
  readonly startOffsetMm: number;
  readonly endOffsetMm: number;
  readonly lengthMm: number;
  readonly orientation: LumberPiece["orientation"];
  readonly wallMark?: string;
  readonly materialType?: ProfileMaterialType;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

type IncomingPiece = {
  readonly id: string;
  readonly wallId: string;
  readonly calculationId: string;
  readonly role: string;
  readonly sectionThicknessMm: number;
  readonly sectionDepthMm: number;
  readonly startOffsetMm: number;
  readonly endOffsetMm: number;
  readonly lengthMm: number;
  readonly orientation: LumberPiece["orientation"];
  readonly wallMark?: string;
  readonly sequenceNumber?: number;
  readonly pieceMark?: string;
  readonly materialType?: ProfileMaterialType;
  readonly sortKey?: number;
  readonly displayOrder?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

function wallMarkForWall(wall: Wall | undefined): string {
  const ml = wall?.markLabel?.trim();
  if (ml) {
    return ml;
  }
  if (wall?.id) {
    return `W-${wall.id.slice(0, 8)}`;
  }
  return "WALL";
}

function isLegacyRole(role: string): boolean {
  return role in LEGACY_LUMBER_ROLE_MAP;
}

/** Порядок отрисовки / сортировки: вертикали и узлы → горизонтали проёмов → обвязка. */
function roleSortPriority(role: LumberRole): number {
  const r = normalizeLumberRole(role);
  switch (r) {
    case "edge_board":
    case "corner_joint_board":
      return 0;
    case "tee_joint_board":
    case "joint_board":
    case "framing_member_generic":
      return 1;
    case "opening_left_stud":
    case "opening_right_stud":
      return 2;
    case "opening_header":
    case "opening_sill":
      return 3;
    case "upper_plate":
      return 4;
    case "lower_plate":
      return 5;
    default:
      return 1;
  }
}

function comparePieces(a: IncomingPiece, b: IncomingPiece): number {
  const ra = normalizeLumberRole(a.role);
  const rb = normalizeLumberRole(b.role);
  const pa = roleSortPriority(ra);
  const pb = roleSortPriority(rb);
  if (pa !== pb) {
    return pa - pb;
  }
  if (a.startOffsetMm !== b.startOffsetMm) {
    return a.startOffsetMm - b.startOffsetMm;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Стабильная нумерация и sortKey для черновиков деталей (новый расчёт).
 */
export function numberAndSortLumberPieces(wall: Wall | undefined, incoming: readonly LumberPieceDraftInput[]): LumberPiece[] {
  const ordered = [...incoming].sort((a, b) => comparePieces(a as IncomingPiece, b as IncomingPiece));
  const seq = emptyLumberRoleCounters();
  return ordered.map((raw, i) => {
    const role = normalizeLumberRole(raw.role);
    seq[role] += 1;
    const sequenceNumber = seq[role];
    const wallMark = raw.wallMark?.trim() || wallMarkForWall(wall);
    const pieceMark = buildPieceMark(wallMark, role, sequenceNumber);
    return {
      id: raw.id,
      wallId: raw.wallId,
      wallMark,
      calculationId: raw.calculationId,
      role,
      sequenceNumber,
      pieceMark,
      sectionThicknessMm: raw.sectionThicknessMm,
      sectionDepthMm: raw.sectionDepthMm,
      startOffsetMm: raw.startOffsetMm,
      endOffsetMm: raw.endOffsetMm,
      lengthMm: raw.lengthMm,
      orientation: raw.orientation,
      materialType: raw.materialType ?? "wood",
      sortKey: i,
      displayOrder: i,
      metadata: raw.metadata,
    };
  });
}

function pieceIsCompleteV2(raw: IncomingPiece): boolean {
  return (
    !isLegacyRole(raw.role) &&
    raw.pieceMark != null &&
    String(raw.pieceMark).trim() !== "" &&
    raw.wallMark != null &&
    String(raw.wallMark).trim() !== "" &&
    raw.sequenceNumber != null &&
    raw.sortKey != null
  );
}

export function normalizeWallCalculationsInProject(project: Project): Project {
  const wallById = new Map(project.walls.map((w) => [w.id, w]));
  const nextCalcs = project.wallCalculations.map((calc): WallCalculationResult => {
    const wall = wallById.get(calc.wallId);
    const incoming = calc.lumberPieces as unknown as IncomingPiece[];
    const allV2 = incoming.length > 0 && incoming.every(pieceIsCompleteV2);
    const ordered = allV2 ? incoming : [...incoming].sort((a, b) => comparePieces(a, b));

    let lumberPieces: LumberPiece[];
    if (allV2) {
      lumberPieces = ordered.map((raw) => {
        const role = normalizeLumberRole(raw.role);
        return {
          id: raw.id,
          wallId: raw.wallId,
          wallMark: String(raw.wallMark).trim(),
          calculationId: raw.calculationId,
          role,
          sequenceNumber: raw.sequenceNumber!,
          pieceMark: String(raw.pieceMark).trim(),
          sectionThicknessMm: raw.sectionThicknessMm,
          sectionDepthMm: raw.sectionDepthMm,
          startOffsetMm: raw.startOffsetMm,
          endOffsetMm: raw.endOffsetMm,
          lengthMm: raw.lengthMm,
          orientation: raw.orientation,
          materialType: raw.materialType ?? "wood",
          sortKey: raw.sortKey!,
          displayOrder: raw.displayOrder ?? raw.sortKey!,
          metadata: raw.metadata,
        };
      });
    } else {
      lumberPieces = numberAndSortLumberPieces(wall, incoming);
    }

    const plateT = calc.settingsSnapshot.plateBoardThicknessMm ?? 45;
    const wallSipThicknessMm = (() => {
      if (wall == null) {
        return 0;
      }
      if (wall.thicknessMm > 0) {
        return Math.round(wall.thicknessMm);
      }
      const prof = wall.profileId != null ? getProfileById(project, wall.profileId) : undefined;
      if (prof == null) {
        return 0;
      }
      const t = computeProfileTotalThicknessMm(prof);
      return t > 0 ? Math.round(t) : 0;
    })();
    const sipRegions: SipPanelRegion[] = calc.sipRegions.map((r) => {
      const wm = wall?.markLabel?.trim() || wall?.id.slice(0, 8) || "WALL";
      const pm = (r as { pieceMark?: string }).pieceMark?.trim();
      const hm = (r as { heightMm?: number }).heightMm;
      const tm = (r as { thicknessMm?: number }).thicknessMm;
      const heightFallback =
        wall != null ? Math.max(0, Math.round(wall.heightMm - plateT * 2)) : 0;
      const thickLegacyFallback = Math.round(
        calc.settingsSnapshot.coreDepthMm ?? calc.settingsSnapshot.jointBoardDepthMm ?? 0,
      );
      /** В UI/спецификации толщина панели = полная толщина стены, не слой EPS. */
      const thicknessMm =
        wallSipThicknessMm > 0
          ? wallSipThicknessMm
          : tm != null && Number.isFinite(tm) && tm > 0
            ? Math.round(tm)
            : thickLegacyFallback;
      return {
        ...r,
        pieceMark: pm && pm.length > 0 ? pm : buildSipPanelPieceMark(wm, r.index),
        heightMm: hm != null && Number.isFinite(hm) ? hm : heightFallback,
        thicknessMm,
      };
    });

    return {
      ...calc,
      version: Math.max(calc.version, 3),
      lumberPieces,
      sipRegions,
    };
  });

  return { ...project, wallCalculations: nextCalcs };
}
