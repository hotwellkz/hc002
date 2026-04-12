import { normalizeVisibleLayerIds } from "../domain/layerVisibility";
import type { Project } from "../domain/project";
import type { Point2D } from "./types";

/**
 * Слои, по геометрии которых разрешена привязка на плане: совпадает с 2D-отрисовкой контекста.
 * Активный слой всегда; дополнительно — только записи из normalizeVisibleLayerIds (как «Видимость» в параметрах слоёв).
 * Контекстные слои с isVisible === false не участвуют (активный не отфильтровываем — редактирование).
 */
export function layerIdsForSnapGeometry(project: Project): ReadonlySet<string> {
  const ids = new Set<string>([project.activeLayerId]);
  for (const id of normalizeVisibleLayerIds(project)) {
    const layer = project.layers.find((l) => l.id === id);
    if (layer?.isVisible === false) {
      continue;
    }
    ids.add(id);
  }
  return ids;
}

/** Четыре угла полосы стены в плане (мм) — та же геометрия, что и в 2D-отрисовке. */
export function wallStripQuadCornersMm(
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
