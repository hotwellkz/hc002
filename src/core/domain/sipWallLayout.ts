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
import { computeProfileTotalThicknessMm } from "./profileOps";
import {
  resolveEffectiveWallManufacturing,
  resolveWallCalculationModel,
  type EffectiveWallManufacturingSettings,
} from "./wallManufacturing";
import type { WallEndSide, WallJoint } from "./wallJoint";
import { frameGklDoorRoughAlongSpanMm } from "./frameGklDoorAlongGeometry";
import {
  filterFramingStudsClearOfDoorOpenings,
  removeGkLFramingStudsOverlappingDoorJambs,
} from "./frameWallOpeningLayout";

export class SipWallLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SipWallLayoutError";
  }
}

const EPS = 1e-3;

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

function computeSheetModuleWidthsMm(lengthMm: number, moduleWidthMm: number): number[] {
  const L = Math.max(0, Math.round(lengthMm));
  const W = Math.max(1, Math.round(moduleWidthMm));
  if (L <= 0) {
    return [];
  }
  const out: number[] = [];
  let rem = L;
  while (rem > W) {
    out.push(W);
    rem -= W;
  }
  if (rem > 0) {
    out.push(rem);
  }
  return out;
}

/**
 * Каркас ГКЛ: центры стоек — границы каждого листа (стык = общая линия) и шаг `studStepMm`
 * **от левого края листа** внутри полотна (напр. лист 1200 и шаг 400 → a, a+400, a+800, b).
 * Не смешивать с глобальной сеткой от нуля стены — иначе стык листа не попадает на профиль.
 *
 * Остаточный последний лист (добор): внутреннюю стойку на `a+k·step` не ставим, если до правого края
 * листа `b` меньше полного шага (`b - u < step`) — иначе получается «лишняя» стойка вплотную к завершающей.
 */
export function collectGkLFrameStudCentersFromSheetRegionsMm(
  sipRegions: readonly { readonly startOffsetMm: number; readonly endOffsetMm: number }[],
  studStepMm: number,
): number[] {
  const step = Math.max(1, Math.round(studStepMm));
  const out = new Set<number>();
  const sorted = [...sipRegions].sort(
    (a, b) => a.startOffsetMm - b.startOffsetMm || a.endOffsetMm - b.endOffsetMm,
  );
  for (const r of sorted) {
    const a = Math.round(r.startOffsetMm);
    const b = Math.round(r.endOffsetMm);
    if (b <= a) {
      continue;
    }
    out.add(a);
    out.add(b);
    for (let u = a + step; u < b - EPS; u += step) {
      const uR = Math.round(u);
      /** Порог: хвост до `b` не короче шага каркаса — иначе только границы сегмента (левый стык + правый край). */
      if (b - uR < step - EPS) {
        continue;
      }
      out.add(uR);
    }
  }
  return [...out].sort((x, y) => x - y);
}

const OPENING_NODE_SHIFT_MM = 45;
/** Заход горизонтали над дверью в боковые стойки (мм), не шире полки стойки вдоль стены. */
const FRAME_GKL_DOOR_LINTEL_INTO_STUD_MM = 50;

/** Соседние центры стоек ближе minGapMm сливаются (дубли сетки/стыка, float). */
function mergeCloseSortedStudCentersMm(sorted: readonly number[], minGapMm: number): number[] {
  if (sorted.length < 2) {
    return sorted.slice();
  }
  const out: number[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const x = sorted[i]!;
    const last = out[out.length - 1]!;
    if (x - last < minGapMm) {
      out[out.length - 1] = (last + x) / 2;
    } else {
      out.push(x);
    }
  }
  return out;
}

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
  const isSheetWall = resolveWallCalculationModel(profile) === "frame";
  const frameMaterialType = m.frameMaterial === "steel" ? "steel" : "wood";
  const wallMark = wall.markLabel?.trim() || wall.id.slice(0, 8);
  /** Полная толщина SIP-сэндвича по стене/профилю (OSB+ядро+OSB), не толщина только EPS. */
  const profileTotalT = computeProfileTotalThicknessMm(profile);
  const sipThicknessMm = Math.round(
    wall.thicknessMm > 0 ? wall.thicknessMm : profileTotalT > 0 ? profileTotalT : profile.defaultThicknessMm ?? 0,
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
    const Tframe = m.jointBoardThicknessMm;
    const isFrameGklDoor = o.kind === "door" && isSheetWall && m.doorOpeningFramingPreset === "frame_gkl_door";
    const physicalSpan = isFrameGklDoor ? o.widthMm + 2 * Tframe : o.widthMm;
    const maxLeft = Math.max(minRest, L - physicalSpan - minRest);
    const clearLeft = Math.max(minRest, Math.min(maxLeft, o.offsetFromStartMm));
    if (isFrameGklDoor) {
      const { roughLo, roughHi } = frameGklDoorRoughAlongSpanMm(clearLeft, o.widthMm, Tframe);
      return { lo: roughLo, hi: roughHi, kind: o.kind };
    }
    const hi = Math.min(L - minRest, clearLeft + o.widthMm);
    return { lo: clearLeft, hi, kind: o.kind };
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
  /** Каркас/ГКЛ: длина вертикалей в спецификации = высота стены (профиль входит в П-образные направляющие). */
  const frameVerticalMemberLengthMm = isSheetWall ? wall.heightMm : verticalBetweenPlatesMm;

  const calculationId = newEntityId();
  const generatedAt = new Date().toISOString();
  const Tj = m.jointBoardThicknessMm;
  const studStep = Math.max(1, Math.round(m.studSpacingMm ?? 600));

  const snapshot: WallCalcSettingsSnapshot = {
    ...m,
    wallLengthMm: L,
    profileId: wall.profileId,
    stage3OpeningFraming: opt.includeOpeningFraming,
    stage3WallConnections: opt.includeWallConnectionElements,
  };

  const sipRegions: SipPanelRegion[] = [];
  let lumberDrafts: LumberPieceDraftInput[] = [];

  if (m.includeEndBoards && !isSheetWall) {
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

  const seamPositions = new Set<number>();
  let sipIndex = 0;
  for (const [segLo, segHi] of segments) {
    const segLen = segHi - segLo;
    const openingAdjacentSegment = segmentTouchesFlexibleOpening(segLo, segHi);
    const widths =
      isSheetWall
        ? computeSheetModuleWidthsMm(segLen, m.panelNominalWidthMm)
        : openingAdjacentSegment && segLen < m.minPanelWidthMm
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
        heightMm: isSheetWall ? wall.heightMm : sipPanelHeightMm,
        thicknessMm: sipThicknessMm,
      });
      p = s1;
      if (i < n - 1) {
        if (!isSheetWall) {
          seamPositions.add(Math.round(s1));
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
            lengthMm: verticalBetweenPlatesMm,
            orientation: "across_wall",
            startOffsetMm: j0,
            endOffsetMm: j1,
            materialType: frameMaterialType,
          });
        }
      }
    }
  }

  if (isSheetWall) {
    const studsRaw = collectGkLFrameStudCentersFromSheetRegionsMm(sipRegions, studStep);
    /** Стык листа + шаг каркаса могут дать два центра в пределах погрешности — сливаем в одну стойку. */
    const studs = mergeCloseSortedStudCentersMm(studsRaw, Math.min(28, Math.max(18, Tj / 2)));
    for (const x of studs) {
      const isStart = x <= 0;
      const isEnd = x >= Math.round(L);
      /** Вертикали каркаса — `framing_member_generic`, не `joint_board`: у joint_board в 3D/фасаде есть SIP-сдвиг оси. */
      const role = isStart || isEnd ? "edge_board" : "framing_member_generic";
      const [j0, j1] = isStart
        ? [0, Tj]
        : isEnd
          ? [L - Tj, L]
          : [x - Tj / 2, x + Tj / 2];
      lumberDrafts.push({
        id: newEntityId(),
        wallId: wall.id,
        calculationId,
        role,
        sectionThicknessMm: m.jointBoardThicknessMm,
        sectionDepthMm: m.jointBoardDepthMm,
        startOffsetMm: j0,
        endOffsetMm: j1,
        lengthMm: frameVerticalMemberLengthMm,
        orientation: "across_wall",
        materialType: frameMaterialType,
        metadata: { frameVertical: true },
      });
    }
  }

  if (isSheetWall && m.doorOpeningFramingPreset === "frame_gkl_door") {
    lumberDrafts = filterFramingStudsClearOfDoorOpenings(
      lumberDrafts,
      openingsOnWall.filter((o) => o.kind === "door"),
      Tj,
      true,
    );
  }

  if (m.includeEndBoards && !isSheetWall) {
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
      lengthMm: isSheetWall ? frameVerticalMemberLengthMm : verticalBetweenPlatesMm,
      orientation: "across_wall",
      metadata: { note: "Т-узел на основной стене", ...(isSheetWall ? { frameVertical: true } : {}) },
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
      const metaBase = { openingId: o.id, kind: o.kind };
      const isDoor = o.kind === "door";

      /**
       * Каркас / ГКЛ, дверь: `widthMm` — чистый проём; без SIP-сегментов и OPENING_NODE_SHIFT.
       * Металл: стойка 50×75 (вдоль стены × в плане); направляющие/перемычка 40×75; криплы над дверью — тоже стойка 50×75.
       * Вертикали спецификации на полную высоту стены; перемычка с заходом в боковые стойки.
       */
      if (isDoor && isSheetWall && m.doorOpeningFramingPreset === "frame_gkl_door") {
        const clearLeft = o0;
        const clearRight = o1;
        if (clearRight - clearLeft < EPS) {
          continue;
        }
        const studAlong = Tj;
        const studDepth = m.jointBoardDepthMm;
        const { roughLo, roughHi } = frameGklDoorRoughAlongSpanMm(clearLeft, o.widthMm, studAlong);
        /** Заход линтеля в полку стойки (не больше ширины стойки вдоль стены). */
        const lintelIntoStudMm = Math.min(studAlong, FRAME_GKL_DOOR_LINTEL_INTO_STUD_MM);
        const headerStartMm = Math.max(0, clearLeft - lintelIntoStudMm);
        const headerEndMm = Math.min(L, clearRight + lintelIntoStudMm);
        const headerLen = Math.round(Math.max(0, headerEndMm - headerStartMm));
        /** У торца стены уже есть `edge_board` — не дублируем стойкой проёма. */
        const skipLeftJamb = roughLo <= EPS;
        const skipRightJamb = roughHi >= L - EPS;
        const steelDoor = m.frameMaterial === "steel";

        if (!skipLeftJamb) {
          verticalDrafts.push({
            id: newEntityId(),
            wallId: wall.id,
            calculationId,
            role: "opening_left_stud",
            sectionThicknessMm: studAlong,
            sectionDepthMm: studDepth,
            startOffsetMm: clearLeft - studAlong,
            endOffsetMm: clearLeft,
            lengthMm: frameVerticalMemberLengthMm,
            orientation: "across_wall",
            materialType: frameMaterialType,
            metadata: { ...metaBase, studSegment: "full", doorOpeningFramingPreset: "frame_gkl_door" },
          });
        }
        if (!skipRightJamb) {
          verticalDrafts.push({
            id: newEntityId(),
            wallId: wall.id,
            calculationId,
            role: "opening_right_stud",
            sectionThicknessMm: studAlong,
            sectionDepthMm: studDepth,
            startOffsetMm: clearRight,
            endOffsetMm: clearRight + studAlong,
            lengthMm: frameVerticalMemberLengthMm,
            orientation: "across_wall",
            materialType: frameMaterialType,
            metadata: { ...metaBase, studSegment: "full", doorOpeningFramingPreset: "frame_gkl_door" },
          });
        }
        verticalDrafts.push({
          id: newEntityId(),
          wallId: wall.id,
          calculationId,
          role: "opening_header",
          sectionThicknessMm: m.plateBoardThicknessMm,
          sectionDepthMm: m.plateBoardDepthMm,
          startOffsetMm: headerStartMm,
          endOffsetMm: headerEndMm,
          lengthMm: headerLen,
          orientation: "along_wall",
          metadata: metaBase,
        });

        if (steelDoor) {
          /** Высота полосы листа П2 над проёмом: от низа светового проёма до верха стены. */
          const crippleLen = Math.max(0, Math.round(wall.heightMm - o.heightMm));
          if (crippleLen > EPS) {
            const wClear = o.widthMm;
            const halfAlong = studAlong / 2;
            const cx1 = clearLeft + wClear * 0.25;
            const cx2 = clearRight - wClear * 0.25;
            for (const cx of [cx1, cx2]) {
              verticalDrafts.push({
                id: newEntityId(),
                wallId: wall.id,
                calculationId,
                role: "opening_cripple",
                sectionThicknessMm: studAlong,
                sectionDepthMm: studDepth,
                startOffsetMm: cx - halfAlong,
                endOffsetMm: cx + halfAlong,
                lengthMm: crippleLen,
                orientation: "across_wall",
                materialType: frameMaterialType,
                metadata: { ...metaBase, doorOpeningFramingPreset: "frame_gkl_door" },
              });
            }
          }
        }
        continue;
      }

      const middleShiftLeft = -OPENING_NODE_SHIFT_MM;
      const middleShiftRight = OPENING_NODE_SHIFT_MM;
      const spanStart = o0 + middleShiftLeft;
      const spanEnd = o1 + middleShiftRight;
      const headerLen = Math.max(0, Math.round(spanEnd - spanStart));
      const sill = o.kind === "window" ? Math.max(0, o.sillHeightMm ?? 0) : 0;
      const splitLower = o.kind === "window" ? Math.max(0, sill - OPENING_NODE_SHIFT_MM) : 0;
      /**
       * Дверь: `heightMm` — от низа стены (уровень нижней кромки фасада) до низа перемычки/шапки проёма.
       * Стойки стоят на нижней обвязке → длина = `heightMm − толщина нижней обвязки`.
       */
      const openTop = o.kind === "window" ? sill + o.heightMm : o.heightMm;
      const horT = m.plateBoardThicknessMm;
      const topGap = isDoor ? 0 : OPENING_NODE_SHIFT_MM;
      const lowerSegLen = isDoor ? 0 : Math.max(0, Math.min(verticalBetweenPlatesMm, splitLower - horT));
      const middleSegLen = isDoor
        ? Math.max(0, Math.min(verticalBetweenPlatesMm, openTop - horT))
        : Math.max(0, Math.min(verticalBetweenPlatesMm - lowerSegLen, openTop - splitLower - horT));
      /**
       * Дверь, сегмент «top»: от верхней грани перемычки (`openTop + horT`) до нижней плоскости верхней обвязки
       * (`wall.heightMm − horT`). Эквивалентно `verticalBetweenPlatesMm − openTop` при равной толщине плит и шапки (`horT`).
       */
      const upperSegLen = isDoor
        ? Math.max(0, Math.round(wall.heightMm - horT - openTop - horT))
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

  if (isSheetWall && m.doorOpeningFramingPreset === "frame_gkl_door" && opt.includeOpeningFraming) {
    verticalDrafts = removeGkLFramingStudsOverlappingDoorJambs(
      verticalDrafts,
      openingsOnWall.filter((o) => o.kind === "door"),
      Tj,
    );
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
    .map((o) => {
      if (isSheetWall && m.doorOpeningFramingPreset === "frame_gkl_door") {
        const { roughLo, roughHi } = frameGklDoorRoughAlongSpanMm(o.offsetFromStartMm, o.widthMm, Tj);
        return { lo: Math.max(0, roughLo), hi: Math.min(L, roughHi) };
      }
      return { lo: Math.max(0, o.offsetFromStartMm), hi: Math.min(L, o.offsetFromStartMm + o.widthMm) };
    })
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

  const normalizedDrafts = verticalDrafts.map((d) => ({
    ...d,
    materialType: d.materialType ?? frameMaterialType,
  }));
  const lumberPieces = numberAndSortLumberPieces(wall, normalizedDrafts);

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
