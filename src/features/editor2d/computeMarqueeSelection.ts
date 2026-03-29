import type { Project } from "@/core/domain/project";
import { openingCenterOnWallMm } from "@/core/domain/openingPlacement";
import {
  normalizeRectMmFromCorners,
  pointInRectMm,
  rectsIntersectMm,
  segmentBoundsMm,
} from "@/core/geometry/axisRect";

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

  return ids;
}
