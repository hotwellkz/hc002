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

/**
 * Производственный раскрой линейной доски:
 * - шаг стандартной заготовки (stockLengthMm), обычно 6000 мм;
 * - если последний остаток меньше minSegmentMm, его переносим в предпоследний кусок
 *   (чтобы не получать "огрызок" < minSegmentMm).
 */
export function splitLengthMm(totalMm: number, stockLengthMm: number, minSegmentMm = 100): readonly number[] {
  if (totalMm <= 0 || !Number.isFinite(totalMm)) {
    return [];
  }
  if (stockLengthMm <= 0 || !Number.isFinite(stockLengthMm)) {
    return [Math.round(totalMm)];
  }
  const total = Math.round(totalMm);
  if (total <= stockLengthMm) {
    return [total];
  }

  const fullCount = Math.floor(total / stockLengthMm);
  const rem = total - fullCount * stockLengthMm;
  const out: number[] = Array.from({ length: fullCount }, () => stockLengthMm);
  if (rem === 0) {
    return out;
  }

  if (rem >= minSegmentMm) {
    out.push(rem);
    return out;
  }

  if (out.length === 0) {
    return [total];
  }

  const deficit = minSegmentMm - rem;
  const lastIdx = out.length - 1;
  out[lastIdx] = Math.max(1, out[lastIdx]! - deficit);
  out.push(minSegmentMm);
  return out;
}

/**
 * Сплошной участок стены (без примыкания к проёму): каждая панель Wmin…Wmax, не больше номинала W.
 * При остатке &lt; Wmin после набора целых W: одна целая панель «возвращается» в перераспределение:
 * (W + rem) = один доборный кусок (≤ W) + один минимальный Wmin у торца, без симметричного «пополам».
 */
export function computeSipPanelWidthsSolidMm(
  lengthMm: number,
  panelNominalWidthMm: number,
  minPanelWidthMm: number,
): number[] {
  const L = Math.round(lengthMm);
  const W = Math.round(panelNominalWidthMm);
  const Wmin = Math.round(minPanelWidthMm);
  if (Wmin > W || Wmin <= 0 || W <= 0) {
    throw new SipWallLayoutError("Некорректные параметры панелей.");
  }
  if (L < Wmin) {
    throw new SipWallLayoutError(
      `Длина под панели слишком мала (${L} мм, минимум панели ${Wmin} мм).`,
    );
  }
  if (L <= W) {
    return [L];
  }
  const widths: number[] = [];
  let remaining = L;
  while (remaining > W) {
    widths.push(W);
    remaining -= W;
  }
  if (remaining === 0) {
    return widths;
  }
  if (remaining >= Wmin) {
    widths.push(remaining);
    return widths;
  }
  const lastFull = widths.pop();
  if (lastFull == null) {
    throw new SipWallLayoutError("Внутренняя ошибка раскладки SIP (нет целой панели для перераспределения).");
  }
  const merged = lastFull + remaining;
  const widePiece = merged - Wmin;
  const narrowPiece = Wmin;
  if (widePiece > W || widePiece < Wmin) {
    throw new SipWallLayoutError(
      `Не удалось рационально разложить ${L} мм при номинале ${W} мм и минимуме ${Wmin} мм.`,
    );
  }
  /** Вдоль стены: сначала более широкий добор, у края — минимальный кусок. */
  widths.push(widePiece, narrowPiece);
  return widths;
}

/**
 * Участок у проёма: панели не шире W; последний кусок может быть &lt; Wmin (узкая полоса у откоса).
 */
export function computeSipPanelWidthsOpeningAdjacentMm(
  lengthMm: number,
  panelNominalWidthMm: number,
): number[] {
  const L = Math.round(lengthMm);
  const W = Math.round(panelNominalWidthMm);
  if (W <= 0) {
    throw new SipWallLayoutError("Некорректный номинал панели.");
  }
  if (L <= W) {
    return [L];
  }
  const out: number[] = [];
  let remaining = L;
  while (remaining > W) {
    out.push(W);
    remaining -= W;
  }
  if (remaining > 0) {
    out.push(remaining);
  }
  return out;
}

/**
 * Единая точка входа для раскладки SIP по длине сплошного участка (как на глухой стене).
 */
export function calculateSipPanelLayoutOnWall(
  lengthMm: number,
  panelNominalWidthMm: number,
  minPanelWidthMm: number,
): readonly number[] {
  return computeSipPanelWidthsSolidMm(lengthMm, panelNominalWidthMm, minPanelWidthMm);
}

const EPS = 1e-3;
const OPENING_NODE_SHIFT_MM = 45;

function getOpeningMinEdgeRestMm(wall: Wall, opening: Opening, m: EffectiveWallManufacturingSettings): number {
  if (opening.kind === "window" || opening.kind === "door") {
    return Math.max(0, wall.thicknessMm);
  }
  return m.minPanelWidthMm;
}

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
  /** SIP/OSB по длине стены — от фактического начала до конца (0…L); торцевые доски не сдвигают раскладку панелей. */
  const interiorLo = 0;
  const interiorHi = L;
  if (interiorHi - interiorLo < EPS) {
    throw new SipWallLayoutError("Нет длины под SIP-панели.");
  }

  const openingsOnWall = openings
    .filter(
      (o): o is Opening & { wallId: string; offsetFromStartMm: number } =>
        o.wallId === wall.id && isOpeningPlacedOnWall(o),
    )
    .sort((a, b) => a.offsetFromStartMm - b.offsetFromStartMm);

  const openingBlocks = openingsOnWall.map((o) => {
    const minRest = getOpeningMinEdgeRestMm(wall, o, m);
    const maxLeft = Math.max(minRest, L - o.widthMm - minRest);
    const lo = Math.max(minRest, Math.min(maxLeft, o.offsetFromStartMm));
    const hi = Math.min(L - minRest, lo + o.widthMm);
    return { lo, hi, kind: o.kind };
  }).filter((b) => b.hi - b.lo > EPS);

  const segments = subtractIntervalsFromRange(interiorLo, interiorHi, openingBlocks);

  const segmentTouchesFlexibleOpening = (a: number, b: number): boolean => {
    const leftFlexible = openingBlocks.some(
      (ob) => Math.abs(ob.hi - a) <= 1e-6 && (ob.kind === "door" || ob.kind === "window"),
    );
    const rightFlexible = openingBlocks.some(
      (ob) => Math.abs(ob.lo - b) <= 1e-6 && (ob.kind === "door" || ob.kind === "window"),
    );
    return leftFlexible || rightFlexible;
  };

  for (const [a, b] of segments) {
    if (!segmentTouchesFlexibleOpening(a, b) && b - a < m.minPanelWidthMm - 1e-6) {
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
  const nominalH = m.panelNominalHeightMm;
  const sipPanelHeightMm =
    nominalH != null && nominalH > 0
      ? Math.min(verticalBetweenPlatesMm, Math.round(nominalH))
      : verticalBetweenPlatesMm;

  const calculationId = newEntityId();
  const generatedAt = new Date().toISOString();
  const Tj = m.jointBoardThicknessMm;

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
    const openingAdjacentSegment = segmentTouchesFlexibleOpening(segLo, segHi);
    const widths =
      openingAdjacentSegment && segLen < m.minPanelWidthMm
        ? [Math.round(segLen)]
        : openingAdjacentSegment
          ? computeSipPanelWidthsOpeningAdjacentMm(segLen, m.panelNominalWidthMm)
          : computeSipPanelWidthsSolidMm(segLen, m.panelNominalWidthMm, m.minPanelWidthMm);
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
        heightMm: sipPanelHeightMm,
        thicknessMm: sipThicknessMm,
      });
      p = s1;
      if (i < n - 1) {
        /** Как раньше: [seam, seam+Tj] вдоль стены — `pieceAlongIntervalMm` центрирует доску на линии стыка. */
        const seam = s1;
        const j0 = seam;
        const j1 = seam + Tj;
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
      const middleShiftLeft = -OPENING_NODE_SHIFT_MM;
      const middleShiftRight = OPENING_NODE_SHIFT_MM;
      const spanStart = o0 + middleShiftLeft;
      const spanEnd = o1 + middleShiftRight;
      const headerLen = Math.max(0, Math.round(spanEnd - spanStart));
      const metaBase = { openingId: o.id, kind: o.kind };

      const isDoor = o.kind === "door";
      const sill = o.kind === "window" ? Math.max(0, o.sillHeightMm ?? 0) : 0;
      const splitLower = o.kind === "window" ? Math.max(0, sill - OPENING_NODE_SHIFT_MM) : 0;
      const openTop = o.kind === "window" ? sill + o.heightMm : o.heightMm;
      const horT = m.plateBoardThicknessMm;
      const topGap = isDoor ? 0 : OPENING_NODE_SHIFT_MM;
      const lowerSegLen = isDoor ? 0 : Math.max(0, Math.min(verticalBetweenPlatesMm, splitLower - horT));
      const middleSegLen = isDoor
        ? Math.max(0, Math.min(verticalBetweenPlatesMm, openTop))
        : Math.max(0, Math.min(verticalBetweenPlatesMm - lowerSegLen, openTop - splitLower - horT));
      const upperSegLen = isDoor
        ? Math.max(0, verticalBetweenPlatesMm - openTop - horT)
        : Math.max(0, verticalBetweenPlatesMm - lowerSegLen - middleSegLen - horT - topGap);

      const pushStudSegment = (
        role: "opening_left_stud" | "opening_right_stud",
        startOffsetMm: number,
        endOffsetMm: number,
        segment: "top" | "middle" | "bottom",
        lengthMm: number,
      ) => {
        if (lengthMm < EPS) {
          return;
        }
        const middleShift =
          segment === "middle"
            ? role === "opening_left_stud"
              ? -OPENING_NODE_SHIFT_MM
              : OPENING_NODE_SHIFT_MM
            : 0;
        verticalDrafts.push({
          id: newEntityId(),
          wallId: wall.id,
          calculationId,
          role,
          sectionThicknessMm: m.jointBoardThicknessMm,
          sectionDepthMm: m.jointBoardDepthMm,
          startOffsetMm: startOffsetMm + middleShift,
          endOffsetMm: endOffsetMm + middleShift,
          lengthMm: Math.round(lengthMm),
          orientation: "across_wall",
          metadata: { ...metaBase, studSegment: segment, middleShiftMm: middleShift },
        });
      };

      const leftA = o0;
      const leftB = o0 + Tj;
      const rightA = o1 - Tj;
      const rightB = o1;
      pushStudSegment("opening_left_stud", leftA - Tj / 2, leftA + Tj / 2, "top", upperSegLen);
      pushStudSegment("opening_left_stud", leftA, leftB, "middle", middleSegLen);
      pushStudSegment("opening_left_stud", leftA - Tj / 2, leftA + Tj / 2, "bottom", lowerSegLen);
      pushStudSegment("opening_right_stud", rightB - Tj / 2, rightB + Tj / 2, "top", upperSegLen);
      pushStudSegment("opening_right_stud", rightA, rightB, "middle", middleSegLen);
      pushStudSegment("opening_right_stud", rightB - Tj / 2, rightB + Tj / 2, "bottom", lowerSegLen);
      verticalDrafts.push({
        id: newEntityId(),
        wallId: wall.id,
        calculationId,
        role: "opening_header",
        sectionThicknessMm: m.plateBoardThicknessMm,
        sectionDepthMm: m.plateBoardDepthMm,
        startOffsetMm: spanStart,
        endOffsetMm: spanEnd,
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
          startOffsetMm: spanStart,
          endOffsetMm: spanEnd,
          lengthMm: headerLen,
          orientation: "along_wall",
          metadata: { ...metaBase, note: "Подоконная зона (упрощённо)", splitLowerMm: splitLower, sillLevelMm: sill },
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
    platePos = b;
  }
  /** Для дверного прохода нижнюю обвязку режем: в самом проёме порога быть не должно. */
  const doorBlocks = openingsOnWall
    .filter((o) => o.kind === "door")
    .map((o) => ({ lo: Math.max(0, o.offsetFromStartMm), hi: Math.min(L, o.offsetFromStartMm + o.widthMm) }))
    .filter((b) => b.hi - b.lo > EPS);
  const lowerRanges = subtractIntervalsFromRange(0, L, doorBlocks);
  for (let i = 0; i < lowerRanges.length; i++) {
    const [a, b] = lowerRanges[i]!;
    const len = Math.round(Math.max(0, b - a));
    if (len < 1) {
      continue;
    }
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
      metadata: { segmentIndex: i, splitByDoor: true },
    });
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
