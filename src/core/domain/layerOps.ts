import { newEntityId } from "./ids";
import type { LayerDomain } from "./layerDomain";
import { editor2dPlanScopeToLayerDomain } from "./layerDomain";
import { normalizeLayer, type Layer } from "./layer";
import { normalizeVisibleLayerIds, removeLayerFromVisibleLayerIds } from "./layerVisibility";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";
import type { Editor2dPlanScope } from "./viewState";

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

export function sortLayersForDomain(project: Project, domain: LayerDomain): Layer[] {
  return sortLayersByOrder(project.layers).filter((l) => l.domain === domain);
}

/** Соседний слой того же раздела в порядке стека (снизу вверх). */
export function getAdjacentLayerIdInDomain(
  project: Project,
  layerId: string,
  which: "previous" | "next",
): string | null {
  const layer = getLayerById(project, layerId);
  if (!layer) {
    return null;
  }
  const list = sortLayersForDomain(project, layer.domain);
  const idx = list.findIndex((l) => l.id === layerId);
  if (idx < 0) {
    return null;
  }
  const j = which === "previous" ? idx - 1 : idx + 1;
  if (j < 0 || j >= list.length) {
    return null;
  }
  return list[j]!.id;
}

/**
 * Перестановка только среди слоёв одного раздела (orderIndex меняется местами у пары в этом разделе).
 * `direction` совпадает с {@link reorderLayerRelative}: "up" — к меньшему индексу в общем стеке.
 */
export function reorderLayerRelativeInDomain(
  project: Project,
  layerId: string,
  direction: "up" | "down",
): Project {
  const sorted = sortLayersByOrder(project.layers);
  const layer = getLayerById(project, layerId);
  if (!layer) {
    return project;
  }
  const d = layer.domain;
  const domainSorted = sorted.filter((l) => l.domain === d);
  const pos = domainSorted.findIndex((l) => l.id === layerId);
  if (pos < 0) {
    return project;
  }
  const neighborPos = direction === "up" ? pos - 1 : pos + 1;
  if (neighborPos < 0 || neighborPos >= domainSorted.length) {
    return project;
  }
  const a = domainSorted[pos]!;
  const b = domainSorted[neighborPos]!;
  const oa = a.orderIndex;
  const ob = b.orderIndex;
  const t = nowIso();
  return touchProjectMeta({
    ...project,
    layers: project.layers.map((l) => {
      if (l.id === a.id) {
        return normalizeLayer({ ...l, orderIndex: ob, updatedAt: t });
      }
      if (l.id === b.id) {
        return normalizeLayer({ ...l, orderIndex: oa, updatedAt: t });
      }
      return l;
    }),
  });
}

/**
 * Если активный слой не из нужного раздела — переключает на первый слой этого раздела (по стеку).
 */
export function projectWithActiveLayerMatchingDomain(project: Project, domain: LayerDomain): Project | null {
  const active = getLayerById(project, project.activeLayerId);
  if (active?.domain === domain) {
    return project;
  }
  const inDomain = sortLayersForDomain(project, domain);
  if (inDomain.length === 0) {
    return null;
  }
  return setActiveLayerId(project, inDomain[0]!.id);
}

export function projectWithActiveLayerMatchingPlanScope(
  project: Project,
  scope: Editor2dPlanScope,
): Project | null {
  return projectWithActiveLayerMatchingDomain(project, editor2dPlanScopeToLayerDomain(scope));
}

export function createLayerInProject(
  project: Project,
  input: { readonly name: string; readonly elevationMm: number; readonly domain?: LayerDomain },
): Project {
  const sorted = sortLayersByOrder(project.layers);
  const maxOrder = sorted.length === 0 ? -1 : sorted[sorted.length - 1]!.orderIndex;
  const t = nowIso();
  const newLayer: Layer = normalizeLayer({
    id: newEntityId(),
    name: input.name,
    domain: input.domain ?? "floorPlan",
    orderIndex: maxOrder + 1,
    elevationMm: input.elevationMm,
    levelMode: "absolute",
    offsetFromBelowMm: 0,
    manualHeightMm: 0,
    isVisible: true,
    createdAt: t,
    updatedAt: t,
  });
  return touchProjectMeta({
    ...project,
    layers: [...project.layers, newLayer],
    activeLayerId: newLayer.id,
    visibleLayerIds: [...project.visibleLayerIds],
  });
}

export type LayerUpdatePatch = {
  readonly name?: string;
  readonly domain?: LayerDomain;
  readonly elevationMm?: number;
  readonly levelMode?: Layer["levelMode"];
  readonly offsetFromBelowMm?: number;
  readonly manualHeightMm?: number;
};

export function updateLayerInProject(project: Project, layerId: string, patch: LayerUpdatePatch): Project {
  const t = nowIso();
  return touchProjectMeta({
    ...project,
    layers: project.layers.map((l) =>
      l.id === layerId
        ? normalizeLayer({
            ...l,
            ...patch,
            updatedAt: t,
          })
        : l,
    ),
  });
}

/**
 * Переставить слой в стеке по целевому индексу в списке снизу вверх (0 = самый нижний).
 */
export function moveLayerToStackPosition(project: Project, layerId: string, targetSortedIndex: number): Project {
  const sorted = sortLayersByOrder(project.layers);
  const idx = sorted.findIndex((l) => l.id === layerId);
  if (idx < 0) {
    return project;
  }
  const clamped = Math.max(0, Math.min(sorted.length - 1, Math.floor(targetSortedIndex)));
  if (clamped === idx) {
    return project;
  }
  const reordered = [...sorted];
  const [item] = reordered.splice(idx, 1);
  reordered.splice(clamped, 0, item!);
  const t = nowIso();
  const byId = new Map(reordered.map((l, i) => [l.id, normalizeLayer({ ...l, orderIndex: i, updatedAt: t })]));
  return touchProjectMeta({
    ...project,
    layers: project.layers.map((l) => byId.get(l.id) ?? l),
  });
}

/**
 * Перетаскивание в списке слоёв одного раздела: новый индекс в отфильтрованном по domain списке (0 = нижний в разделе).
 */
export function moveLayerToDomainSortedIndex(
  project: Project,
  layerId: string,
  newSortedIndexInDomain: number,
): Project {
  const sorted = sortLayersByOrder(project.layers);
  const layer = getLayerById(project, layerId);
  if (!layer) {
    return project;
  }
  const d = layer.domain;
  const domainList = sorted.filter((l) => l.domain === d);
  const oldI = domainList.findIndex((l) => l.id === layerId);
  if (oldI < 0) {
    return project;
  }
  const reord = [...domainList];
  const [item] = reord.splice(oldI, 1);
  const clamped = Math.max(0, Math.min(reord.length, Math.floor(newSortedIndexInDomain)));
  reord.splice(clamped, 0, item!);
  let di = 0;
  const merged = sorted.map((l) => (l.domain === d ? reord[di++]! : l));
  const t = nowIso();
  const byId = new Map(merged.map((l, i) => [l.id, normalizeLayer({ ...l, orderIndex: i, updatedAt: t })]));
  return touchProjectMeta({
    ...project,
    layers: project.layers.map((l) => byId.get(l.id) ?? l),
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
        return normalizeLayer({ ...l, orderIndex: ob, updatedAt: t });
      }
      if (l.id === b.id) {
        return normalizeLayer({ ...l, orderIndex: oa, updatedAt: t });
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
  const planLines = project.planLines.filter((l) => l.layerId !== layerId);
  const foundationStrips = project.foundationStrips.filter((s) => s.layerId !== layerId);
  const foundationPiles = project.foundationPiles.filter((p) => p.layerId !== layerId);
  const wallJoints = project.wallJoints.filter((j) => !wallIds.has(j.wallAId) && !wallIds.has(j.wallBId));
  const openings = project.openings.filter((o) => o.wallId == null || !wallIds.has(o.wallId));
  const openingFramingPieces = project.openingFramingPieces.filter((p) => !wallIds.has(p.wallId));
  const rooms = project.rooms.filter((r) => r.layerId !== layerId);
  const layersLeft = project.layers.filter((l) => l.id !== layerId);
  const sorted = sortLayersByOrder(layersLeft);
  const reindexed = sorted.map((l, i) => normalizeLayer({ ...l, orderIndex: i, updatedAt: nowIso() }));

  const pruned: Project = {
    ...project,
    layers: reindexed,
    walls,
    planLines,
    foundationStrips,
    foundationPiles,
    wallCalculations: project.wallCalculations.filter((c) => !wallIds.has(c.wallId)),
    wallJoints,
    openings,
    openingFramingPieces,
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
