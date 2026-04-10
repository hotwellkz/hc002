import { getLayerById } from "./layerOps";
import type { ProfileMaterialType } from "./profile";
import { getProfileById } from "./profileOps";
import { resolveWallCalculationModel } from "./wallManufacturing";
import type { Project } from "./project";
import type { Wall } from "./wall";
import { boardCoreNormalOffsetsMm } from "./wallLumberBoard2dOffsets";
import { resolveWallProfileCoreBandMm } from "./wallProfileLayers";
import type { LumberPiece, WallCalculationResult } from "./wallCalculation";

const MM_TO_M = 0.001;
const MIN_LEN_MM = 1;
/**
 * Минимальный габарит по любой оси (м) для расчётного mesh в 3D.
 * Всё, что меньше или равно (вплоть до «1 мм» артефактов), не попадает в сцену как отдельный объём.
 */
export const CALCULATION_SOLID_MIN_EXTENT_M = 0.001;
/** Минимальная толщина EPS-сегмента (мм), чтобы не порождать пылинки. */
const EPS_SEGMENT_MIN_MM = 1.5;
const OPENING_NODE_SHIFT_MM = 45;

function alongShiftForPieceMm(piece: LumberPiece): number {
  /** Обычные стыковочные доски центрируем по линии стыка SIP/OSB. */
  if (piece.role === "joint_board") {
    return -piece.sectionThicknessMm / 2;
  }
  return 0;
}

interface RectYN {
  readonly y0: number;
  readonly y1: number;
  readonly n0: number;
  readonly n1: number;
}

function subtractRectFromRects(base: readonly RectYN[], cut: RectYN): RectYN[] {
  const out: RectYN[] = [];
  for (const r of base) {
    const iy0 = Math.max(r.y0, cut.y0);
    const iy1 = Math.min(r.y1, cut.y1);
    const in0 = Math.max(r.n0, cut.n0);
    const in1 = Math.min(r.n1, cut.n1);
    if (iy1 - iy0 < 1e-6 || in1 - in0 < 1e-6) {
      out.push(r);
      continue;
    }
    /** left / right strips by normal */
    if (r.n0 < in0) {
      out.push({ y0: r.y0, y1: r.y1, n0: r.n0, n1: in0 });
    }
    if (in1 < r.n1) {
      out.push({ y0: r.y0, y1: r.y1, n0: in1, n1: r.n1 });
    }
    /** middle band: top / bottom by vertical */
    const mn0 = Math.max(r.n0, in0);
    const mn1 = Math.min(r.n1, in1);
    if (mn1 - mn0 > 1e-6) {
      if (r.y0 < iy0) {
        out.push({ y0: r.y0, y1: iy0, n0: mn0, n1: mn1 });
      }
      if (iy1 < r.y1) {
        out.push({ y0: iy1, y1: r.y1, n0: mn0, n1: mn1 });
      }
    }
  }
  return out.filter((r) => r.y1 - r.y0 > 1e-6 && r.n1 - r.n0 > 1e-6);
}

export function pieceAlongIntervalMm(piece: LumberPiece): [number, number] {
  const shift = alongShiftForPieceMm(piece);
  return [Math.min(piece.startOffsetMm, piece.endOffsetMm) + shift, Math.max(piece.startOffsetMm, piece.endOffsetMm) + shift];
}

/**
 * Ось стыка SIP/OSB вдоль стены (мм) — центр вертикальной joint_board, та же логика, что и 3D (`alongShiftForPieceMm`).
 * Не относится к tee/corner_joint_board и к торцевым edge_board.
 */
export function jointBoardSeamCenterAlongMm(piece: LumberPiece): number | null {
  if (piece.role !== "joint_board" || piece.orientation !== "across_wall") {
    return null;
  }
  const [a0, a1] = pieceAlongIntervalMm(piece);
  return (a0 + a1) / 2;
}

/** Уникальные центры внутренних стыков между SIP-панелями по расчёту (для фасада / вида стены). */
export function internalWallJointSeamCentersAlongMm(calc: WallCalculationResult): number[] {
  const centers: number[] = [];
  for (const p of calc.lumberPieces) {
    const c = jointBoardSeamCenterAlongMm(p);
    if (c != null) {
      centers.push(c);
    }
  }
  centers.sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of centers) {
    if (out.length === 0 || Math.abs(x - out[out.length - 1]!) > 0.5) {
      out.push(x);
    }
  }
  return out;
}

/**
 * Центры вертикалей каркаса (перегородка/каркас): стойки и торцы без SIP-сдвига joint_board.
 */
export function frameStudCentersAlongWallMm(calc: WallCalculationResult): number[] {
  const centers: number[] = [];
  for (const p of calc.lumberPieces) {
    if (p.orientation !== "across_wall") {
      continue;
    }
    if (p.role !== "framing_member_generic" && p.role !== "edge_board") {
      continue;
    }
    const lo = Math.min(p.startOffsetMm, p.endOffsetMm);
    const hi = Math.max(p.startOffsetMm, p.endOffsetMm);
    centers.push((lo + hi) / 2);
  }
  centers.sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of centers) {
    if (out.length === 0 || Math.abs(x - out[out.length - 1]!) > 0.5) {
      out.push(x);
    }
  }
  return out;
}

/**
 * Горизонтальные размеры ширины SIP-панелей по стыкам OSB (вид стены):
 * края — внешние границы оболочки SIP по расчёту; внутренние точки — центры joint_board.
 * Интервалы: [левый край → 1-й стык], [стык → стык], …, [последний стык → правый край].
 */
export function sipPanelHorizontalDimensionSegmentsByOsbSeamsMm(
  sipShellX0Mm: number,
  sipShellX1Mm: number,
  seamCentersAlongMm: readonly number[],
): { a: number; b: number; text: string }[] {
  const left = Math.min(sipShellX0Mm, sipShellX1Mm);
  const right = Math.max(sipShellX0Mm, sipShellX1Mm);
  const eps = 0.5;
  const sorted = [...seamCentersAlongMm].sort((a, b) => a - b);
  const inner = sorted.filter((x) => x > left + eps && x < right - eps);
  const boundaries = [left, ...inner, right];
  const out: { a: number; b: number; text: string }[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i]!;
    const b = boundaries[i + 1]!;
    if (b - a < 0.5) continue;
    out.push({ a, b, text: `${Math.round(b - a)}` });
  }
  return out;
}

function pieceVerticalIntervalMm(
  piece: LumberPiece,
  wall: Wall,
  project: Project,
  bottomMm: number,
  plateT: number,
  vCoreMm: number,
): [number, number] {
  const cyM = lumberPieceCenterYWorld(piece, wall, project, bottomMm, plateT, vCoreMm);
  const cyMm = cyM / MM_TO_M;
  const hMm = piece.orientation === "across_wall" ? piece.lengthMm : piece.sectionThicknessMm;
  return [cyMm - hMm / 2, cyMm + hMm / 2];
}

/**
 * Прямоугольник детали на фасаде стены (мм): вдоль стены [x0,x1], по высоте от низа стены [b0,b1] (b0<b1).
 * Тот же источник геометрии, что и 3D-меши каркаса (`pieceAlongIntervalMm` + `pieceVerticalIntervalMm`).
 */
export function lumberPieceWallElevationRectMm(
  piece: LumberPiece,
  wall: Wall,
  project: Project,
  calc: WallCalculationResult,
): { readonly x0: number; readonly x1: number; readonly b0: number; readonly b1: number } {
  const bottomMm = wallBottomElevationMm(wall, project);
  const plateT = calc.settingsSnapshot.plateBoardThicknessMm;
  const vCoreMm = verticalCoreSpanMm(wall, calc);
  const [x0, x1] = pieceAlongIntervalMm(piece);
  const [y0, y1] = pieceVerticalIntervalMm(piece, wall, project, bottomMm, plateT, vCoreMm);
  return {
    x0,
    x1,
    b0: y0 - bottomMm,
    b1: y1 - bottomMm,
  };
}

function pieceNormalIntervalMm(piece: LumberPiece, offStart: number, offEnd: number, coreMid: number): [number, number] | null {
  const sd = piece.sectionDepthMm;
  const t0 = Math.max(offStart, coreMid - sd / 2);
  const t1 = Math.min(offEnd, coreMid + sd / 2);
  if (t1 - t0 < 1e-6) {
    return null;
  }
  return [t0, t1];
}

/**
 * Один объём расчёта для 3D (центр в мировых координатах, размеры как в wallMeshSpec:
 * width = нормаль к стене (X), height = вертикаль (Y), depth = вдоль стены (Z в локали до rotationY)).
 */
export interface CalculationSolidSpec {
  readonly reactKey: string;
  readonly wallId: string;
  readonly calculationId: string;
  readonly source: "sip" | "lumber";
  readonly pieceId?: string;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly materialType: ProfileMaterialType;
}

function wallBottomElevationMm(wall: Wall, project: Project): number {
  if (wall.baseElevationMm != null && Number.isFinite(wall.baseElevationMm)) {
    return wall.baseElevationMm;
  }
  return getLayerById(project, wall.layerId)?.elevationMm ?? 0;
}

function thicknessNormalUnit(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): { readonly nx: number; readonly nz: number; readonly lenMm: number; readonly ux: number; readonly uy: number } {
  const dxMm = ex - sx;
  const dyMm = ey - sy;
  const lenMm = Math.hypot(dxMm, dyMm);
  if (lenMm < MIN_LEN_MM) {
    return { nx: 1, nz: 0, lenMm: 0, ux: 1, uy: 0 };
  }
  const ux = dxMm / lenMm;
  const uy = dyMm / lenMm;
  const nx = -dyMm / lenMm;
  const nz = -dxMm / lenMm;
  return { nx, nz, lenMm, ux, uy };
}

function pointAlongWallMm(
  sx: number,
  sy: number,
  ux: number,
  uy: number,
  sMm: number,
): { readonly x: number; readonly y: number } {
  return { x: sx + ux * sMm, y: sy + uy * sMm };
}

/** Центр полосы ядра по нормали от оси стены (мм). */
function coreMidNormalMm(
  wall: Wall,
  calc: WallCalculationResult,
  project: Project,
): number {
  const off = boardCoreNormalOffsetsMm(wall, calc, project);
  return (off.offStartMm + off.offEndMm) / 2;
}

function verticalCoreSpanMm(wall: Wall, calc: WallCalculationResult): number {
  const plateT = calc.settingsSnapshot.plateBoardThicknessMm;
  return Math.max(0, wall.heightMm - 2 * plateT);
}

function openingById(project: Project, id: string) {
  return project.openings.find((o) => o.id === id);
}

function isFrameCalculationWall(wall: Wall, project: Project): boolean {
  const prof = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
  return prof != null && resolveWallCalculationModel(prof) === "frame";
}

/** Вертикаль каркаса на всю высоту стены: центр по габариту (профиль в направляющих). */
function frameVerticalMemberCenterYWorld(piece: LumberPiece, bottomMm: number): number {
  const h = piece.lengthMm * MM_TO_M;
  return bottomMm * MM_TO_M + h / 2;
}

function expandSipRegionAlongForCenteredJointBoard(
  regions: readonly { startOffsetMm: number; endOffsetMm: number }[],
  regionIndex: number,
  jointThicknessMm: number,
): [number, number] {
  const region = regions[regionIndex]!;
  let s0 = region.startOffsetMm;
  let s1 = region.endOffsetMm;
  const tol = 0.5;
  const prev = regionIndex > 0 ? regions[regionIndex - 1] : null;
  const next = regionIndex + 1 < regions.length ? regions[regionIndex + 1] : null;
  if (prev) {
    const leftGap = region.startOffsetMm - prev.endOffsetMm;
    if (Math.abs(leftGap - jointThicknessMm) <= tol || Math.abs(leftGap) <= tol) {
      s0 -= jointThicknessMm / 2;
    }
  }
  if (next) {
    const rightGap = next.startOffsetMm - region.endOffsetMm;
    if (Math.abs(rightGap - jointThicknessMm) <= tol || Math.abs(rightGap) <= tol) {
      s1 += jointThicknessMm / 2;
    }
  }
  return [s0, s1];
}

function sipSpecsForWall(
  wall: Wall,
  project: Project,
  calc: WallCalculationResult,
  sx: number,
  sy: number,
  ux: number,
  uy: number,
  nx: number,
  nz: number,
  rotationY: number,
  bottomMm: number,
  plateT: number,
  vCoreMm: number,
  coreMid: number,
  offStart: number,
  offEnd: number,
): CalculationSolidSpec[] {
  const out: CalculationSolidSpec[] = [];
  const coreBaseY = bottomMm + plateT;
  const pieces = calc.lumberPieces;
  const profile = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
  const coreBand = profile ? resolveWallProfileCoreBandMm(wall.thicknessMm, profile) : null;
  const coreMaterial: ProfileMaterialType = coreBand?.materialType ?? "eps";

  const pushResidualChunk = (reactKey: string, s0: number, s1: number, y0Core: number, y1Core: number) => {
    const y0 = Math.max(0, Math.min(vCoreMm, y0Core));
    const y1 = Math.max(0, Math.min(vCoreMm, y1Core));
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) {
      return;
    }
    /** 1) Режем по Along по всем доскам, чтобы остаток EPS строился по фактическим границам препятствий. */
    const alongPoints = new Set<number>([s0, s1]);
    for (const p of pieces) {
      const [a0, a1] = pieceAlongIntervalMm(p);
      if (a1 <= s0 + 1e-3 || a0 >= s1 - 1e-3) {
        continue;
      }
      alongPoints.add(Math.max(s0, a0));
      alongPoints.add(Math.min(s1, a1));
    }
    const along = [...alongPoints].sort((a, b) => a - b);
    let segIdx = 0;
    for (let ai = 0; ai < along.length - 1; ai++) {
      const a0 = along[ai]!;
      const a1 = along[ai + 1]!;
      if (a1 - a0 < 1e-3) {
        continue;
      }
      const alongMid = (a0 + a1) / 2;
      /** 2) В срезе along строим остаток в плоскости Y×N: base - obstacles. */
      let residual: RectYN[] = [{ y0, y1, n0: offStart, n1: offEnd }];
      for (const p of pieces) {
        const [pA0, pA1] = pieceAlongIntervalMm(p);
        if (alongMid < pA0 - 1e-3 || alongMid > pA1 + 1e-3) {
          continue;
        }
        const [pY0Abs, pY1Abs] = pieceVerticalIntervalMm(p, wall, project, bottomMm, plateT, vCoreMm);
        const nIv = pieceNormalIntervalMm(p, offStart, offEnd, coreMid);
        if (!nIv) {
          continue;
        }
        const cut: RectYN = {
          y0: Math.max(y0, pY0Abs - coreBaseY),
          y1: Math.min(y1, pY1Abs - coreBaseY),
          n0: nIv[0],
          n1: nIv[1],
        };
        if (cut.y1 - cut.y0 < 1e-6 || cut.n1 - cut.n0 < 1e-6) {
          continue;
        }
        residual = subtractRectFromRects(residual, cut);
        if (!residual.length) {
          break;
        }
      }
      const p = pointAlongWallMm(sx, sy, ux, uy, alongMid);
      const depth = (a1 - a0) * MM_TO_M;
      for (const r of residual) {
        if (r.y1 - r.y0 < 1e-3 || r.n1 - r.n0 < EPS_SEGMENT_MIN_MM) {
          continue;
        }
        const cy = bottomMm * MM_TO_M + plateT * MM_TO_M + ((r.y0 + r.y1) / 2) * MM_TO_M;
        const centerOff = (r.n0 + r.n1) / 2;
        const cx = (p.x + nx * centerOff) * MM_TO_M;
        const cz = (-p.y + nz * centerOff) * MM_TO_M;
        out.push({
          reactKey: `${reactKey}-a${ai}-r${segIdx++}`,
          wallId: wall.id,
          calculationId: calc.id,
          source: "sip",
          position: [cx, cy, cz],
          rotationY,
          width: (r.n1 - r.n0) * MM_TO_M,
          height: (r.y1 - r.y0) * MM_TO_M,
          depth,
          materialType: coreMaterial,
        });
      }
    }
  };

  const regionsSorted = [...calc.sipRegions].sort((a, b) => a.startOffsetMm - b.startOffsetMm);
  const jointT = calc.settingsSnapshot.jointBoardThicknessMm;
  for (let i = 0; i < regionsSorted.length; i++) {
    const r = regionsSorted[i]!;
    const [s0, s1] = expandSipRegionAlongForCenteredJointBoard(regionsSorted, i, jointT);
    pushResidualChunk(`${wall.id}-${calc.id}-sip-${r.index}`, s0, s1, 0, vCoreMm);
  }

  const Tj = calc.settingsSnapshot.jointBoardThicknessMm;
  const horT = calc.settingsSnapshot.plateBoardThicknessMm;
  for (const o of project.openings) {
    if (o.wallId !== wall.id || o.offsetFromStartMm == null || (o.kind !== "window" && o.kind !== "door")) {
      continue;
    }
    /** Окно: между внутренними гранями стоек. Дверь каркаса/ГКЛ: чистый проём (без SIP-сужения Tj/2). */
    const isDoor = o.kind === "door";
    const prof = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
    const frameDoorClear = isDoor && prof != null && resolveWallCalculationModel(prof) === "frame";
    const o0 = frameDoorClear ? o.offsetFromStartMm : o.offsetFromStartMm + Tj / 2;
    const o1 = frameDoorClear ? o.offsetFromStartMm + o.widthMm : o.offsetFromStartMm + o.widthMm - Tj / 2;
    if (o1 - o0 < 1e-3) {
      continue;
    }
    const sill = isDoor ? 0 : Math.max(0, o.sillHeightMm ?? o.position?.sillLevelMm ?? 0);
    const openTop = sill + o.heightMm;
    const belowTop = isDoor ? 0 : Math.max(0, sill - horT - OPENING_NODE_SHIFT_MM);
    /** Дверь: верх перемычки в координатах ядра = openTop мм от низа ядра (см. sipWallLayout дверной проём). */
    const aboveBottom = isDoor
      ? Math.max(0, Math.min(vCoreMm, openTop))
      : Math.max(0, Math.min(vCoreMm, openTop + horT - OPENING_NODE_SHIFT_MM));
    if (!isDoor && belowTop > 1e-3) {
      pushResidualChunk(`${wall.id}-${calc.id}-sip-win-${o.id}-below`, o0, o1, 0, belowTop);
    }
    if (aboveBottom < vCoreMm - 1e-3) {
      pushResidualChunk(`${wall.id}-${calc.id}-sip-${isDoor ? "door" : "win"}-${o.id}-above`, o0, o1, aboveBottom, vCoreMm);
    }
  }
  return out;
}

/** Центр бокса детали по Y (м), общий для меша досок и торцевых швов. */
function lumberPieceCenterYWorld(
  piece: LumberPiece,
  wall: Wall,
  project: Project,
  bottomMm: number,
  plateT: number,
  vCoreMm: number,
): number {
  const meta = piece.metadata as {
    openingId?: string;
    studSegment?: "top" | "middle" | "bottom" | "full" | "door_jamb_jack";
  } | undefined;
  if (piece.role === "opening_cripple" && meta?.openingId) {
    const op = openingById(project, meta.openingId);
    if (op && op.wallId === wall.id && op.kind === "door") {
      const openTop = op.heightMm;
      const len = piece.lengthMm;
      if (isFrameCalculationWall(wall, project)) {
        return bottomMm * MM_TO_M + (openTop + len / 2) * MM_TO_M;
      }
      const headerTh = plateT;
      return bottomMm * MM_TO_M + (openTop + headerTh + len / 2) * MM_TO_M;
    }
  }
  if (
    piece.orientation === "across_wall" &&
    (piece.role === "opening_left_stud" || piece.role === "opening_right_stud") &&
    meta?.openingId
  ) {
    const op = openingById(project, meta.openingId);
    if (op && op.wallId === wall.id) {
      if (meta.studSegment === "door_jamb_jack") {
        const len = piece.lengthMm;
        return bottomMm * MM_TO_M + (plateT + len / 2) * MM_TO_M;
      }
      if (meta.studSegment === "full") {
        if (isFrameCalculationWall(wall, project)) {
          return frameVerticalMemberCenterYWorld(piece, bottomMm);
        }
        const height = piece.lengthMm * MM_TO_M;
        return bottomMm * MM_TO_M + plateT * MM_TO_M + height / 2;
      }
      const isDoor = op.kind === "door";
      const sill = op.kind === "window" ? (op.sillHeightMm ?? 0) : 0;
      const openTop = op.kind === "window" ? sill + op.heightMm : op.heightMm;
      const horT = plateT;
      const len = piece.lengthMm;
      const midCenter = isDoor ? bottomMm + plateT + len / 2 : bottomMm + sill + len / 2;
      /** Дверь: верх стойки = низ перемычки (`openTop` от низа стены); короткие стойки над проёмом — от верха перемычки. */
      const topCenter = isDoor
        ? bottomMm + plateT + openTop + len / 2
        : bottomMm + openTop + horT + len / 2;
      const botCenter = bottomMm + (sill - horT) - len / 2;
      if (meta.studSegment === "top") {
        return topCenter * MM_TO_M;
      }
      if (meta.studSegment === "middle") {
        return midCenter * MM_TO_M;
      }
      if (meta.studSegment === "bottom") {
        return botCenter * MM_TO_M;
      }
    }
  }
  if (piece.orientation === "across_wall") {
    const height = piece.lengthMm * MM_TO_M;
    if (
      isFrameCalculationWall(wall, project) &&
      (piece.role === "framing_member_generic" ||
        piece.role === "edge_board" ||
        piece.role === "tee_joint_board")
    ) {
      return frameVerticalMemberCenterYWorld(piece, bottomMm);
    }
    return bottomMm * MM_TO_M + plateT * MM_TO_M + height / 2;
  }
  const st = piece.sectionThicknessMm;
  const height = st * MM_TO_M;
  if (piece.role === "upper_plate") {
    return bottomMm * MM_TO_M + wall.heightMm * MM_TO_M - height / 2;
  }
  if (piece.role === "lower_plate") {
    return bottomMm * MM_TO_M + height / 2;
  }
  if ((piece.role === "opening_header" || piece.role === "opening_sill") && meta?.openingId) {
    const op = openingById(project, meta.openingId);
    if (op && op.wallId === wall.id) {
      const sill = op.kind === "window" ? (op.sillHeightMm ?? 0) : 0;
      const sillFromMeta =
        typeof (meta as { sillLevelMm?: unknown })?.sillLevelMm === "number"
          ? ((meta as { sillLevelMm: number }).sillLevelMm ?? sill)
          : sill;
      if (piece.role === "opening_header") {
        if (op.kind === "door") {
          /** Низ перемычки на отметке `heightMm` от низа стены; центр — плюс половина толщины доски. */
          return bottomMm * MM_TO_M + op.heightMm * MM_TO_M + height / 2;
        }
        return bottomMm * MM_TO_M + sill * MM_TO_M + op.heightMm * MM_TO_M + height / 2;
      }
      return bottomMm * MM_TO_M + sillFromMeta * MM_TO_M - height / 2;
    }
  }
  return bottomMm * MM_TO_M + plateT * MM_TO_M + (vCoreMm * MM_TO_M) / 2;
}

function filterMicroscopicCalculationSolids(specs: readonly CalculationSolidSpec[]): CalculationSolidSpec[] {
  const lo = CALCULATION_SOLID_MIN_EXTENT_M;
  const eps = 1e-9;
  return specs.filter((s) => {
    if (s.source !== "sip" && s.source !== "lumber") {
      return true;
    }
    return Math.min(s.width, s.height, s.depth) > lo + eps;
  });
}

function lumberSpecsForWall(
  wall: Wall,
  project: Project,
  calc: WallCalculationResult,
  sx: number,
  sy: number,
  ux: number,
  uy: number,
  nx: number,
  nz: number,
  rotationY: number,
  bottomMm: number,
  plateT: number,
  vCoreMm: number,
  coreMid: number,
): CalculationSolidSpec[] {
  const out: CalculationSolidSpec[] = [];
  const wood: ProfileMaterialType = "wood";

  for (const piece of calc.lumberPieces) {
    const alongShiftMm = alongShiftForPieceMm(piece);
    const sMid = (piece.startOffsetMm + piece.endOffsetMm) / 2 + alongShiftMm;
    const p = pointAlongWallMm(sx, sy, ux, uy, sMid);
    const along = Math.max(1e-3, piece.endOffsetMm - piece.startOffsetMm);
    const st = piece.sectionThicknessMm;
    const sd = piece.sectionDepthMm;

    if (piece.orientation === "across_wall") {
      const width = sd * MM_TO_M;
      const depth = along * MM_TO_M;
      const height = piece.lengthMm * MM_TO_M;
      const cx = (p.x + nx * coreMid) * MM_TO_M;
      const cz = (-p.y + nz * coreMid) * MM_TO_M;
      const cy = lumberPieceCenterYWorld(piece, wall, project, bottomMm, plateT, vCoreMm);
      out.push({
        reactKey: `${wall.id}-${piece.id}`,
        wallId: wall.id,
        calculationId: calc.id,
        source: "lumber",
        pieceId: piece.id,
        position: [cx, cy, cz],
        rotationY,
        width,
        height,
        depth,
        materialType: piece.materialType ?? wood,
      });
      continue;
    }

    /** along_wall: плита/перемычка — длинный размер вдоль стены (Z), тонкий по Y. */
    const depth = along * MM_TO_M;
    const width = sd * MM_TO_M;
    const height = st * MM_TO_M;
    const cx = (p.x + nx * coreMid) * MM_TO_M;
    const cz = (-p.y + nz * coreMid) * MM_TO_M;
    const cy = lumberPieceCenterYWorld(piece, wall, project, bottomMm, plateT, vCoreMm);

    out.push({
      reactKey: `${wall.id}-${piece.id}`,
      wallId: wall.id,
      calculationId: calc.id,
      source: "lumber",
      pieceId: piece.id,
      position: [cx, cy, cz],
      rotationY,
      width,
      height,
      depth,
      materialType: piece.materialType ?? wood,
    });
  }

  return out;
}

/**
 * Все объёмы расчёта для одной стены (SIP + пиломатериалы), согласованы с 2D (полоса ядра, смещения вдоль стены).
 * EPS в ядре дробится по нормали, исключая объемы вертикальных досок (без полного CSG).
 */
export function buildCalculationSolidSpecsForWall(
  wall: Wall,
  project: Project,
  calc: WallCalculationResult,
): readonly CalculationSolidSpec[] {
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const { nx, nz, lenMm, ux, uy } = thicknessNormalUnit(sx, sy, ex, ey);
  if (lenMm < MIN_LEN_MM) {
    return [];
  }

  const dxM = (ex - sx) * MM_TO_M;
  const dzM = -(ey - sy) * MM_TO_M;
  const rotationY = Math.atan2(dxM, dzM);

  const bottomMm = wallBottomElevationMm(wall, project);
  const plateT = calc.settingsSnapshot.plateBoardThicknessMm;
  const vCoreMm = verticalCoreSpanMm(wall, calc);
  const coreMid = coreMidNormalMm(wall, calc, project);
  const off = boardCoreNormalOffsetsMm(wall, calc, project);
  const offStart = off.offStartMm;
  const offEnd = off.offEndMm;

  const sip = sipSpecsForWall(
    wall,
    project,
    calc,
    sx,
    sy,
    ux,
    uy,
    nx,
    nz,
    rotationY,
    bottomMm,
    plateT,
    vCoreMm,
    coreMid,
    offStart,
    offEnd,
  );
  const lum = lumberSpecsForWall(
    wall,
    project,
    calc,
    sx,
    sy,
    ux,
    uy,
    nx,
    nz,
    rotationY,
    bottomMm,
    plateT,
    vCoreMm,
    coreMid,
  );
  return filterMicroscopicCalculationSolids([...sip, ...lum]);
}

export function buildCalculationSolidSpecsForProject(project: Project): readonly CalculationSolidSpec[] {
  const calcByWall = new Map(project.wallCalculations.map((c) => [c.wallId, c]));
  const out: CalculationSolidSpec[] = [];
  let sipCount = 0;
  let lumberCount = 0;
  for (const w of project.walls) {
    const calc = calcByWall.get(w.id);
    if (!calc) {
      continue;
    }
    const chunk = buildCalculationSolidSpecsForWall(w, project, calc);
    for (const s of chunk) {
      if (s.source === "sip") {
        sipCount++;
      } else if (s.source === "lumber") {
        lumberCount++;
      }
    }
    out.push(...chunk);
  }
  if (import.meta.env.DEV && out.length > 0) {
    // eslint-disable-next-line no-console
    console.debug("[calc3d] meshes", {
      epsSegments: sipCount,
      lumber: lumberCount,
    });
  }
  return out;
}
