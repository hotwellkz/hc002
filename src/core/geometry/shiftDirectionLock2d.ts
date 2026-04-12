/**
 * Режим Shift: фиксация произвольного направления второй точки, проекция курсора и snap-опор на луч.
 */

import { snapWorldToGridAlignedToOrigin } from "../domain/projectOriginPlan";
import type { Project } from "../domain/project";
import { applyWallDirectionAngleSnapToPoint } from "./wallDirectionAngleSnap";
import {
  lengthFromSnappedPointForWallLengthEdit,
  movingEndpointForLengthMm,
} from "../domain/wallLengthChangeGeometry";
import type { Point2D } from "./types";
import type { ViewportTransform } from "./viewportTransform";
import { worldToScreen } from "./viewportTransform";
import {
  closestPointOnSegment,
  layerIdsForSnapGeometry,
  resolveSnap2d,
  SNAP_GRID_PX,
  type SnapKind,
  type SnapResult2d,
  type SnapSettings2d,
} from "./snap2d";
import { collectEntityCopySnapPointsForFullScene } from "../domain/entityCopySnapSystem";
import { floorBeamPlanQuadCornersMm } from "../domain/floorBeamGeometry";
import {
  foundationStripOrthoRingFootprintContoursFromEntityMm,
  foundationStripSegmentFootprintQuadMm,
} from "../domain/foundationStripGeometry";
import { projectPointOntoRayForward, unitDirectionOrNull } from "./rayProjection2d";

export { projectPointOntoRayForward, unitDirectionOrNull } from "./rayProjection2d";

/** Порог в экранных пикселях для поиска опорной точки в режиме Shift-lock. */
export const SHIFT_LOCK_SNAP_SCREEN_PX = 14;

const ENDPOINT_EPS = 1e-5;

const SHIFT_LOCK_VERTEX_DEDUPE_MM = 0.5;

function screenDistancePx(a: Point2D, b: Point2D, t: ViewportTransform): number {
  const sa = worldToScreen(a.x, a.y, t);
  const sb = worldToScreen(b.x, b.y, t);
  return Math.hypot(sb.x - sa.x, sb.y - sa.y);
}

function dedupeVerticesShiftLockMm(points: readonly Point2D[], epsMm: number): Point2D[] {
  const out: Point2D[] = [];
  for (const p of points) {
    if (!out.some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= epsMm)) {
      out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

/** Все характерные точки плана (как у копирования сущностей), без сетки. */
function collectShiftLockVertexCandidatesMm(project: Project, layerIds: ReadonlySet<string>): Point2D[] {
  const raw: Point2D[] = [];
  const tagged = collectEntityCopySnapPointsForFullScene(project, layerIds);
  for (const tp of tagged) {
    if (tp.visual === "grid") {
      continue;
    }
    raw.push(tp.world);
  }
  return dedupeVerticesShiftLockMm(raw, SHIFT_LOCK_VERTEX_DEDUPE_MM);
}

export interface ShiftLockSnapHit {
  readonly point: Point2D;
  readonly kind: SnapKind;
}

/**
 * Опорная точка Q рядом с курсором: углы (стены + проёмы) → ребро стены → сетка (если включена).
 * Вершины ищутся всегда, независимо от snapToVertex — для UX Shift-lock.
 */
export function findShiftLockSnapHit(input: {
  readonly rawWorldMm: Point2D;
  readonly viewport: ViewportTransform;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
}): ShiftLockSnapHit | null {
  const { rawWorldMm, viewport, project, snapSettings, gridStepMm } = input;
  const raw = rawWorldMm;
  const layerIds = layerIdsForSnapGeometry(project);
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  const planLines = project.planLines.filter((l) => layerIds.has(l.layerId));

  const vertices = collectShiftLockVertexCandidatesMm(project, layerIds);
  let bestVertex: { readonly point: Point2D; readonly dist: number } | null = null;
  for (const pt of vertices) {
    const d = screenDistancePx(raw, pt, viewport);
    if (d <= SHIFT_LOCK_SNAP_SCREEN_PX && (!bestVertex || d < bestVertex.dist)) {
      bestVertex = { point: { x: pt.x, y: pt.y }, dist: d };
    }
  }
  if (bestVertex) {
    return { point: bestVertex.point, kind: "vertex" };
  }

  const edgePx = SHIFT_LOCK_SNAP_SCREEN_PX;
  const edgeBest: { current: { readonly point: Point2D; readonly dist: number } | null } = { current: null };
  const considerEdge = (q: Point2D, t: number) => {
    if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
      return;
    }
    const d = screenDistancePx(raw, q, viewport);
    const prev = edgeBest.current;
    if (d <= edgePx && (!prev || d < prev.dist)) {
      edgeBest.current = { point: { x: q.x, y: q.y }, dist: d };
    }
  };
  for (const w of walls) {
    const { point: q, t } = closestPointOnSegment(raw, w.start, w.end);
    considerEdge(q, t);
  }
  for (const pl of planLines) {
    const { point: q, t } = closestPointOnSegment(raw, pl.start, pl.end);
    considerEdge(q, t);
  }
  for (const fs of project.foundationStrips) {
    if (!layerIds.has(fs.layerId)) {
      continue;
    }
    const quads =
      fs.kind === "ortho_ring"
        ? (() => {
            const { outer, inner } = foundationStripOrthoRingFootprintContoursFromEntityMm(fs);
            return [outer, inner] as const;
          })()
        : fs.kind === "footprint_poly"
          ? [fs.outerRingMm, ...fs.holeRingsMm]
          : [
              foundationStripSegmentFootprintQuadMm(
                fs.axisStart,
                fs.axisEnd,
                fs.outwardNormalX,
                fs.outwardNormalY,
                fs.sideOutMm,
                fs.sideInMm,
              ),
            ];
    for (const qd of quads) {
      for (let i = 0; i < qd.length; i++) {
        const a = qd[i]!;
        const b = qd[(i + 1) % qd.length]!;
        const { point: q, t } = closestPointOnSegment(raw, a, b);
        considerEdge(q, t);
      }
    }
  }
  for (const pile of project.foundationPiles) {
    if (!layerIds.has(pile.layerId)) {
      continue;
    }
    const h = pile.capSizeMm / 2;
    const c = { x: pile.centerX, y: pile.centerY };
    const quad: Point2D[] = [
      { x: c.x - h, y: c.y - h },
      { x: c.x + h, y: c.y - h },
      { x: c.x + h, y: c.y + h },
      { x: c.x - h, y: c.y + h },
    ];
    for (let i = 0; i < 4; i++) {
      const a = quad[i]!;
      const b = quad[(i + 1) % 4]!;
      const { point: q, t } = closestPointOnSegment(raw, a, b);
      considerEdge(q, t);
    }
  }
  for (const beam of project.floorBeams) {
    if (!layerIds.has(beam.layerId)) {
      continue;
    }
    const q = floorBeamPlanQuadCornersMm(project, beam);
    if (!q || q.length < 4) {
      continue;
    }
    for (let i = 0; i < 4; i += 1) {
      const a = q[i]!;
      const b = q[(i + 1) % 4]!;
      const { point: qq, t } = closestPointOnSegment(raw, a, b);
      considerEdge(qq, t);
    }
  }
  for (const slab of project.slabs) {
    if (!layerIds.has(slab.layerId)) {
      continue;
    }
    const ring = slab.pointsMm;
    const n = ring.length;
    if (n < 2) {
      continue;
    }
    for (let i = 0; i < n; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      const { point: q, t } = closestPointOnSegment(raw, a, b);
      considerEdge(q, t);
    }
  }
  if (edgeBest.current) {
    return { point: edgeBest.current.point, kind: "edge" };
  }

  if (snapSettings.snapToGrid && Number.isFinite(gridStepMm) && gridStepMm > 0) {
    const g = snapWorldToGridAlignedToOrigin(raw, gridStepMm, project.projectOrigin);
    const d = screenDistancePx(raw, g, viewport);
    if (d <= SNAP_GRID_PX) {
      return { point: g, kind: "grid" };
    }
  }

  return null;
}

/**
 * Направление фиксации при нажатии Shift: от опоры к текущему превью или к snap(курсор).
 */
export function computeShiftDirectionLockUnit(input: {
  readonly anchor: Point2D;
  readonly previewEnd: Point2D | null;
  readonly cursorWorldMm: Point2D;
  readonly viewport: ViewportTransform | null;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
  /** Подмена resolveSnap2d (например привязка инструмента «Стена» с режимом лево/право). */
  readonly resolveRawSnap?: (rawWorldMm: Point2D) => Point2D;
}): Point2D | null {
  const { anchor, previewEnd, cursorWorldMm, viewport, project, snapSettings, gridStepMm, resolveRawSnap } = input;
  let to = previewEnd;
  if (!to || Math.hypot(to.x - anchor.x, to.y - anchor.y) < 1e-3) {
    to = resolveRawSnap
      ? resolveRawSnap(cursorWorldMm)
      : resolveSnap2d({
          rawWorldMm: cursorWorldMm,
          viewport,
          project,
          snapSettings,
          gridStepMm,
        }).point;
  }
  return unitDirectionOrNull(anchor, to);
}

/** Поиск опорной точки Q для режима Shift-lock (по умолчанию — общий план). */
export type ShiftLockHitFinder = (input: {
  readonly rawWorldMm: Point2D;
  readonly viewport: ViewportTransform;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
}) => ShiftLockSnapHit | null;

export interface LinearSecondPointPreviewInput {
  readonly anchor: Point2D;
  readonly rawWorldMm: Point2D;
  readonly viewport: ViewportTransform | null;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
  /** Ненулевой единичный вектор направления, пока зажат Shift после фиксации. */
  readonly shiftDirectionLockUnit: Point2D | null;
  readonly angleSnapLockedDeg: number | null;
  readonly skipAngleSnap: boolean;
  readonly altKey?: boolean;
  /** Иначе {@link findShiftLockSnapHit}. */
  readonly shiftLockFindHit?: ShiftLockHitFinder;
  /**
   * Подмена базового snap (иначе {@link resolveSnap2d}).
   * Например инструмент «Плоскость крыши» — {@link resolveWallPlacementToolSnap} в режиме линейного профиля.
   */
  readonly resolvePrimarySnap?: (rawWorldMm: Point2D) => SnapResult2d;
}

export interface LinearSecondPointPreviewResult {
  readonly previewEnd: Point2D;
  readonly lastSnapKind: SnapKind;
  readonly angleSnapLockedDeg: number | null;
  readonly shiftLockReferenceMm: Point2D | null;
}

/**
 * Единая цепочка: обычный snap + при необходимости привязка к 45°/90°; при Shift-lock — проекция на луч.
 */
export function computeLinearSecondPointPreview(input: LinearSecondPointPreviewInput): LinearSecondPointPreviewResult {
  const {
    anchor,
    rawWorldMm,
    viewport,
    project,
    snapSettings,
    gridStepMm,
    shiftDirectionLockUnit,
    angleSnapLockedDeg,
    skipAngleSnap,
    altKey,
  } = input;

  const pickSnap = (raw: Point2D) =>
    input.resolvePrimarySnap
      ? input.resolvePrimarySnap(raw)
      : resolveSnap2d({ rawWorldMm: raw, viewport, project, snapSettings, gridStepMm });

  if (altKey) {
    const snap = pickSnap(rawWorldMm);
    return {
      previewEnd: snap.point,
      lastSnapKind: snap.kind,
      angleSnapLockedDeg: null,
      shiftLockReferenceMm: null,
    };
  }

  if (shiftDirectionLockUnit && viewport) {
    const finder = input.shiftLockFindHit ?? findShiftLockSnapHit;
    const hit = finder({
      rawWorldMm,
      viewport,
      project,
      snapSettings,
      gridStepMm,
    });
    const source = hit?.point ?? rawWorldMm;
    const projected = projectPointOntoRayForward(anchor, shiftDirectionLockUnit, source);
    return {
      previewEnd: projected,
      lastSnapKind: hit ? hit.kind : "none",
      angleSnapLockedDeg,
      shiftLockReferenceMm: hit ? hit.point : null,
    };
  }

  const snap = pickSnap(rawWorldMm);
  let previewEnd = snap.point;
  let nextAngleLocked = angleSnapLockedDeg;
  if (!skipAngleSnap) {
    const r = applyWallDirectionAngleSnapToPoint(anchor, previewEnd, nextAngleLocked, {});
    previewEnd = r.point;
    nextAngleLocked = r.nextLockedDeg;
  } else {
    nextAngleLocked = null;
  }
  return {
    previewEnd,
    lastSnapKind: snap.kind,
    angleSnapLockedDeg: nextAngleLocked,
    shiftLockReferenceMm: null,
  };
}

/**
 * Превью инструмента «Изменение длины»: без Shift — обычный resolveSnap2d + проекция на ось;
 * при Shift-lock — {@link findShiftLockSnapHit} + проекция опорной точки / сырого курсора на ось стены.
 */
export function computeLengthChangePreviewAlongAxis(input: {
  readonly fixedEndMm: Point2D;
  readonly axisUx: number;
  readonly axisUy: number;
  readonly rawWorldMm: Point2D;
  readonly viewport: ViewportTransform | null;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
  readonly shiftDirectionLockUnit: Point2D | null;
  readonly minLenMm: number;
  readonly altKey?: boolean;
}): {
  readonly previewMovingMm: Point2D;
  readonly lastSnapKind: SnapKind;
  readonly shiftLockReferenceMm: Point2D | null;
} {
  const {
    fixedEndMm,
    axisUx,
    axisUy,
    rawWorldMm,
    viewport,
    project,
    snapSettings,
    gridStepMm,
    shiftDirectionLockUnit,
    minLenMm,
    altKey,
  } = input;

  if (altKey || !shiftDirectionLockUnit || !viewport) {
    const snap = resolveSnap2d({ rawWorldMm, viewport, project, snapSettings, gridStepMm });
    const Lmm = lengthFromSnappedPointForWallLengthEdit(
      fixedEndMm,
      axisUx,
      axisUy,
      snap.point,
      minLenMm,
    );
    return {
      previewMovingMm: movingEndpointForLengthMm(fixedEndMm, axisUx, axisUy, Lmm),
      lastSnapKind: snap.kind,
      shiftLockReferenceMm: null,
    };
  }

  const hit = findShiftLockSnapHit({ rawWorldMm, viewport, project, snapSettings, gridStepMm });
  const source = hit?.point ?? rawWorldMm;
  const Lmm = lengthFromSnappedPointForWallLengthEdit(fixedEndMm, axisUx, axisUy, source, minLenMm);
  return {
    previewMovingMm: movingEndpointForLengthMm(fixedEndMm, axisUx, axisUy, Lmm),
    lastSnapKind: hit ? hit.kind : "none",
    shiftLockReferenceMm: hit ? hit.point : null,
  };
}
