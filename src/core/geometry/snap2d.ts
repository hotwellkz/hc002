import type { Project } from "../domain/project";
import { getProfileById } from "../domain/profileOps";
import { resolveWallProfileLayerStripsMm } from "../domain/wallProfileLayers";
import type { Point2D } from "./types";
import type { ViewportTransform } from "./viewportTransform";
import { worldToScreen } from "./viewportTransform";

/** Пороги в экранных пикселях (стабильны при zoom). */
export const SNAP_VERTEX_PX = 14;
export const SNAP_EDGE_PX = 10;
export const SNAP_GRID_PX = 8;

/** Слияние близких вершин плана (мм), чтобы не дублировать кандидатов на одном углу. */
const SNAP_VERTEX_MERGE_EPS_MM = 0.5;

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

/** Четыре угла полосы стены в плане (мм) — та же геометрия, что и в 2D-отрисовке. */
function wallStripQuadCornersMm(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  offStartMm: number,
  offEndMm: number,
): Point2D[] | null {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return null;
  }
  const px = -dy / len;
  const py = dx / len;
  return [
    { x: sx + px * offStartMm, y: sy + py * offStartMm },
    { x: ex + px * offStartMm, y: ey + py * offStartMm },
    { x: ex + px * offEndMm, y: ey + py * offEndMm },
    { x: sx + px * offEndMm, y: sy + py * offEndMm },
  ];
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

/**
 * Кандидаты для привязки «к углам»: вершины контуров полос профиля в плане + концы осевой линии + origin.
 * Не использовать только start/end оси — иначе теряются наружные/внутренние углы толстой стены.
 */
export function collectWallPlanVertexSnapCandidatesMm(project: Project, layerIds: ReadonlySet<string>): Point2D[] {
  const raw: Point2D[] = [];
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  for (const w of walls) {
    const sx = w.start.x;
    const sy = w.start.y;
    const ex = w.end.x;
    const ey = w.end.y;
    const T = w.thicknessMm;
    if (!Number.isFinite(T) || T <= 0) {
      continue;
    }
    raw.push({ x: sx, y: sy }, { x: ex, y: ey });
    const profile = w.profileId ? getProfileById(project, w.profileId) : undefined;
    const strips = profile ? resolveWallProfileLayerStripsMm(T, profile) : null;
    if (strips && strips.length > 0) {
      let acc = -T / 2;
      for (const strip of strips) {
        const off0 = acc;
        const off1 = acc + strip.thicknessMm;
        const q = wallStripQuadCornersMm(sx, sy, ex, ey, off0, off1);
        if (q) {
          raw.push(...q);
        }
        acc = off1;
      }
    } else {
      const q = wallStripQuadCornersMm(sx, sy, ex, ey, -T / 2, T / 2);
      if (q) {
        raw.push(...q);
      }
    }
  }
  if (project.projectOrigin) {
    const o = project.projectOrigin;
    raw.push({ x: o.x, y: o.y });
  }
  return dedupeVerticesMm(raw, SNAP_VERTEX_MERGE_EPS_MM);
}

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
    const vertexCandidates = collectWallPlanVertexSnapCandidatesMm(project, layerIds);
    for (const pt of vertexCandidates) {
      const d = screenDistancePx(raw, pt, viewport);
      if (d <= SNAP_VERTEX_PX && (!bestVertex || d < bestVertex.dist)) {
        bestVertex = { point: { x: pt.x, y: pt.y }, dist: d };
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
