import { getLayerById } from "./layerOps";
import type { ProfileMaterialType } from "./profile";
import type { Project } from "./project";
import type { Wall } from "./wall";
import { boardCoreNormalOffsetsMm } from "./wallLumberBoard2dOffsets";
import type { LumberPiece, WallCalculationResult } from "./wallCalculation";

const MM_TO_M = 0.001;
const MIN_LEN_MM = 1;
/** Тонкая «визуальная» толщина шва панели вдоль стены (мм), без реального зазора. */
const SIP_SEAM_DEPTH_MM = 1.5;
/** Торцевые швы досок — чуть тоньше/слабее SIP, тот же принцип тонкого бокса. */
const LUMBER_SEAM_DEPTH_MM = 1.2;
const LUMBER_SEAM_MIN_ALONG_MM = 20;
const LUMBER_SEAM_MIN_FACE_MM = 6;
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
  readonly source: "sip" | "lumber" | "sip_seam" | "lumber_seam";
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

function mergeIntervals1D(intervals: readonly [number, number][]): [number, number][] {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [[sorted[0]![0], sorted[0]![1]]];
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = sorted[i]!;
    const last = out[out.length - 1]!;
    if (a <= last[1] + 0.1) {
      last[1] = Math.max(last[1], b);
    } else {
      out.push([a, b]);
    }
  }
  return out;
}

function subtractIntervalsFromBase(baseLo: number, baseHi: number, cuts: readonly [number, number][]): [number, number][] {
  let merged = mergeIntervals1D(cuts);
  merged = merged.filter(([a, b]) => b - a > 1e-3);
  let remaining: [number, number][] = [[baseLo, baseHi]];
  for (const [c0, c1] of merged) {
    const next: [number, number][] = [];
    for (const [r0, r1] of remaining) {
      if (c1 <= r0 + 1e-4 || c0 >= r1 - 1e-4) {
        next.push([r0, r1]);
        continue;
      }
      if (c0 > r0) {
        next.push([r0, Math.min(c0, r1)]);
      }
      if (c1 < r1) {
        next.push([Math.max(c1, r0), r1]);
      }
    }
    remaining = next.filter(([a, b]) => b - a > EPS_SEGMENT_MIN_MM);
  }
  return remaining;
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

/**
 * Внутри плоскости ядра по нормали от оси: вырезать объёмы вертикальных досок (across_wall),
 * пересекающих данную SIP-зону по длине стены и по высоте ядра.
 */
function epsNormalSegmentsForSipRegionMm(
  wall: Wall,
  project: Project,
  sipS0: number,
  sipS1: number,
  offStart: number,
  offEnd: number,
  coreMid: number,
  bottomMm: number,
  plateT: number,
  vCoreMm: number,
  lumberPieces: readonly LumberPiece[],
): [number, number][] {
  const yLo = bottomMm + plateT;
  const yHi = bottomMm + plateT + vCoreMm;
  const cuts: [number, number][] = [];
  for (const piece of lumberPieces) {
    if (piece.orientation !== "across_wall") {
      continue;
    }
    const [z0, z1] = pieceAlongIntervalMm(piece);
    if (z1 <= sipS0 + 1e-3 || z0 >= sipS1 - 1e-3) {
      continue;
    }
    let pLo = bottomMm + plateT;
    let pHi = bottomMm + plateT + piece.lengthMm;
    if (piece.orientation === "across_wall") {
      const meta = piece.metadata as { openingId?: string; studSegment?: "top" | "middle" | "bottom" } | undefined;
      if (
        (piece.role === "opening_left_stud" || piece.role === "opening_right_stud") &&
        meta?.openingId
      ) {
        const op = openingById(project, meta.openingId);
        if (op && op.wallId === wall.id) {
          const isDoor = op.kind === "door";
          const sill = op.kind === "window" ? (op.sillHeightMm ?? op.position?.sillLevelMm ?? 0) : 0;
          const splitLower = isDoor ? 0 : Math.max(0, sill - OPENING_NODE_SHIFT_MM);
          const openTop = op.kind === "window" ? sill + op.heightMm : op.heightMm;
          const horT = plateT;
          const segBottomLo = bottomMm + plateT;
          const segBottomHi = bottomMm + plateT + Math.max(0, splitLower - horT);
          const segMiddleLo = bottomMm + plateT + splitLower;
          const segMiddleHi = bottomMm + plateT + (isDoor ? openTop : Math.max(splitLower, openTop - horT));
          const segTopLo = bottomMm + plateT + (isDoor ? openTop + horT : openTop);
          const segTopHi = bottomMm + plateT + vCoreMm;
          if (meta.studSegment === "bottom") {
            pLo = segBottomLo;
            pHi = segBottomHi;
          } else if (meta.studSegment === "middle") {
            pLo = segMiddleLo;
            pHi = segMiddleHi;
          } else if (meta.studSegment === "top") {
            pLo = segTopLo;
            pHi = segTopHi;
          }
        }
      }
    }
    if (pHi <= yLo + 1e-3 || pLo >= yHi - 1e-3) {
      continue;
    }
    const nIv = pieceNormalIntervalMm(piece, offStart, offEnd, coreMid);
    if (nIv) {
      cuts.push(nIv);
    }
  }
  return subtractIntervalsFromBase(offStart, offEnd, cuts);
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
          materialType: "eps",
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
    /** Над/под окном берём диапазон между внутренними гранями боковых стоек, а не суженный "оконный блок". */
    const o0 = o.offsetFromStartMm + Tj / 2;
    const o1 = o.offsetFromStartMm + o.widthMm - Tj / 2;
    if (o1 - o0 < 1e-3) {
      continue;
    }
    const isDoor = o.kind === "door";
    const sill = isDoor ? 0 : Math.max(0, o.sillHeightMm ?? o.position?.sillLevelMm ?? 0);
    const openTop = sill + o.heightMm;
    const belowTop = isDoor ? 0 : Math.max(0, sill - horT - OPENING_NODE_SHIFT_MM);
    const aboveBottom = isDoor
      ? Math.max(0, Math.min(vCoreMm, openTop + horT))
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

/**
 * Визуальные швы между SIP-панелями: только в полосе ядра EPS и с тем же разбиением по нормали,
 * что и sip-сегменты (вырез вертикальных досок). Иначе тонкий бокс на всю толщину стены
 * рисуется поверх каркаса и выглядит как «разрез» доски.
 * Высота — зона ядра между обвязками (как sip), без пересечения плит.
 */
function sipSeamSpecsForWall(
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
  offStart: number,
  offEnd: number,
  coreMid: number,
): CalculationSolidSpec[] {
  const Tj = calc.settingsSnapshot.jointBoardThicknessMm;
  const tol = 1.2;
  const regions = [...calc.sipRegions].sort((a, b) => a.startOffsetMm - b.startOffsetMm);
  const out: CalculationSolidSpec[] = [];
  const height = vCoreMm * MM_TO_M;
  const cy = bottomMm * MM_TO_M + plateT * MM_TO_M + (vCoreMm * MM_TO_M) / 2;

  for (let i = 0; i < regions.length - 1; i++) {
    const a = regions[i]!;
    const b = regions[i + 1]!;
    const gap = b.startOffsetMm - a.endOffsetMm;
    /** Стык «встык» (граница панелей = ось joint_board) или зазор под старую модель с вычитанием Tj между зонами. */
    const alignedSeam = Math.abs(gap) <= tol || Math.abs(gap - Tj) <= tol;
    if (!alignedSeam) {
      continue;
    }
    const s = a.endOffsetMm;
    const p = pointAlongWallMm(sx, sy, ux, uy, s);

    const segments = epsNormalSegmentsForSipRegionMm(
      wall,
      project,
      a.startOffsetMm,
      a.endOffsetMm,
      offStart,
      offEnd,
      coreMid,
      bottomMm,
      plateT,
      vCoreMm,
      calc.lumberPieces,
    );

    let segIdx = 0;
    for (const [ta, tb] of segments) {
      const centerOff = (ta + tb) / 2;
      const wMm = tb - ta;
      if (wMm < EPS_SEGMENT_MIN_MM) {
        continue;
      }
      const cx = (p.x + nx * centerOff) * MM_TO_M;
      const cz = (-p.y + nz * centerOff) * MM_TO_M;
      out.push({
        reactKey: `${wall.id}-${calc.id}-sip-seam-${i}-${a.index}-${b.index}-n${segIdx}`,
        wallId: wall.id,
        calculationId: calc.id,
        source: "sip_seam",
        position: [cx, cy, cz],
        rotationY,
        width: wMm * MM_TO_M,
        height,
        depth: SIP_SEAM_DEPTH_MM * MM_TO_M,
        materialType: "eps",
      });
      segIdx++;
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
  const meta = piece.metadata as { openingId?: string; studSegment?: "top" | "middle" | "bottom" } | undefined;
  if (
    piece.orientation === "across_wall" &&
    (piece.role === "opening_left_stud" || piece.role === "opening_right_stud") &&
    meta?.openingId
  ) {
    const op = openingById(project, meta.openingId);
    if (op && op.wallId === wall.id) {
      const isDoor = op.kind === "door";
      const sill = op.kind === "window" ? (op.sillHeightMm ?? 0) : 0;
      const openTop = op.kind === "window" ? sill + op.heightMm : op.heightMm;
      const horT = plateT;
      const len = piece.lengthMm;
      const midCenter = isDoor ? bottomMm + plateT + len / 2 : bottomMm + sill + len / 2;
      const topCenter = isDoor
        ? bottomMm + plateT + openTop + horT + len / 2
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
          return bottomMm * MM_TO_M + plateT * MM_TO_M + op.heightMm * MM_TO_M + height / 2;
        }
        return bottomMm * MM_TO_M + sill * MM_TO_M + op.heightMm * MM_TO_M + height / 2;
      }
      return bottomMm * MM_TO_M + sillFromMeta * MM_TO_M - height / 2;
    }
  }
  return bottomMm * MM_TO_M + plateT * MM_TO_M + (vCoreMm * MM_TO_M) / 2;
}

/**
 * Торцевые швы досок (тонкие плоскости ⟂ оси стены), как у SIP-панелей — границы по длине вдоль стены.
 */
function lumberSeamSpecsForWall(
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
  const thinZ = LUMBER_SEAM_DEPTH_MM * MM_TO_M;
  const minAlong = Math.max(2 * LUMBER_SEAM_DEPTH_MM + 0.5, LUMBER_SEAM_MIN_ALONG_MM);
  const seen = new Set<string>();

  for (const piece of calc.lumberPieces) {
    /** Для стыковочных досок торцевые seam-накладки дают визуальный "мусор" и не несут полезной информации. */
    if (piece.role === "tee_joint_board" || piece.role === "corner_joint_board") {
      continue;
    }
    const zShift = alongShiftForPieceMm(piece);
    const s0 = Math.min(piece.startOffsetMm, piece.endOffsetMm) + zShift;
    const s1 = Math.max(piece.startOffsetMm, piece.endOffsetMm) + zShift;
    const along = s1 - s0;
    if (along < minAlong) {
      continue;
    }
    const st = piece.sectionThicknessMm;
    const sd = piece.sectionDepthMm;
    const cy = lumberPieceCenterYWorld(piece, wall, project, bottomMm, plateT, vCoreMm);

    let faceWidthM: number;
    let faceHeightM: number;
    if (piece.orientation === "across_wall") {
      faceWidthM = sd * MM_TO_M;
      faceHeightM = piece.lengthMm * MM_TO_M;
    } else {
      faceWidthM = sd * MM_TO_M;
      faceHeightM = st * MM_TO_M;
    }
    if (faceWidthM * 1000 < LUMBER_SEAM_MIN_FACE_MM || faceHeightM * 1000 < LUMBER_SEAM_MIN_FACE_MM) {
      continue;
    }

    const alongShiftMm = 0;
    for (let i = 0; i < 2; i++) {
      const s = (i === 0 ? s0 : s1) + alongShiftMm;
      const p = pointAlongWallMm(sx, sy, ux, uy, s);
      const cx = (p.x + nx * coreMid) * MM_TO_M;
      const cz = (-p.y + nz * coreMid) * MM_TO_M;
      const tag = i === 0 ? "a" : "b";
      const dedupeKey = [
        wall.id,
        Math.round(cx * 10000),
        Math.round(cy * 10000),
        Math.round(cz * 10000),
        Math.round(faceWidthM * 10000),
        Math.round(faceHeightM * 10000),
      ].join(":");
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      out.push({
        reactKey: `${wall.id}-${calc.id}-lumber-seam-${piece.id}-${tag}`,
        wallId: wall.id,
        calculationId: calc.id,
        source: "lumber_seam",
        pieceId: piece.id,
        position: [cx, cy, cz],
        rotationY,
        width: faceWidthM,
        height: faceHeightM,
        depth: thinZ,
        materialType: "wood",
      });
    }
  }

  return out;
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
        materialType: wood,
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
      materialType: wood,
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
  const seams = sipSeamSpecsForWall(
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
    offStart,
    offEnd,
    coreMid,
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
  const lumberSeams = lumberSeamSpecsForWall(
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
  return [...sip, ...lum, ...seams, ...lumberSeams];
}

export function buildCalculationSolidSpecsForProject(project: Project): readonly CalculationSolidSpec[] {
  const calcByWall = new Map(project.wallCalculations.map((c) => [c.wallId, c]));
  const out: CalculationSolidSpec[] = [];
  let sipCount = 0;
  let seamCount = 0;
  let lumberCount = 0;
  let lumberSeamCount = 0;
  for (const w of project.walls) {
    const calc = calcByWall.get(w.id);
    if (!calc) {
      continue;
    }
    const chunk = buildCalculationSolidSpecsForWall(w, project, calc);
    for (const s of chunk) {
      if (s.source === "sip") {
        sipCount++;
      } else if (s.source === "sip_seam") {
        seamCount++;
      } else if (s.source === "lumber") {
        lumberCount++;
      } else if (s.source === "lumber_seam") {
        lumberSeamCount++;
      }
    }
    out.push(...chunk);
  }
  if (import.meta.env.DEV && out.length > 0) {
    // eslint-disable-next-line no-console
    console.debug("[calc3d] meshes", {
      epsSegments: sipCount,
      sipSeams: seamCount,
      lumber: lumberCount,
      lumberSeams: lumberSeamCount,
    });
  }
  return out;
}
