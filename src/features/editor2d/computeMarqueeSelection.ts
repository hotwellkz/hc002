import type { Project } from "@/core/domain/project";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import {
  foundationStripOrthoRingOuterBoundsMm,
  foundationStripSegmentFootprintQuadMm,
} from "@/core/domain/foundationStripGeometry";
import { openingCenterOnWallMm } from "@/core/domain/openingPlacement";
import {
  normalizeRectMmFromCorners,
  pointInRectMm,
  rectsIntersectMm,
  segmentBoundsMm,
} from "@/core/geometry/axisRect";
import { floorBeamPlanQuadCornersMm } from "@/core/domain/floorBeamGeometry";

/** Подбор id стен и проёмов, чья 2D-геометрия пересекает прямоугольник выделения (мм). */
export function computeMarqueeSelection(
  project: Project,
  worldX0: number,
  worldY0: number,
  worldX1: number,
  worldY1: number,
): string[] {
  const rect = normalizeRectMmFromCorners(worldX0, worldY0, worldX1, worldY1);
  const ids: string[] = [];

  for (const w of project.walls) {
    if (rectsIntersectMm(segmentBoundsMm(w.start, w.end), rect)) {
      ids.push(w.id);
    }
  }

  for (const o of project.openings) {
    const wall = project.walls.find((w) => w.id === o.wallId);
    if (!wall) {
      continue;
    }
    const p = openingCenterOnWallMm(wall, o);
    if (pointInRectMm(p, rect)) {
      ids.push(o.id);
    }
  }

  for (const ln of project.planLines) {
    if (rectsIntersectMm(segmentBoundsMm(ln.start, ln.end), rect)) {
      ids.push(ln.id);
    }
  }

  for (const bm of project.floorBeams) {
    const q = floorBeamPlanQuadCornersMm(project, bm);
    if (!q || q.length === 0) {
      continue;
    }
    let minX = q[0]!.x;
    let maxX = q[0]!.x;
    let minY = q[0]!.y;
    let maxY = q[0]!.y;
    for (const p of q) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    if (rectsIntersectMm({ minX, maxX, minY, maxY }, rect)) {
      ids.push(bm.id);
    }
  }

  for (const rp of project.roofPlanes) {
    const pts = roofPlanePolygonMm(rp);
    if (pts.length === 0) {
      continue;
    }
    let minX = pts[0]!.x;
    let maxX = pts[0]!.x;
    let minY = pts[0]!.y;
    let maxY = pts[0]!.y;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    if (rectsIntersectMm({ minX, maxX, minY, maxY }, rect)) {
      ids.push(rp.id);
    }
  }

  for (const sl of project.slabs) {
    const pts = sl.pointsMm;
    if (pts.length === 0) {
      continue;
    }
    let minX = pts[0]!.x;
    let maxX = pts[0]!.x;
    let minY = pts[0]!.y;
    let maxY = pts[0]!.y;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    if (rectsIntersectMm({ minX, maxX, minY, maxY }, rect)) {
      ids.push(sl.id);
    }
  }

  for (const pile of project.foundationPiles) {
    const h = Math.max(pile.capSizeMm, pile.sizeMm) / 2;
    const bb = {
      minX: pile.centerX - h,
      maxX: pile.centerX + h,
      minY: pile.centerY - h,
      maxY: pile.centerY + h,
    };
    if (rectsIntersectMm(bb, rect)) {
      ids.push(pile.id);
    }
  }

  for (const fs of project.foundationStrips) {
    const bb =
      fs.kind === "ortho_ring"
        ? foundationStripOrthoRingOuterBoundsMm(fs)
        : fs.kind === "footprint_poly"
          ? (() => {
              const loop = fs.outerRingMm;
              let minX = loop[0]!.x;
              let maxX = loop[0]!.x;
              let minY = loop[0]!.y;
              let maxY = loop[0]!.y;
              for (const p of loop) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
              }
              return { minX, maxX, minY, maxY };
            })()
          : (() => {
              const quad = foundationStripSegmentFootprintQuadMm(
                fs.axisStart,
                fs.axisEnd,
                fs.outwardNormalX,
                fs.outwardNormalY,
                fs.sideOutMm,
                fs.sideInMm,
              );
              let minX = quad[0]!.x;
              let maxX = quad[0]!.x;
              let minY = quad[0]!.y;
              let maxY = quad[0]!.y;
              for (const p of quad) {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
              }
              return { minX, maxX, minY, maxY };
            })();
    if (rectsIntersectMm(bb, rect)) {
      ids.push(fs.id);
    }
  }

  return ids;
}
