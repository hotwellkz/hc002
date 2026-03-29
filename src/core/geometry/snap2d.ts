import type { Project } from "../domain/project";
import type { Point2D } from "./types";
import type { ViewportTransform } from "./viewportTransform";
import { worldToScreen } from "./viewportTransform";

/** Пороги в экранных пикселях (стабильны при zoom). */
export const SNAP_VERTEX_PX = 12;
export const SNAP_EDGE_PX = 10;
export const SNAP_GRID_PX = 8;

export type SnapKind = "vertex" | "edge" | "grid" | "none";

export interface SnapSettings2d {
  readonly snapToVertex: boolean;
  readonly snapToEdge: boolean;
  readonly snapToGrid: boolean;
}

export interface SnapResult2d {
  readonly point: Point2D;
  readonly kind: SnapKind;
  /** Стена, к кромке которой привязались (edge). */
  readonly wallId?: string;
}

/** Слои, по геометрии которых разрешена привязка: активный + видимые контекстные. */
export function layerIdsForSnapGeometry(project: Project): ReadonlySet<string> {
  const ids = new Set<string>([project.activeLayerId]);
  for (const id of project.visibleLayerIds) {
    ids.add(id);
  }
  return ids;
}

function screenDistancePx(a: Point2D, b: Point2D, t: ViewportTransform): number {
  const sa = worldToScreen(a.x, a.y, t);
  const sb = worldToScreen(b.x, b.y, t);
  return Math.hypot(sb.x - sa.x, sb.y - sa.y);
}

/** Ближайшая точка на отрезке [a,b] и параметр t∈[0,1]. */
export function closestPointOnSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D,
): { readonly point: Point2D; readonly t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-18) {
    return { point: { x: a.x, y: a.y }, t: 0 };
  }
  let u = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  u = Math.max(0, Math.min(1, u));
  return {
    point: { x: a.x + u * abx, y: a.y + u * aby },
    t: u,
  };
}

const ENDPOINT_EPS = 1e-5;

/**
 * Унифицированная привязка: приоритет vertex → edge → grid; пороги в px.
 * Без viewport vertex/edge/grid по пикселям не считаются — возвращается raw.
 */
export function resolveSnap2d(input: {
  readonly rawWorldMm: Point2D;
  readonly viewport: ViewportTransform | null;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
}): SnapResult2d {
  const { rawWorldMm, viewport, project, snapSettings, gridStepMm } = input;
  const raw = rawWorldMm;

  if (!viewport) {
    return { point: { x: raw.x, y: raw.y }, kind: "none" };
  }

  const layerIds = layerIdsForSnapGeometry(project);
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));

  /** Лучший кандидат в категории: минимальная экранная дистанция. */
  let bestVertex: { readonly point: Point2D; readonly dist: number } | null = null;

  if (snapSettings.snapToVertex) {
    for (const w of walls) {
      for (const pt of [w.start, w.end]) {
        const d = screenDistancePx(raw, pt, viewport);
        if (d <= SNAP_VERTEX_PX && (!bestVertex || d < bestVertex.dist)) {
          bestVertex = { point: { x: pt.x, y: pt.y }, dist: d };
        }
      }
    }
    if (project.projectOrigin) {
      const o = project.projectOrigin;
      const d = screenDistancePx(raw, o, viewport);
      if (d <= SNAP_VERTEX_PX && (!bestVertex || d < bestVertex.dist)) {
        bestVertex = { point: { x: o.x, y: o.y }, dist: d };
      }
    }
    if (bestVertex) {
      return { point: bestVertex.point, kind: "vertex" };
    }
  }

  let bestEdge: { readonly point: Point2D; readonly dist: number; readonly wallId: string } | null = null;

  if (snapSettings.snapToEdge) {
    for (const w of walls) {
      const { point: q, t } = closestPointOnSegment(raw, w.start, w.end);
      if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
        continue;
      }
      const d = screenDistancePx(raw, q, viewport);
      if (d <= SNAP_EDGE_PX && (!bestEdge || d < bestEdge.dist)) {
        bestEdge = { point: { x: q.x, y: q.y }, dist: d, wallId: w.id };
      }
    }
    if (bestEdge) {
      return { point: bestEdge.point, kind: "edge", wallId: bestEdge.wallId };
    }
  }

  if (snapSettings.snapToGrid && Number.isFinite(gridStepMm) && gridStepMm > 0) {
    const gx = Math.round(raw.x / gridStepMm) * gridStepMm;
    const gy = Math.round(raw.y / gridStepMm) * gridStepMm;
    const g: Point2D = { x: gx, y: gy };
    const d = screenDistancePx(raw, g, viewport);
    if (d <= SNAP_GRID_PX) {
      return { point: g, kind: "grid" };
    }
  }

  return { point: { x: raw.x, y: raw.y }, kind: "none" };
}
