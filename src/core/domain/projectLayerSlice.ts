import { sortLayersByOrder } from "./layerOps";
import { normalizeVisibleLayerIds } from "./layerVisibility";
import type { Project } from "./project";

/** Дополнительные видимые слои (не активный), в порядке orderIndex — для отрисовки снизу вверх. */
export function sortedVisibleContextLayerIds(project: Project): readonly string[] {
  const normalized = normalizeVisibleLayerIds(project);
  const layers = sortLayersByOrder(project.layers);
  const order = new Map(layers.map((l) => [l.id, l.orderIndex]));
  return [...normalized].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** Сущности только активного слоя — для 2D-вида и выделения. */
export function narrowProjectToActiveLayer(project: Project): Project {
  return narrowProjectToLayerSet(project, new Set([project.activeLayerId]));
}

/** Сущности только указанных слоёв (для отрисовки контекста или активного). */
export function narrowProjectToLayerSet(project: Project, layerIds: ReadonlySet<string>): Project {
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  const wallIds = new Set(walls.map((w) => w.id));
  const openings = project.openings.filter((o) => o.wallId != null && wallIds.has(o.wallId));
  const openingFramingPieces = project.openingFramingPieces.filter((p) => wallIds.has(p.wallId));
  const rooms = project.rooms.filter((r) => layerIds.has(r.layerId));
  return {
    ...project,
    walls,
    openings,
    openingFramingPieces,
    rooms,
  };
}
