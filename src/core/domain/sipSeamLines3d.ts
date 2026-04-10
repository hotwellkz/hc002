import { doorAlongWallOccupiedIntervalMm } from "./frameGklDoorAlongGeometry";
import { getLayerById } from "./layerOps";
import { openingSillLevelMm, openingTopLevelMmForShell } from "./doorGeometry";
import type { Opening } from "./opening";
import type { Project } from "./project";
import type { Wall } from "./wall";

function openingAlongSpanForSeamCutsMm(o: Opening, wall: Wall, project: Project): { readonly o0: number; readonly o1: number } {
  if (o.kind === "door" && o.offsetFromStartMm != null) {
    const iv = doorAlongWallOccupiedIntervalMm(o, wall, project);
    return { o0: iv.lo, o1: iv.hi };
  }
  return { o0: o.offsetFromStartMm ?? 0, o1: (o.offsetFromStartMm ?? 0) + o.widthMm };
}

const MM_TO_M = 0.001;

/** Отступ линии шва от номинальной наружной плоскости оболочки (мм), чтобы не теряться в z-fighting с OSB/EPS. */
export const SIP_SEAM_LINE_FACE_OFFSET_MM = 2.8;

function wallBottomElevationMm(wall: Wall, project: Project): number {
  if (wall.baseElevationMm != null && Number.isFinite(wall.baseElevationMm)) {
    return wall.baseElevationMm;
  }
  return getLayerById(project, wall.layerId)?.elevationMm ?? 0;
}

function subtractYIntervals(baseLo: number, baseHi: number, cuts: readonly { lo: number; hi: number }[]): [number, number][] {
  let segments: [number, number][] = [[baseLo, baseHi]];
  for (const c of cuts) {
    const next: [number, number][] = [];
    for (const [a, b] of segments) {
      if (c.hi <= a || c.lo >= b) {
        next.push([a, b]);
        continue;
      }
      if (a < c.lo) {
        next.push([a, Math.min(c.lo, b)]);
      }
      if (c.hi < b) {
        next.push([Math.max(c.hi, a), b]);
      }
    }
    segments = next.filter(([a, b]) => b - a > 1e-3);
  }
  return segments;
}

/**
 * Вертикальные отрезки стыков SIP/OSB на наружных гранях стены (мировые координаты, м).
 * Те же оси, что и wallMeshSpec / расчёт 3D: совпадает с логикой бывших боксов в ProjectWalls и с `sipSeamSpecsForWall` по положению шва вдоль стены.
 */
export interface SipSeamLineSegment3d {
  readonly key: string;
  readonly wallId: string;
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
}

/**
 * Стык между соседними SIP-зонами по расчёту: зазор 0 или толщина стыковочной доски (как `sipSeamSpecsForWall`).
 */
function isAlignedPanelSeamGapMm(gapMm: number, jointThicknessMm: number): boolean {
  const tol = 1.2;
  return Math.abs(gapMm) <= tol || Math.abs(gapMm - jointThicknessMm) <= tol;
}

export function buildSipSeamVerticalLineSegmentsForProject(project: Project): readonly SipSeamLineSegment3d[] {
  const out: SipSeamLineSegment3d[] = [];
  for (const calc of project.wallCalculations) {
    const wall = project.walls.find((w) => w.id === calc.wallId);
    if (!wall) {
      continue;
    }
    const sx = wall.start.x;
    const sy = wall.start.y;
    const ex = wall.end.x;
    const ey = wall.end.y;
    const dx = ex - sx;
    const dy = ey - sy;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) {
      continue;
    }
    const ux = dx / L;
    const uy = dy / L;
    const nx = -dy / L;
    const nz = -dx / L;
    const bottomMm = wallBottomElevationMm(wall, project);
    const jT = calc.settingsSnapshot.jointBoardThicknessMm;
    const regions = [...calc.sipRegions].sort((a, b) => a.startOffsetMm - b.startOffsetMm);
    const seamAlongSeen: number[] = [];

    const pushVerticalAt = (s: number, ySegments: readonly [number, number][], tag: string) => {
      seamAlongSeen.push(s);
      const px = sx + ux * s;
      const py = sy + uy * s;
      let yi = 0;
      for (const [y0, y1] of ySegments) {
        if (y1 - y0 < 1e-3) {
          continue;
        }
        const ya = (bottomMm + y0) * MM_TO_M;
        const yb = (bottomMm + y1) * MM_TO_M;
        for (const side of [-1, 1] as const) {
          const offMm = side * (wall.thicknessMm / 2 + SIP_SEAM_LINE_FACE_OFFSET_MM);
          const xm = (px + nx * offMm) * MM_TO_M;
          const zm = (-py + nz * offMm) * MM_TO_M;
          out.push({
            key: `${wall.id}-sip-seam-line-${tag}-${yi}-${side > 0 ? "p" : "n"}`,
            wallId: wall.id,
            a: [xm, ya, zm],
            b: [xm, yb, zm],
          });
        }
        yi++;
      }
    };

    for (let i = 0; i < regions.length - 1; i++) {
      const a = regions[i]!;
      const b = regions[i + 1]!;
      const gap = b.startOffsetMm - a.endOffsetMm;
      if (!isAlignedPanelSeamGapMm(gap, jT)) {
        continue;
      }
      const s = a.endOffsetMm;
      const cuts: { lo: number; hi: number }[] = [];
      for (const o of project.openings) {
        if (o.wallId !== wall.id || o.offsetFromStartMm == null) {
          continue;
        }
        const { o0, o1 } = openingAlongSpanForSeamCutsMm(o, wall, project);
        if (s <= o0 + 1e-3 || s >= o1 - 1e-3) {
          continue;
        }
        const sill = openingSillLevelMm(o);
        cuts.push({ lo: Math.max(0, sill), hi: Math.min(wall.heightMm, openingTopLevelMmForShell(o)) });
      }
      const ySegments = subtractYIntervals(0, wall.heightMm, cuts);
      pushVerticalAt(s, ySegments, `j-${i}`);
    }

    for (const o of project.openings) {
      if (o.wallId !== wall.id || o.offsetFromStartMm == null || (o.kind !== "window" && o.kind !== "door")) {
        continue;
      }
      const sill = openingSillLevelMm(o);
      const ySegs: [number, number][] = [];
      if (sill > 1e-3) {
        ySegs.push([0, Math.min(wall.heightMm, sill)]);
      }
      const top = openingTopLevelMmForShell(o);
      if (top < wall.heightMm - 1e-3) {
        ySegs.push([Math.max(0, top), wall.heightMm]);
      }
      const { o0: a0, o1: a1 } = openingAlongSpanForSeamCutsMm(o, wall, project);
      for (const s of [a0, a1]) {
        if (seamAlongSeen.some((v) => Math.abs(v - s) < 0.6)) {
          continue;
        }
        pushVerticalAt(s, ySegs, `op-${o.id}-${Math.round(s)}`);
      }
    }
  }
  return out;
}
