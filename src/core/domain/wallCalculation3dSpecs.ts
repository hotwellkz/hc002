import { getLayerById } from "./layerOps";
import type { ProfileMaterialType } from "./profile";
import type { Project } from "./project";
import type { Wall } from "./wall";
import { subtractIntervalsFromRange } from "./wallCalculationIntervals";
import { boardCoreNormalOffsetsMm } from "./wallLumberBoard2dOffsets";
import type { LumberPiece, WallCalculationResult } from "./wallCalculation";

const MM_TO_M = 0.001;
const MIN_LEN_MM = 1;
/** Тонкая «визуальная» толщина шва панели вдоль стены (мм), без реального зазора. */
const SIP_SEAM_DEPTH_MM = 1.5;
/** Торцевые швы досок — чуть тоньше/слабее SIP, тот же принцип тонкого бокса. */
const LUMBER_SEAM_DEPTH_MM = 1.2;
/** Минимальная толщина EPS-сегмента (мм), чтобы не порождать пылинки. */
const EPS_SEGMENT_MIN_MM = 1.5;

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
  const nz = dxMm / lenMm;
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

/**
 * Внутри плоскости ядра по нормали от оси: вырезать объёмы вертикальных досок (across_wall),
 * пересекающих данную SIP-зону по длине стены и по высоте ядра.
 */
function epsNormalSegmentsForSipRegionMm(
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
    const z0 = Math.min(piece.startOffsetMm, piece.endOffsetMm);
    const z1 = Math.max(piece.startOffsetMm, piece.endOffsetMm);
    if (z1 <= sipS0 + 1e-3 || z0 >= sipS1 - 1e-3) {
      continue;
    }
    const pLo = bottomMm + plateT;
    const pHi = bottomMm + plateT + piece.lengthMm;
    if (pHi <= yLo + 1e-3 || pLo >= yHi - 1e-3) {
      continue;
    }
    const sd = piece.sectionDepthMm;
    const t0 = Math.max(offStart, coreMid - sd / 2);
    const t1 = Math.min(offEnd, coreMid + sd / 2);
    if (t1 - t0 > 1e-3) {
      cuts.push([t0, t1]);
    }
  }
  return subtractIntervalsFromBase(offStart, offEnd, cuts);
}

function sipSpecsForWall(
  wall: Wall,
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
  const cy = bottomMm * MM_TO_M + plateT * MM_TO_M + (vCoreMm * MM_TO_M) / 2;

  for (const r of calc.sipRegions) {
    const s0 = r.startOffsetMm;
    const s1 = r.endOffsetMm;
    const sMid = (s0 + s1) / 2;
    const p = pointAlongWallMm(sx, sy, ux, uy, sMid);
    const depth = (s1 - s0) * MM_TO_M;
    const height = vCoreMm * MM_TO_M;

    const segments = epsNormalSegmentsForSipRegionMm(
      s0,
      s1,
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
      const cz = (p.y + nz * centerOff) * MM_TO_M;
      out.push({
        reactKey: `${wall.id}-${calc.id}-sip-${r.index}-${segIdx}`,
        wallId: wall.id,
        calculationId: calc.id,
        source: "sip",
        position: [cx, cy, cz],
        rotationY,
        width: wMm * MM_TO_M,
        height,
        depth,
        materialType: "eps",
      });
      segIdx++;
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
    if (Math.abs(gap - Tj) > tol) {
      continue;
    }
    const s = a.endOffsetMm;
    const p = pointAlongWallMm(sx, sy, ux, uy, s);

    const segments = epsNormalSegmentsForSipRegionMm(
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
      const cz = (p.y + nz * centerOff) * MM_TO_M;
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
  if (piece.orientation === "across_wall") {
    const height = piece.lengthMm * MM_TO_M;
    return bottomMm * MM_TO_M + plateT * MM_TO_M + height / 2;
  }
  const st = piece.sectionThicknessMm;
  const height = st * MM_TO_M;
  const meta = piece.metadata as { openingId?: string } | undefined;
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
      if (piece.role === "opening_header") {
        return bottomMm * MM_TO_M + sill * MM_TO_M + op.heightMm * MM_TO_M - height / 2;
      }
      return bottomMm * MM_TO_M + sill * MM_TO_M + height / 2;
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
  const minAlong = 2 * LUMBER_SEAM_DEPTH_MM + 0.5;

  for (const piece of calc.lumberPieces) {
    const s0 = Math.min(piece.startOffsetMm, piece.endOffsetMm);
    const s1 = Math.max(piece.startOffsetMm, piece.endOffsetMm);
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

    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? s0 : s1;
      const p = pointAlongWallMm(sx, sy, ux, uy, s);
      const cx = (p.x + nx * coreMid) * MM_TO_M;
      const cz = (p.y + nz * coreMid) * MM_TO_M;
      const tag = i === 0 ? "a" : "b";
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
    const sMid = (piece.startOffsetMm + piece.endOffsetMm) / 2;
    const p = pointAlongWallMm(sx, sy, ux, uy, sMid);
    const along = Math.max(1e-3, piece.endOffsetMm - piece.startOffsetMm);
    const st = piece.sectionThicknessMm;
    const sd = piece.sectionDepthMm;

    if (piece.orientation === "across_wall") {
      const width = sd * MM_TO_M;
      const depth = along * MM_TO_M;
      const height = piece.lengthMm * MM_TO_M;
      const cx = (p.x + nx * coreMid) * MM_TO_M;
      const cz = (p.y + nz * coreMid) * MM_TO_M;
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

    /** Верхняя/нижняя обвязка: разрезать по проёмам, чтобы не проходить через отверстие. */
    if (
      piece.orientation === "along_wall" &&
      (piece.role === "upper_plate" || piece.role === "lower_plate")
    ) {
      const s0 = Math.min(piece.startOffsetMm, piece.endOffsetMm);
      const s1 = Math.max(piece.startOffsetMm, piece.endOffsetMm);
      const blocks = project.openings
        .filter(
          (o): o is typeof o & { offsetFromStartMm: number } =>
            o.wallId === wall.id && o.offsetFromStartMm != null,
        )
        .map((o) => ({ lo: o.offsetFromStartMm, hi: o.offsetFromStartMm + o.widthMm }));
      const segs = subtractIntervalsFromRange(s0, s1, blocks);
      let segIdx = 0;
      for (const [a, b] of segs) {
        const alongSeg = b - a;
        if (alongSeg < 1e-3) {
          continue;
        }
        const sMid = (a + b) / 2;
        const pSeg = pointAlongWallMm(sx, sy, ux, uy, sMid);
        const depthSeg = alongSeg * MM_TO_M;
        const widthSeg = sd * MM_TO_M;
        const heightSeg = st * MM_TO_M;
        const cx = (pSeg.x + nx * coreMid) * MM_TO_M;
        const cz = (pSeg.y + nz * coreMid) * MM_TO_M;
        const cy = lumberPieceCenterYWorld(piece, wall, project, bottomMm, plateT, vCoreMm);
        out.push({
          reactKey: `${wall.id}-${piece.id}-seg${segIdx}`,
          wallId: wall.id,
          calculationId: calc.id,
          source: "lumber",
          pieceId: piece.id,
          position: [cx, cy, cz],
          rotationY,
          width: widthSeg,
          height: heightSeg,
          depth: depthSeg,
          materialType: wood,
        });
        segIdx += 1;
      }
      continue;
    }

    /** along_wall: плита/перемычка — длинный размер вдоль стены (Z), тонкий по Y. */
    const depth = along * MM_TO_M;
    const width = sd * MM_TO_M;
    const height = st * MM_TO_M;
    const cx = (p.x + nx * coreMid) * MM_TO_M;
    const cz = (p.y + nz * coreMid) * MM_TO_M;
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
  const dzM = (ey - sy) * MM_TO_M;
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
