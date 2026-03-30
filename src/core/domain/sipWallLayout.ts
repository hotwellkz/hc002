import { newEntityId } from "./ids";
import { isOpeningPlacedOnWall, type Opening } from "./opening";
import type { Profile } from "./profile";
import type { Wall } from "./wall";
import {
  buildSipPanelPieceMark,
  DEFAULT_WALL_CALC_STAGE3_OPTIONS,
  normalizeLumberRole,
  WALL_CALCULATION_VERSION,
  type SipPanelRegion,
  type WallCalcSettingsSnapshot,
  type WallCalculationBuildContext,
  type WallCalculationResult,
} from "./wallCalculation";
import { distanceAlongWallFromStartMm, wallLengthMm } from "./wallCalculationGeometry";
import { subtractIntervalsFromRange } from "./wallCalculationIntervals";
import { numberAndSortLumberPieces, type LumberPieceDraftInput } from "./wallCalculationNormalize";
import {
  inferCoreDepthMmFromProfile,
  resolveEffectiveWallManufacturing,
  type EffectiveWallManufacturingSettings,
} from "./wallManufacturing";
import type { WallEndSide, WallJoint } from "./wallJoint";

export class SipWallLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SipWallLayoutError";
  }
}

/** Разбивает длину (мм) на участки не длиннее maxPieceMm, сбалансированно. */
export function splitLengthMm(totalMm: number, maxPieceMm: number): readonly number[] {
  if (totalMm <= 0 || !Number.isFinite(totalMm)) {
    return [];
  }
  if (maxPieceMm <= 0 || !Number.isFinite(maxPieceMm)) {
    return [Math.round(totalMm)];
  }
  const n = Math.ceil(totalMm / maxPieceMm);
  const base = Math.floor(totalMm / n);
  let rem = Math.round(totalMm - base * n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(base + (rem > 0 ? 1 : 0));
    if (rem > 0) {
      rem -= 1;
    }
  }
  return out;
}

export function computePanelWidthsMm(
  L_interior: number,
  Wn: number,
  Wmin: number,
  Tj: number,
): readonly number[] {
  if (L_interior < Wmin - 1e-6) {
    throw new SipWallLayoutError(
      `Длина под панели слишком мала (${Math.round(L_interior)} мм, минимум панели ${Wmin} мм).`,
    );
  }
  if (Wmin > Wn || Wmin <= 0 || Wn <= 0 || Tj < 0) {
    throw new SipWallLayoutError("Некорректные параметры панелей или стыка.");
  }

  let n = 1;
  while (n <= 10_000) {
    const minL = n * Wmin + (n - 1) * Tj;
    const maxL = n * Wn + (n - 1) * Tj;
    if (L_interior + 1e-6 >= minL && L_interior <= maxL + 1e-6) {
      const S = L_interior - (n - 1) * Tj;
      return distributePanelWidths(S, n, Wmin, Wn);
    }
    if (L_interior + 1e-6 < minL) {
      break;
    }
    n++;
  }

  throw new SipWallLayoutError("Не удалось уложить SIP-панели с заданными ограничениями.");
}

function distributePanelWidths(S: number, n: number, Wmin: number, Wn: number): number[] {
  const w = Array.from({ length: n }, () => Wmin);
  let rem = Math.round(S - n * Wmin);
  for (let i = 0; i < n && rem > 0; i++) {
    const cap = Math.round(Wn - w[i]!);
    const add = Math.min(rem, cap);
    w[i]! += add;
    rem -= add;
  }
  if (rem > 0) {
    throw new SipWallLayoutError("Не удалось распределить ширины панелей.");
  }
  const sum = w.reduce((a, b) => a + b, 0);
  const target = Math.round(S);
  if (Math.abs(sum - target) > 1) {
    w[n - 1]! += target - sum;
  }
  if (w[n - 1]! < Wmin - 1e-6) {
    throw new SipWallLayoutError("Последняя панель получилась уже минимума.");
  }
  return w;
}

const EPS = 1e-3;

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - EPS && a1 > b0 + EPS;
}

function endBoardRole(
  wallId: string,
  end: WallEndSide,
  joints: readonly WallJoint[],
  includeConn: boolean,
): "edge_board" | "corner_joint_board" | "tee_joint_board" {
  if (!includeConn) {
    return "edge_board";
  }
  for (const j of joints) {
    if (j.kind === "T_ABUTMENT" && j.wallAId === wallId && j.wallAEnd === end) {
      return "tee_joint_board";
    }
  }
  for (const j of joints) {
    if ((j.kind === "CORNER_BUTT" || j.kind === "CORNER_MITER") && j.wallAId === wallId && j.wallAEnd === end) {
      return "corner_joint_board";
    }
    if ((j.kind === "CORNER_BUTT" || j.kind === "CORNER_MITER") && j.wallBId === wallId && j.wallBEnd === end) {
      return "corner_joint_board";
    }
  }
  return "edge_board";
}

function teeOffsetsOnMainWall(wallId: string, wall: Wall, joints: readonly WallJoint[]): number[] {
  const raw: number[] = [];
  for (const j of joints) {
    if (j.kind !== "T_ABUTMENT" || j.wallBId !== wallId || !j.teePointOnMainMm) {
      continue;
    }
    raw.push(distanceAlongWallFromStartMm(wall, j.teePointOnMainMm));
  }
  raw.sort((a, b) => a - b);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const s of raw) {
    const k = Math.round(s);
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(s);
  }
  return out;
}

function filterJointsOverlappingTee(
  drafts: LumberPieceDraftInput[],
  teePositions: readonly number[],
  Tj: number,
): LumberPieceDraftInput[] {
  if (teePositions.length === 0) {
    return drafts;
  }
  return drafts.filter((d) => {
    if (normalizeLumberRole(String(d.role)) !== "joint_board") {
      return true;
    }
    for (const s of teePositions) {
      const lo = s - Tj / 2;
      const hi = s + Tj / 2;
      if (intervalsOverlap(d.startOffsetMm, d.endOffsetMm, lo, hi)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Полный расчёт стены (этап 3): проёмы, узлы T/угол, SIP по сегментам между проёмами.
 */
export function buildWallCalculationForWall(
  wall: Wall,
  profile: Profile,
  ctx?: WallCalculationBuildContext,
): WallCalculationResult {
  if (profile.category !== "wall") {
    throw new SipWallLayoutError("Профиль не является стеновым.");
  }
  const m = resolveEffectiveWallManufacturing(profile);
  const wallMark = wall.markLabel?.trim() || wall.id.slice(0, 8);
  const sipThicknessMm = Math.round(
    m.coreDepthMm ?? inferCoreDepthMmFromProfile(profile) ?? profile.defaultThicknessMm ?? m.jointBoardDepthMm,
  );
  const L = wallLengthMm(wall);
  if (L < 1) {
    throw new SipWallLayoutError("Стена нулевой длины.");
  }

  const opt = { ...DEFAULT_WALL_CALC_STAGE3_OPTIONS, ...ctx?.options };
  const openings = ctx?.openings ?? [];
  const wallJoints = ctx?.wallJoints ?? [];
  const skipAutoOpeningFraming = ctx?.skipAutoOpeningFramingForOpeningIds ?? new Set<string>();

  const Te = m.includeEndBoards ? m.jointBoardThicknessMm : 0;
  const interiorLo = m.includeEndBoards ? Te : 0;
  const interiorHi = m.includeEndBoards ? L - Te : L;
  if (interiorHi - interiorLo < EPS) {
    throw new SipWallLayoutError("Нет длины под SIP-панели после торцевых досок.");
  }

  const openingsOnWall = openings
    .filter(
      (o): o is Opening & { wallId: string; offsetFromStartMm: number } =>
        o.wallId === wall.id && isOpeningPlacedOnWall(o),
    )
    .sort((a, b) => a.offsetFromStartMm - b.offsetFromStartMm);

  const openingBlocks = openingsOnWall.map((o) => {
    const lo = Math.max(0, o.offsetFromStartMm);
    const hi = Math.min(L, o.offsetFromStartMm + o.widthMm);
    return { lo, hi };
  }).filter((b) => b.hi - b.lo > EPS);

  const segments = subtractIntervalsFromRange(interiorLo, interiorHi, openingBlocks);

  for (const [a, b] of segments) {
    if (b - a < m.minPanelWidthMm - 1e-6) {
      throw new SipWallLayoutError(
        `Между проёмами осталось ${Math.round(b - a)} мм — меньше минимума панели ${m.minPanelWidthMm} мм.`,
      );
    }
  }

  if (segments.length === 0) {
    throw new SipWallLayoutError(
      "Нет свободного участка под SIP-панели (проёмы перекрывают всю стену или не остаётся минимальной длины).",
    );
  }

  /** Вертикальные доски между верхней и нижней обвязкой. */
  const verticalBetweenPlatesMm = Math.max(
    0,
    Math.round(wall.heightMm - m.plateBoardThicknessMm - m.plateBoardThicknessMm),
  );

  const calculationId = newEntityId();
  const generatedAt = new Date().toISOString();

  const snapshot: WallCalcSettingsSnapshot = {
    ...m,
    wallLengthMm: L,
    profileId: wall.profileId,
    stage3OpeningFraming: opt.includeOpeningFraming,
    stage3WallConnections: opt.includeWallConnectionElements,
  };

  const sipRegions: SipPanelRegion[] = [];
  const lumberDrafts: LumberPieceDraftInput[] = [];

  if (m.includeEndBoards) {
    const roleStart = endBoardRole(wall.id, "start", wallJoints, opt.includeWallConnectionElements);
    lumberDrafts.push({
      id: newEntityId(),
      wallId: wall.id,
      calculationId,
      role: roleStart,
      sectionThicknessMm: m.jointBoardThicknessMm,
      sectionDepthMm: m.jointBoardDepthMm,
      startOffsetMm: 0,
      endOffsetMm: Te,
      lengthMm: verticalBetweenPlatesMm,
      orientation: "across_wall",
      metadata: { note: roleStart === "edge_board" ? "Торцевая доска (старт)" : "Узел старта стены" },
    });
  }

  let sipIndex = 0;
  for (const [segLo, segHi] of segments) {
    const segLen = segHi - segLo;
    const widths = computePanelWidthsMm(segLen, m.panelNominalWidthMm, m.minPanelWidthMm, m.jointBoardThicknessMm);
    const n = widths.length;
    let p = segLo;
    for (let i = 0; i < n; i++) {
      const wi = widths[i]!;
      const s0 = p;
      const s1 = p + wi;
      const sipIdx = sipIndex++;
      sipRegions.push({
        id: newEntityId(),
        wallId: wall.id,
        calculationId,
        index: sipIdx,
        startOffsetMm: s0,
        endOffsetMm: s1,
        widthMm: wi,
        pieceMark: buildSipPanelPieceMark(wallMark, sipIdx),
        heightMm: verticalBetweenPlatesMm,
        thicknessMm: sipThicknessMm,
      });
      p = s1;
      if (i < n - 1) {
        const j0 = p;
        const j1 = p + m.jointBoardThicknessMm;
        lumberDrafts.push({
          id: newEntityId(),
          wallId: wall.id,
          calculationId,
          role: "joint_board",
          sectionThicknessMm: m.jointBoardThicknessMm,
          sectionDepthMm: m.jointBoardDepthMm,
          startOffsetMm: j0,
          endOffsetMm: j1,
          lengthMm: verticalBetweenPlatesMm,
          orientation: "across_wall",
        });
        p = j1;
      }
    }
  }

  if (m.includeEndBoards) {
    const roleEnd = endBoardRole(wall.id, "end", wallJoints, opt.includeWallConnectionElements);
    lumberDrafts.push({
      id: newEntityId(),
      wallId: wall.id,
      calculationId,
      role: roleEnd,
      sectionThicknessMm: m.jointBoardThicknessMm,
      sectionDepthMm: m.jointBoardDepthMm,
      startOffsetMm: L - Te,
      endOffsetMm: L,
      lengthMm: verticalBetweenPlatesMm,
      orientation: "across_wall",
      metadata: { note: roleEnd === "edge_board" ? "Торцевая доска (конец)" : "Узел конца стены" },
    });
  }

  const teeOnMain = opt.includeWallConnectionElements ? teeOffsetsOnMainWall(wall.id, wall, wallJoints) : [];
  const Tj = m.jointBoardThicknessMm;
  let verticalDrafts = filterJointsOverlappingTee(lumberDrafts, teeOnMain, Tj);

  for (const s of teeOnMain) {
    if (s < EPS || s > L - EPS) {
      continue;
    }
    verticalDrafts.push({
      id: newEntityId(),
      wallId: wall.id,
      calculationId,
      role: "tee_joint_board",
      sectionThicknessMm: m.jointBoardThicknessMm,
      sectionDepthMm: m.jointBoardDepthMm,
      startOffsetMm: s - Tj / 2,
      endOffsetMm: s + Tj / 2,
      lengthMm: verticalBetweenPlatesMm,
      orientation: "across_wall",
      metadata: { note: "Т-узел на основной стене" },
    });
  }

  if (opt.includeOpeningFraming) {
    for (const o of openingsOnWall) {
      if (skipAutoOpeningFraming.has(o.id)) {
        continue;
      }
      const o0 = o.offsetFromStartMm;
      const o1 = o.offsetFromStartMm + o.widthMm;
      if (o1 - o0 < 2 * Tj + EPS) {
        continue;
      }
      const midSpan = o1 - o0 - 2 * Tj;
      const headerLen = Math.max(0, Math.round(midSpan));
      const metaBase = { openingId: o.id, kind: o.kind };

      verticalDrafts.push({
        id: newEntityId(),
        wallId: wall.id,
        calculationId,
        role: "opening_left_stud",
        sectionThicknessMm: m.jointBoardThicknessMm,
        sectionDepthMm: m.jointBoardDepthMm,
        startOffsetMm: o0,
        endOffsetMm: o0 + Tj,
        lengthMm: verticalBetweenPlatesMm,
        orientation: "across_wall",
        metadata: metaBase,
      });
      verticalDrafts.push({
        id: newEntityId(),
        wallId: wall.id,
        calculationId,
        role: "opening_right_stud",
        sectionThicknessMm: m.jointBoardThicknessMm,
        sectionDepthMm: m.jointBoardDepthMm,
        startOffsetMm: o1 - Tj,
        endOffsetMm: o1,
        lengthMm: verticalBetweenPlatesMm,
        orientation: "across_wall",
        metadata: metaBase,
      });
      verticalDrafts.push({
        id: newEntityId(),
        wallId: wall.id,
        calculationId,
        role: "opening_header",
        sectionThicknessMm: m.plateBoardThicknessMm,
        sectionDepthMm: m.plateBoardDepthMm,
        startOffsetMm: o0 + Tj,
        endOffsetMm: o1 - Tj,
        lengthMm: headerLen,
        orientation: "along_wall",
        metadata: metaBase,
      });
      if (o.kind === "window" && headerLen > 0) {
        verticalDrafts.push({
          id: newEntityId(),
          wallId: wall.id,
          calculationId,
          role: "opening_sill",
          sectionThicknessMm: m.plateBoardThicknessMm,
          sectionDepthMm: m.plateBoardDepthMm,
          startOffsetMm: o0 + Tj,
          endOffsetMm: o1 - Tj,
          lengthMm: headerLen,
          orientation: "along_wall",
          metadata: { ...metaBase, note: "Подоконная зона (упрощённо)" },
        });
      }
    }
  }

  const plateChunks = splitLengthMm(L, m.maxBoardLengthMm);
  let platePos = 0;
  for (let i = 0; i < plateChunks.length; i++) {
    const len = plateChunks[i]!;
    const a = platePos;
    const b = platePos + len;
    verticalDrafts.push({
      id: newEntityId(),
      wallId: wall.id,
      calculationId,
      role: "upper_plate",
      sectionThicknessMm: m.plateBoardThicknessMm,
      sectionDepthMm: m.plateBoardDepthMm,
      startOffsetMm: a,
      endOffsetMm: b,
      lengthMm: len,
      orientation: "along_wall",
      metadata: { segmentIndex: i },
    });
    verticalDrafts.push({
      id: newEntityId(),
      wallId: wall.id,
      calculationId,
      role: "lower_plate",
      sectionThicknessMm: m.plateBoardThicknessMm,
      sectionDepthMm: m.plateBoardDepthMm,
      startOffsetMm: a,
      endOffsetMm: b,
      lengthMm: len,
      orientation: "along_wall",
      metadata: { segmentIndex: i },
    });
    platePos = b;
  }

  const lumberPieces = numberAndSortLumberPieces(wall, verticalDrafts);

  return {
    id: calculationId,
    wallId: wall.id,
    version: WALL_CALCULATION_VERSION,
    generatedAt,
    settingsSnapshot: snapshot,
    sipRegions,
    lumberPieces,
  };
}

export function previewManufacturingForProfile(profile: Profile): EffectiveWallManufacturingSettings {
  return resolveEffectiveWallManufacturing(profile);
}
