import { snapWorldToGridAlignedToOrigin } from "../domain/projectOriginPlan";
import { floorBeamPlanQuadCornersMm } from "../domain/floorBeamGeometry";
import type { Project } from "../domain/project";
import { getProfileById } from "../domain/profileOps";
import {
  foundationStripOrthoRingFootprintContoursFromEntityMm,
  foundationStripSegmentFootprintQuadMm,
} from "../domain/foundationStripGeometry";
import { resolveWallProfileLayerStripsForWallVisualization } from "../domain/wallProfileLayers";
import {
  collectEntityCopySnapPointsForFullScene,
  foundationPileSnapPointsWorldMm,
  pickNearestStructuralTaggedSnapMm,
  snapTaggedPointsForFloorBeamEntity,
} from "../domain/entityCopySnapSystem";
import type { Point2D } from "./types";
import type { ViewportTransform } from "./viewportTransform";
import { worldToScreen } from "./viewportTransform";
import { layerIdsForSnapGeometry, wallStripQuadCornersMm } from "./snap2dPrimitives";
import { SNAP_EDGE_PX, SNAP_GRID_PX, SNAP_VERTEX_PX, type SnapResult2d, type SnapSettings2d } from "./snap2dTypes";

export {
  SNAP_EDGE_PX,
  SNAP_GRID_PX,
  SNAP_VERTEX_PX,
  type SnapKind,
  type SnapResult2d,
  type SnapSettings2d,
} from "./snap2dTypes";

export { layerIdsForSnapGeometry, wallStripQuadCornersMm } from "./snap2dPrimitives";

/** Слияние близких вершин плана (мм), чтобы не дублировать кандидатов на одном углу. */
const SNAP_VERTEX_MERGE_EPS_MM = 0.5;

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
    const strips = profile ? resolveWallProfileLayerStripsForWallVisualization(T, profile) : null;
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

/** Углы ленты фундамента, углы и центры свай (по слоям привязки). */
export function collectFoundationPlanVertexSnapCandidatesMm(
  project: Project,
  layerIds: ReadonlySet<string>,
  excludeFoundationPileId?: string,
): Point2D[] {
  const raw: Point2D[] = [];
  for (const fs of project.foundationStrips) {
    if (!layerIds.has(fs.layerId)) {
      continue;
    }
    if (fs.kind === "ortho_ring") {
      const { outer, inner } = foundationStripOrthoRingFootprintContoursFromEntityMm(fs);
      raw.push(...outer, ...inner);
      continue;
    }
    if (fs.kind === "footprint_poly") {
      raw.push(...fs.outerRingMm);
      for (const h of fs.holeRingsMm) {
        raw.push(...h);
      }
      continue;
    }
    const q = foundationStripSegmentFootprintQuadMm(
      fs.axisStart,
      fs.axisEnd,
      fs.outwardNormalX,
      fs.outwardNormalY,
      fs.sideOutMm,
      fs.sideInMm,
    );
    raw.push(...q);
  }
  for (const p of project.foundationPiles) {
    if (!layerIds.has(p.layerId)) {
      continue;
    }
    if (excludeFoundationPileId != null && p.id === excludeFoundationPileId) {
      continue;
    }
    const h = Math.max(p.capSizeMm, p.sizeMm) / 2;
    raw.push(
      { x: p.centerX - h, y: p.centerY - h },
      { x: p.centerX + h, y: p.centerY - h },
      { x: p.centerX + h, y: p.centerY + h },
      { x: p.centerX - h, y: p.centerY + h },
      { x: p.centerX, y: p.centerY },
    );
  }
  return dedupeVerticesMm(raw, SNAP_VERTEX_MERGE_EPS_MM);
}

/**
 * Унифицированная привязка: приоритет vertex → edge → grid; пороги в px.
 * Вершины — общий набор характерных точек плана (стены, профили, плиты, пересечения и т.д.).
 * Без viewport vertex/edge/grid по пикселям не считаются — возвращается raw.
 */
export function resolveSnap2d(input: {
  readonly rawWorldMm: Point2D;
  readonly viewport: ViewportTransform | null;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
  /** Исключить сваю из кандидатов привязки (перенос/копия этой сваи). */
  readonly excludeFoundationPileId?: string;
  /** Исключить балку из кандидатов привязки (перенос этой балки). */
  readonly excludeFloorBeamId?: string;
}): SnapResult2d {
  const { rawWorldMm, viewport, project, snapSettings, gridStepMm, excludeFoundationPileId, excludeFloorBeamId } =
    input;
  const raw = rawWorldMm;

  if (!viewport) {
    return { point: { x: raw.x, y: raw.y }, kind: "none" };
  }

  const layerIds = layerIdsForSnapGeometry(project);
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  const planLines = project.planLines.filter((l) => layerIds.has(l.layerId));

  if (snapSettings.snapToVertex) {
    let tagged = collectEntityCopySnapPointsForFullScene(project, layerIds);
    const excludeEpsMm = 0.55;
    const nearExcluded = (w: Point2D, excluded: readonly Point2D[]) =>
      excluded.some((e) => Math.hypot(w.x - e.x, w.y - e.y) <= excludeEpsMm);
    if (excludeFoundationPileId != null) {
      const pile = project.foundationPiles.find((p) => p.id === excludeFoundationPileId);
      if (pile && layerIds.has(pile.layerId)) {
        const h = Math.max(pile.capSizeMm, pile.sizeMm) / 2;
        const exc = foundationPileSnapPointsWorldMm(pile.centerX, pile.centerY, h).map((x) => x.world);
        tagged = tagged.filter((tp) => !nearExcluded(tp.world, exc));
      }
    }
    if (excludeFloorBeamId != null) {
      const beam = project.floorBeams.find((b) => b.id === excludeFloorBeamId);
      if (beam && layerIds.has(beam.layerId)) {
        const exc = snapTaggedPointsForFloorBeamEntity(project, beam).map((x) => x.world);
        tagged = tagged.filter((tp) => !nearExcluded(tp.world, exc));
      }
    }
    const hit = pickNearestStructuralTaggedSnapMm(raw, viewport, tagged, SNAP_VERTEX_PX);
    if (hit) {
      return { point: hit.point, kind: hit.snapKind };
    }
  }

  let bestEdge: {
    readonly point: Point2D;
    readonly dist: number;
    readonly wallId?: string;
    readonly planLineId?: string;
  } | null = null;

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
    for (const pl of planLines) {
      const { point: q, t } = closestPointOnSegment(raw, pl.start, pl.end);
      if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
        continue;
      }
      const d = screenDistancePx(raw, q, viewport);
      if (d <= SNAP_EDGE_PX && (!bestEdge || d < bestEdge.dist)) {
        bestEdge = { point: { x: q.x, y: q.y }, dist: d, planLineId: pl.id };
      }
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
          if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
            continue;
          }
          const d = screenDistancePx(raw, q, viewport);
          if (d <= SNAP_EDGE_PX && (!bestEdge || d < bestEdge.dist)) {
            bestEdge = { point: { x: q.x, y: q.y }, dist: d };
          }
        }
      }
    }
    for (const pile of project.foundationPiles) {
      if (!layerIds.has(pile.layerId)) {
        continue;
      }
      if (excludeFoundationPileId != null && pile.id === excludeFoundationPileId) {
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
        if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
          continue;
        }
        const d = screenDistancePx(raw, q, viewport);
        if (d <= SNAP_EDGE_PX && (!bestEdge || d < bestEdge.dist)) {
          bestEdge = { point: { x: q.x, y: q.y }, dist: d };
        }
      }
    }
    for (const beam of project.floorBeams) {
      if (!layerIds.has(beam.layerId)) {
        continue;
      }
      if (excludeFloorBeamId != null && beam.id === excludeFloorBeamId) {
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
        if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
          continue;
        }
        const d = screenDistancePx(raw, qq, viewport);
        if (d <= SNAP_EDGE_PX && (!bestEdge || d < bestEdge.dist)) {
          bestEdge = { point: { x: qq.x, y: qq.y }, dist: d };
        }
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
        if (t <= ENDPOINT_EPS || t >= 1 - ENDPOINT_EPS) {
          continue;
        }
        const d = screenDistancePx(raw, q, viewport);
        if (d <= SNAP_EDGE_PX && (!bestEdge || d < bestEdge.dist)) {
          bestEdge = { point: { x: q.x, y: q.y }, dist: d };
        }
      }
    }
    if (bestEdge) {
      return {
        point: bestEdge.point,
        kind: "edge",
        wallId: bestEdge.wallId,
        planLineId: bestEdge.planLineId,
      };
    }
  }

  if (snapSettings.snapToGrid && Number.isFinite(gridStepMm) && gridStepMm > 0) {
    const g = snapWorldToGridAlignedToOrigin(raw, gridStepMm, project.projectOrigin);
    const d = screenDistancePx(raw, g, viewport);
    if (d <= SNAP_GRID_PX) {
      return { point: g, kind: "grid" };
    }
  }

  return { point: { x: raw.x, y: raw.y }, kind: "none" };
}
