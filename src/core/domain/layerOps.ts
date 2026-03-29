import { newEntityId } from "./ids";
import type { Layer } from "./layer";
import { normalizeVisibleLayerIds, removeLayerFromVisibleLayerIds } from "./layerVisibility";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";

function nowIso(): string {
  return new Date().toISOString();
}

export function sortLayersByOrder(layers: readonly Layer[]): Layer[] {
  return [...layers].sort((a, b) => a.orderIndex - b.orderIndex);
}

export function getLayerById(project: Project, id: string): Layer | undefined {
  return project.layers.find((l) => l.id === id);
}

export function canDeleteLayer(project: Project): boolean {
  return project.layers.length > 1;
}

export function getPreviousLayerId(project: Project): string | null {
  const sorted = sortLayersByOrder(project.layers);
  const i = sorted.findIndex((l) => l.id === project.activeLayerId);
  if (i <= 0) {
    return null;
  }
  return sorted[i - 1]?.id ?? null;
}

export function getNextLayerId(project: Project): string | null {
  const sorted = sortLayersByOrder(project.layers);
  const i = sorted.findIndex((l) => l.id === project.activeLayerId);
  if (i < 0 || i >= sorted.length - 1) {
    return null;
  }
  return sorted[i + 1]?.id ?? null;
}

export function createLayerInProject(
  project: Project,
  input: { readonly name: string; readonly elevationMm: number },
): Project {
  const sorted = sortLayersByOrder(project.layers);
  const maxOrder = sorted.length === 0 ? -1 : sorted[sorted.length - 1]!.orderIndex;
  const t = nowIso();
  const newLayer: Layer = {
    id: newEntityId(),
    name: input.name,
    orderIndex: maxOrder + 1,
    elevationMm: input.elevationMm,
    isVisible: true,
    createdAt: t,
    updatedAt: t,
  };
  return touchProjectMeta({
    ...project,
    layers: [...project.layers, newLayer],
    activeLayerId: newLayer.id,
    visibleLayerIds: [...project.visibleLayerIds],
  });
}

export function updateLayerInProject(
  project: Project,
  layerId: string,
  patch: { readonly name?: string; readonly elevationMm?: number },
): Project {
  const t = nowIso();
  return touchProjectMeta({
    ...project,
    layers: project.layers.map((l) =>
      l.id === layerId
        ? {
            ...l,
            ...patch,
            updatedAt: t,
          }
        : l,
    ),
  });
}

export function reorderLayerRelative(project: Project, layerId: string, direction: "up" | "down"): Project {
  const sorted = sortLayersByOrder(project.layers);
  const idx = sorted.findIndex((l) => l.id === layerId);
  if (idx < 0) {
    return project;
  }
  const j = direction === "up" ? idx - 1 : idx + 1;
  if (j < 0 || j >= sorted.length) {
    return project;
  }
  const a = sorted[idx]!;
  const b = sorted[j]!;
  const oa = a.orderIndex;
  const ob = b.orderIndex;
  const t = nowIso();
  return touchProjectMeta({
    ...project,
    layers: project.layers.map((l) => {
      if (l.id === a.id) {
        return { ...l, orderIndex: ob, updatedAt: t };
      }
      if (l.id === b.id) {
        return { ...l, orderIndex: oa, updatedAt: t };
      }
      return l;
    }),
  });
}

export function deleteLayerAndEntities(project: Project, layerId: string): Project | null {
  if (!canDeleteLayer(project)) {
    return null;
  }
  const sortedBefore = sortLayersByOrder(project.layers);
  const idx = sortedBefore.findIndex((l) => l.id === layerId);
  if (idx < 0) {
    return null;
  }

  let nextActive = project.activeLayerId;
  if (nextActive === layerId) {
    const prev = sortedBefore[idx - 1];
    const next = sortedBefore[idx + 1];
    nextActive = prev?.id ?? next?.id ?? sortedBefore.find((l) => l.id !== layerId)?.id ?? project.activeLayerId;
  }

  const wallIds = new Set(project.walls.filter((w) => w.layerId === layerId).map((w) => w.id));
  const walls = project.walls.filter((w) => w.layerId !== layerId);
  const openings = project.openings.filter((o) => !wallIds.has(o.wallId));
  const rooms = project.rooms.filter((r) => r.layerId !== layerId);
  const layersLeft = project.layers.filter((l) => l.id !== layerId);
  const sorted = sortLayersByOrder(layersLeft);
  const reindexed = sorted.map((l, i) => ({ ...l, orderIndex: i, updatedAt: nowIso() }));

  const pruned: Project = {
    ...project,
    layers: reindexed,
    walls,
    openings,
    rooms,
    activeLayerId: nextActive,
  };
  return removeLayerFromVisibleLayerIds(pruned, layerId);
}

export function setActiveLayerId(project: Project, layerId: string): Project | null {
  if (!project.layers.some((l) => l.id === layerId)) {
    return null;
  }
  const next: Project = { ...project, activeLayerId: layerId };
  return touchProjectMeta({
    ...next,
    visibleLayerIds: [...normalizeVisibleLayerIds(next)],
  });
}
