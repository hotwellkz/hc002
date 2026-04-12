import { snapWorldToGridAlignedToOrigin } from "../domain/projectOriginPlan";
import type { Project } from "../domain/project";
import { getProfileById } from "../domain/profileOps";
import { resolveWallProfileLayerStripsMm } from "../domain/wallProfileLayers";
import type { Wall } from "../domain/wall";
import type { FloorBeamEntity } from "../domain/floorBeam";
import {
  floorBeamCenterlineEndpointsMm,
  floorBeamOuterLongEdgeSegmentMm,
  floorBeamPlanQuadCornersMm,
} from "../domain/floorBeamGeometry";
import { isOpeningPlacedOnWall } from "../domain/opening";
import type { PlanLine } from "../domain/planLine";
import type { LinearProfilePlacementMode } from "./linearPlacementGeometry";
import type { Point2D } from "./types";
import type { ShiftLockSnapHit } from "./shiftDirectionLock2d";
import type { ViewportTransform } from "./viewportTransform";
import { worldToScreen } from "./viewportTransform";
import {
  closestPointOnSegment,
  layerIdsForSnapGeometry,
  type SnapResult2d,
  type SnapSettings2d,
  wallStripQuadCornersMm,
} from "./snap2d";

/** Пороги в CSS px — стабильны при зуме; чуть шире обычного snap2d для удобства «Добавить стену». */
export const WALL_PLACEMENT_VERTEX_PX = 16;
export const WALL_PLACEMENT_EDGE_PX = 14;
const WALL_PLACEMENT_GRID_PX = 10;

const ENDPOINT_EPS = 1e-5;
const VERT_MERGE_MM = 0.5;

/** При почти равном расстоянии до двух вершин/рёбер — отдать предпочтение активному слою (инструмент «Плоскость крыши»). */
const SNAP_LAYER_TIE_BREAK_PX = 1.35;

export type WallToolSnapLayerBias = "none" | "preferActive";

function vertexKeyMm(p: Point2D): string {
  const rx = Math.round(p.x * 1000) / 1000;
  const ry = Math.round(p.y * 1000) / 1000;
  return `${rx},${ry}`;
}

function activeLayerWallToolVertexKeys(
  project: Project,
  walls: readonly Wall[],
  floorBeams: readonly FloorBeamEntity[],
  planLines: readonly PlanLine[],
  face: "left" | "right" | null,
): ReadonlySet<string> {
  const aw = walls.filter((w) => w.layerId === project.activeLayerId);
  const ab = floorBeams.filter((b) => b.layerId === project.activeLayerId);
  const apl = planLines.filter((l) => l.layerId === project.activeLayerId);
  const vertsBase =
    face === null
      ? collectCenterModeVerticesMm(project, aw, ab)
      : collectFaceModeVerticesMm(project, aw, ab, face);
  const keys = new Set(vertsBase.map(vertexKeyMm));
  for (const pl of apl) {
    keys.add(vertexKeyMm(pl.start));
    keys.add(vertexKeyMm(pl.end));
  }
  return keys;
}

function activeLayerShiftLockVertexKeys(
  project: Project,
  walls: readonly Wall[],
  floorBeams: readonly FloorBeamEntity[],
  planLines: readonly PlanLine[],
  face: "left" | "right" | null,
): ReadonlySet<string> {
  const keys = new Set(activeLayerWallToolVertexKeys(project, walls, floorBeams, planLines, face));
  for (const o of project.openings) {
    if (!isOpeningPlacedOnWall(o)) {
      continue;
    }
    const wall = project.walls.find((w) => w.id === o.wallId);
    if (!wall || wall.layerId !== project.activeLayerId) {
      continue;
    }
    const q = openingSlotCornersMmForSnap(wall, o.offsetFromStartMm, o.widthMm);
    if (q) {
      for (const c of q) {
        keys.add(vertexKeyMm(c));
      }
    }
  }
  return keys;
}

function screenDistancePx(a: Point2D, b: Point2D, t: ViewportTransform): number {
  const sa = worldToScreen(a.x, a.y, t);
  const sb = worldToScreen(b.x, b.y, t);
  return Math.hypot(sb.x - sa.x, sb.y - sa.y);
}

function dedupeVerticesMm(points: readonly Point2D[], epsMm: number): Point2D[] {
  const out: Point2D[] = [];
  for (const p of points) {
    if (!out.some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= epsMm)) {
      out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

/** Вершины: оси стен + балки перекрытия + начало координат. */
function collectCenterModeVerticesMm(
  project: Project,
  walls: readonly Wall[],
  floorBeams: readonly FloorBeamEntity[],
): Point2D[] {
  const raw: Point2D[] = [];
  for (const w of walls) {
    raw.push({ x: w.start.x, y: w.start.y }, { x: w.end.x, y: w.end.y });
  }
  for (const b of floorBeams) {
    const e = floorBeamCenterlineEndpointsMm(project, b);
    if (e) {
      raw.push({ x: e.cs.x, y: e.cs.y }, { x: e.ce.x, y: e.ce.y });
    }
  }
  if (project.projectOrigin) {
    const o = project.projectOrigin;
    raw.push({ x: o.x, y: o.y });
  }
  return dedupeVerticesMm(raw, VERT_MERGE_MM);
}

/**
 * Для левого/правого режима — внешняя грань первой/последней полосы профиля (как в отрисовке).
 * Левая грань стены: первая полоса, off0; правая — последняя полоса, off1.
 */
function collectFaceModeVerticesMm(
  project: Project,
  walls: readonly Wall[],
  floorBeams: readonly FloorBeamEntity[],
  face: "left" | "right",
): Point2D[] {
  const raw: Point2D[] = [];
  for (const w of walls) {
    const sx = w.start.x;
    const sy = w.start.y;
    const ex = w.end.x;
    const ey = w.end.y;
    const T = w.thicknessMm;
    if (!Number.isFinite(T) || T <= 0) {
      continue;
    }
    const profile = w.profileId ? getProfileById(project, w.profileId) : undefined;
    const strips = profile ? resolveWallProfileLayerStripsMm(T, profile) : null;
    if (strips && strips.length > 0) {
      let acc = -T / 2;
      const n = strips.length;
      for (let i = 0; i < n; i++) {
        const strip = strips[i]!;
        const off0 = acc;
        const off1 = acc + strip.thicknessMm;
        const pick =
          (face === "left" && i === 0) || (face === "right" && i === n - 1);
        if (pick) {
          const q = wallStripQuadCornersMm(sx, sy, ex, ey, off0, off1);
          if (q) {
            raw.push(...q);
          }
        }
        acc = off1;
      }
    } else {
      const q = wallStripQuadCornersMm(sx, sy, ex, ey, -T / 2, T / 2);
      if (q) {
        if (face === "left") {
          raw.push(q[0]!, q[1]!);
        } else {
          raw.push(q[2]!, q[3]!);
        }
      }
    }
  }
  for (const b of floorBeams) {
    const q = floorBeamPlanQuadCornersMm(project, b);
    if (!q || q.length !== 4) {
      continue;
    }
    if (face === "left") {
      raw.push(q[0]!, q[1]!);
    } else {
      raw.push(q[3]!, q[2]!);
    }
  }
  return dedupeVerticesMm(raw, VERT_MERGE_MM);
}

function collectFaceModeEdgeSegmentsMm(
  walls: readonly Wall[],
  face: "left" | "right",
  project: Project,
  floorBeams: readonly FloorBeamEntity[],
): ReadonlyArray<{ readonly a: Point2D; readonly b: Point2D; readonly wallId: string }> {
  const segs: { a: Point2D; b: Point2D; wallId: string }[] = [];
  for (const w of walls) {
    const sx = w.start.x;
    const sy = w.start.y;
    const ex = w.end.x;
    const ey = w.end.y;
    const T = w.thicknessMm;
    if (!Number.isFinite(T) || T <= 0) {
      continue;
    }
    const profile = w.profileId ? getProfileById(project, w.profileId) : undefined;
    const strips = profile ? resolveWallProfileLayerStripsMm(T, profile) : null;
    let off: number;
    if (strips && strips.length > 0) {
      if (face === "left") {
        off = -T / 2;
      } else {
        let acc = -T / 2;
        for (const strip of strips) {
          acc += strip.thicknessMm;
        }
        off = acc;
      }
    } else {
      off = face === "left" ? -T / 2 : T / 2;
    }
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      continue;
    }
    const px = -dy / len;
    const py = dx / len;
    const a = { x: sx + px * off, y: sy + py * off };
    const b = { x: ex + px * off, y: ey + py * off };
    segs.push({ a, b, wallId: w.id });
  }
  for (const b of floorBeams) {
    const seg = floorBeamOuterLongEdgeSegmentMm(project, b, face);
    if (seg) {
      segs.push({ a: seg.a, b: seg.b, wallId: b.id });
    }
  }
  return segs;
}

/**
 * Привязка для инструмента «Добавить стену»: учитывает режим по центру / левому / правому краю.
 * Приоритет: вершина (угол или торец в смысле режима) → отрезок грани/оси → сетка.
 */
export function resolveWallPlacementToolSnap(input: {
  readonly rawWorldMm: Point2D;
  readonly viewport: ViewportTransform | null;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
  readonly linearPlacementMode: LinearProfilePlacementMode;
  /** При равенстве расстояний — предпочесть вершину/ребро активного слоя (плоскость крыши и контекстные слои). */
  readonly snapLayerBias?: WallToolSnapLayerBias;
}): SnapResult2d {
  const { rawWorldMm, viewport, project, snapSettings, gridStepMm, linearPlacementMode, snapLayerBias } = input;
  const bias = snapLayerBias ?? "none";
  const raw = rawWorldMm;

  if (!viewport) {
    return { point: { x: raw.x, y: raw.y }, kind: "none" };
  }

  const layerIds = layerIdsForSnapGeometry(project);
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  const floorBeams = project.floorBeams.filter((b) => layerIds.has(b.layerId));
  const planLines = project.planLines.filter((l) => layerIds.has(l.layerId));

  const face: "left" | "right" | null =
    linearPlacementMode === "leftEdge" ? "left" : linearPlacementMode === "rightEdge" ? "right" : null;

  /** 1) Вершины */
  if (snapSettings.snapToVertex) {
    const vertsBase =
      face === null
        ? collectCenterModeVerticesMm(project, walls, floorBeams)
        : collectFaceModeVerticesMm(project, walls, floorBeams, face);
    const plVerts: Point2D[] = [];
    for (const pl of planLines) {
      plVerts.push(pl.start, pl.end);
    }
    const verts = dedupeVerticesMm([...vertsBase, ...plVerts], VERT_MERGE_MM);

    const activeKeys =
      bias === "preferActive"
        ? activeLayerWallToolVertexKeys(project, walls, floorBeams, planLines, face)
        : null;

    let bestV: { readonly point: Point2D; readonly dist: number; readonly onActive: boolean } | null = null;
    for (const pt of verts) {
      const d = screenDistancePx(raw, pt, viewport);
      if (d > WALL_PLACEMENT_VERTEX_PX) {
        continue;
      }
      const onActive = activeKeys ? activeKeys.has(vertexKeyMm(pt)) : false;
      if (!bestV || d < bestV.dist - SNAP_LAYER_TIE_BREAK_PX) {
        bestV = { point: { x: pt.x, y: pt.y }, dist: d, onActive };
      } else if (
        bias === "preferActive" &&
        bestV &&
        Math.abs(d - bestV.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
        onActive &&
        !bestV.onActive
      ) {
        bestV = { point: { x: pt.x, y: pt.y }, dist: d, onActive };
      }
    }
    if (bestV) {
      return { point: bestV.point, kind: "vertex" };
    }
  }

  /** 2) Рёбра (ось или параллельная грань) */
  if (snapSettings.snapToEdge) {
    let bestE: {
      readonly point: Point2D;
      readonly dist: number;
      readonly wallId?: string;
      readonly planLineId?: string;
      readonly onActive: boolean;
    } | null = null;

    if (face === null) {
      for (const w of walls) {
        const { point: q, t } = closestPointOnSegment(raw, w.start, w.end);
        if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
          continue;
        }
        const d = screenDistancePx(raw, q, viewport);
        if (d > WALL_PLACEMENT_EDGE_PX) {
          continue;
        }
        const onActive = w.layerId === project.activeLayerId;
        if (!bestE || d < bestE.dist - SNAP_LAYER_TIE_BREAK_PX) {
          bestE = { point: { x: q.x, y: q.y }, dist: d, wallId: w.id, onActive };
        } else if (
          bias === "preferActive" &&
          bestE &&
          Math.abs(d - bestE.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
          onActive &&
          !bestE.onActive
        ) {
          bestE = { point: { x: q.x, y: q.y }, dist: d, wallId: w.id, onActive };
        }
      }
      for (const b of floorBeams) {
        const ends = floorBeamCenterlineEndpointsMm(project, b);
        if (!ends) {
          continue;
        }
        const { point: q, t } = closestPointOnSegment(raw, ends.cs, ends.ce);
        if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
          continue;
        }
        const d = screenDistancePx(raw, q, viewport);
        if (d > WALL_PLACEMENT_EDGE_PX) {
          continue;
        }
        const onActive = b.layerId === project.activeLayerId;
        if (!bestE || d < bestE.dist - SNAP_LAYER_TIE_BREAK_PX) {
          bestE = { point: { x: q.x, y: q.y }, dist: d, wallId: b.id, onActive };
        } else if (
          bias === "preferActive" &&
          bestE &&
          Math.abs(d - bestE.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
          onActive &&
          !bestE.onActive
        ) {
          bestE = { point: { x: q.x, y: q.y }, dist: d, wallId: b.id, onActive };
        }
      }
    } else {
      for (const seg of collectFaceModeEdgeSegmentsMm(walls, face, project, floorBeams)) {
        const { point: q, t } = closestPointOnSegment(raw, seg.a, seg.b);
        if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
          continue;
        }
        const d = screenDistancePx(raw, q, viewport);
        if (d > WALL_PLACEMENT_EDGE_PX) {
          continue;
        }
        const wall = walls.find((w0) => w0.id === seg.wallId);
        const beam = !wall ? floorBeams.find((b0) => b0.id === seg.wallId) : undefined;
        const onActive =
          (wall?.layerId === project.activeLayerId) || (beam?.layerId === project.activeLayerId);
        if (!bestE || d < bestE.dist - SNAP_LAYER_TIE_BREAK_PX) {
          bestE = { point: { x: q.x, y: q.y }, dist: d, wallId: seg.wallId, onActive };
        } else if (
          bias === "preferActive" &&
          bestE &&
          Math.abs(d - bestE.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
          onActive &&
          !bestE.onActive
        ) {
          bestE = { point: { x: q.x, y: q.y }, dist: d, wallId: seg.wallId, onActive };
        }
      }
    }

    for (const pl of planLines) {
      const { point: q, t } = closestPointOnSegment(raw, pl.start, pl.end);
      if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
        continue;
      }
      const d = screenDistancePx(raw, q, viewport);
      if (d > WALL_PLACEMENT_EDGE_PX) {
        continue;
      }
      const onActive = pl.layerId === project.activeLayerId;
      if (!bestE || d < bestE.dist - SNAP_LAYER_TIE_BREAK_PX) {
        bestE = { point: { x: q.x, y: q.y }, dist: d, planLineId: pl.id, onActive };
      } else if (
        bias === "preferActive" &&
        bestE &&
        Math.abs(d - bestE.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
        onActive &&
        !bestE.onActive
      ) {
        bestE = { point: { x: q.x, y: q.y }, dist: d, planLineId: pl.id, onActive };
      }
    }

    if (bestE) {
      return {
        point: bestE.point,
        kind: "edge",
        wallId: bestE.wallId,
        planLineId: bestE.planLineId,
      };
    }
  }

  /** 3) Сетка */
  if (snapSettings.snapToGrid && Number.isFinite(gridStepMm) && gridStepMm > 0) {
    const g = snapWorldToGridAlignedToOrigin(raw, gridStepMm, project.projectOrigin);
    const d = screenDistancePx(raw, g, viewport);
    if (d <= WALL_PLACEMENT_GRID_PX) {
      return { point: g, kind: "grid" };
    }
  }

  return { point: { x: raw.x, y: raw.y }, kind: "none" };
}

/** Углы проёма в плане (согласовано с openingPlanGeometry2d, inset=0). */
function openingSlotCornersMmForSnap(
  wall: Wall,
  leftAlongMm: number,
  openingWidthMm: number,
): Point2D[] | null {
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return null;
  }
  const ux = dx / len;
  const uy = dy / len;
  const T = wall.thicknessMm;
  const h = Math.max(0, T / 2);
  const w0 = leftAlongMm;
  const w1 = leftAlongMm + openingWidthMm;
  return [
    { x: sx + ux * w0 + uy * h, y: sy + uy * w0 - ux * h },
    { x: sx + ux * w1 + uy * h, y: sy + uy * w1 - ux * h },
    { x: sx + ux * w1 - uy * h, y: sy + uy * w1 + ux * h },
    { x: sx + ux * w0 - uy * h, y: sy + uy * w0 + ux * h },
  ];
}

/**
 * Snap для Shift-lock при постановке стены: те же категории кандидатов, что и {@link resolveWallPlacementToolSnap},
 * но вершины/рёбра ищутся всегда (пороги как у инструмента стены) + углы окон/дверей.
 */
export function findWallPlacementShiftLockSnapHit(input: {
  readonly rawWorldMm: Point2D;
  readonly viewport: ViewportTransform;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
  readonly linearPlacementMode: LinearProfilePlacementMode;
  readonly snapLayerBias?: WallToolSnapLayerBias;
}): ShiftLockSnapHit | null {
  const { rawWorldMm, viewport, project, snapSettings, gridStepMm, linearPlacementMode, snapLayerBias } = input;
  const bias = snapLayerBias ?? "none";
  const raw = rawWorldMm;

  const layerIds = layerIdsForSnapGeometry(project);
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  const floorBeamsSl = project.floorBeams.filter((b) => layerIds.has(b.layerId));
  const planLinesSl = project.planLines.filter((l) => layerIds.has(l.layerId));

  const face: "left" | "right" | null =
    linearPlacementMode === "leftEdge" ? "left" : linearPlacementMode === "rightEdge" ? "right" : null;

  const vertsBase =
    face === null
      ? collectCenterModeVerticesMm(project, walls, floorBeamsSl)
      : collectFaceModeVerticesMm(project, walls, floorBeamsSl, face);
  const verts: Point2D[] = [...vertsBase];
  for (const pl of planLinesSl) {
    verts.push(pl.start, pl.end);
  }
  for (const o of project.openings) {
    if (!isOpeningPlacedOnWall(o)) {
      continue;
    }
    const wall = project.walls.find((w) => w.id === o.wallId);
    if (!wall || !layerIds.has(wall.layerId)) {
      continue;
    }
    const q = openingSlotCornersMmForSnap(wall, o.offsetFromStartMm, o.widthMm);
    if (q) {
      verts.push(...q);
    }
  }

  const activeSlKeys =
    bias === "preferActive"
      ? activeLayerShiftLockVertexKeys(project, walls, floorBeamsSl, planLinesSl, face)
      : null;

  let bestV: { readonly point: Point2D; readonly dist: number; readonly onActive: boolean } | null = null;
  for (const pt of verts) {
    const d = screenDistancePx(raw, pt, viewport);
    if (d > WALL_PLACEMENT_VERTEX_PX) {
      continue;
    }
    const onActive = activeSlKeys ? activeSlKeys.has(vertexKeyMm(pt)) : false;
    if (!bestV || d < bestV.dist - SNAP_LAYER_TIE_BREAK_PX) {
      bestV = { point: { x: pt.x, y: pt.y }, dist: d, onActive };
    } else if (
      bias === "preferActive" &&
      bestV &&
      Math.abs(d - bestV.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
      onActive &&
      !bestV.onActive
    ) {
      bestV = { point: { x: pt.x, y: pt.y }, dist: d, onActive };
    }
  }
  if (bestV) {
    return { point: bestV.point, kind: "vertex" };
  }

  let bestE: { readonly point: Point2D; readonly dist: number; readonly onActive: boolean } | null = null;

  if (face === null) {
    for (const w of walls) {
      const { point: q, t } = closestPointOnSegment(raw, w.start, w.end);
      if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
        continue;
      }
      const d = screenDistancePx(raw, q, viewport);
      if (d > WALL_PLACEMENT_EDGE_PX) {
        continue;
      }
      const onActive = w.layerId === project.activeLayerId;
      if (!bestE || d < bestE.dist - SNAP_LAYER_TIE_BREAK_PX) {
        bestE = { point: { x: q.x, y: q.y }, dist: d, onActive };
      } else if (
        bias === "preferActive" &&
        bestE &&
        Math.abs(d - bestE.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
        onActive &&
        !bestE.onActive
      ) {
        bestE = { point: { x: q.x, y: q.y }, dist: d, onActive };
      }
    }
    for (const b of floorBeamsSl) {
      const ends = floorBeamCenterlineEndpointsMm(project, b);
      if (!ends) {
        continue;
      }
      const { point: q, t } = closestPointOnSegment(raw, ends.cs, ends.ce);
      if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
        continue;
      }
      const d = screenDistancePx(raw, q, viewport);
      if (d > WALL_PLACEMENT_EDGE_PX) {
        continue;
      }
      const onActive = b.layerId === project.activeLayerId;
      if (!bestE || d < bestE.dist - SNAP_LAYER_TIE_BREAK_PX) {
        bestE = { point: { x: q.x, y: q.y }, dist: d, onActive };
      } else if (
        bias === "preferActive" &&
        bestE &&
        Math.abs(d - bestE.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
        onActive &&
        !bestE.onActive
      ) {
        bestE = { point: { x: q.x, y: q.y }, dist: d, onActive };
      }
    }
  } else {
    for (const seg of collectFaceModeEdgeSegmentsMm(walls, face, project, floorBeamsSl)) {
      const { point: q, t } = closestPointOnSegment(raw, seg.a, seg.b);
      if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
        continue;
      }
      const d = screenDistancePx(raw, q, viewport);
      if (d > WALL_PLACEMENT_EDGE_PX) {
        continue;
      }
      const wall0 = walls.find((w0) => w0.id === seg.wallId);
      const beam0 = !wall0 ? floorBeamsSl.find((b0) => b0.id === seg.wallId) : undefined;
      const onActive =
        (wall0?.layerId === project.activeLayerId) || (beam0?.layerId === project.activeLayerId);
      if (!bestE || d < bestE.dist - SNAP_LAYER_TIE_BREAK_PX) {
        bestE = { point: { x: q.x, y: q.y }, dist: d, onActive };
      } else if (
        bias === "preferActive" &&
        bestE &&
        Math.abs(d - bestE.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
        onActive &&
        !bestE.onActive
      ) {
        bestE = { point: { x: q.x, y: q.y }, dist: d, onActive };
      }
    }
  }

  for (const pl of planLinesSl) {
    const { point: q, t } = closestPointOnSegment(raw, pl.start, pl.end);
    if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
      continue;
    }
    const d = screenDistancePx(raw, q, viewport);
    if (d > WALL_PLACEMENT_EDGE_PX) {
      continue;
    }
    const onActive = pl.layerId === project.activeLayerId;
    if (!bestE || d < bestE.dist - SNAP_LAYER_TIE_BREAK_PX) {
      bestE = { point: { x: q.x, y: q.y }, dist: d, onActive };
    } else if (
      bias === "preferActive" &&
      bestE &&
      Math.abs(d - bestE.dist) <= SNAP_LAYER_TIE_BREAK_PX &&
      onActive &&
      !bestE.onActive
    ) {
      bestE = { point: { x: q.x, y: q.y }, dist: d, onActive };
    }
  }

  if (bestE) {
    return { point: bestE.point, kind: "edge" };
  }

  if (snapSettings.snapToGrid && Number.isFinite(gridStepMm) && gridStepMm > 0) {
    const g = snapWorldToGridAlignedToOrigin(raw, gridStepMm, project.projectOrigin);
    const d = screenDistancePx(raw, g, viewport);
    if (d <= WALL_PLACEMENT_GRID_PX) {
      return { point: g, kind: "grid" };
    }
  }

  return null;
}
