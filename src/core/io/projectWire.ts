import { PROJECT_SCHEMA_VERSION, PROJECT_UNITS } from "../domain/constants";
import { normalizeVisibleLayerIds } from "../domain/layerVisibility";
import type { Project } from "../domain/project";
import type { ProjectMeta } from "../domain/projectMeta";

import { migrateWireV0ToProject } from "./migrateWireV0";

/**
 * Формат файла проекта v1: плоский корень + layers + activeLayerId.
 */
export interface ProjectFileV1 {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly units: "mm";
  readonly layers: Project["layers"];
  readonly activeLayerId: string;
  /** В старых файлах может отсутствовать — подставляется []. */
  readonly visibleLayerIds?: Project["visibleLayerIds"];
  readonly walls: Project["walls"];
  readonly openings: Project["openings"];
  readonly rooms: Project["rooms"];
  readonly foundation: Project["foundation"];
  readonly roof: Project["roof"];
  readonly materialSet: Project["materialSet"];
  readonly sheets: Project["sheets"];
  readonly dimensions: Project["dimensions"];
  readonly settings: Project["settings"];
  readonly viewState: Project["viewState"];
}

export function projectToWire(project: Project): ProjectFileV1 {
  const { meta, ...rest } = project;
  return {
    schemaVersion: meta.schemaVersion,
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    units: meta.units,
    ...rest,
  };
}

export function projectFromWireV1(wire: ProjectFileV1): Project {
  const meta: ProjectMeta = {
    schemaVersion: wire.schemaVersion,
    id: wire.id,
    name: wire.name,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
    units: PROJECT_UNITS,
  };
  if (wire.units !== PROJECT_UNITS) {
    throw new Error(`Ожидались единицы ${PROJECT_UNITS}`);
  }
  if (wire.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Неподдерживаемая schemaVersion: ${wire.schemaVersion}`);
  }
  if (!wire.layers.length) {
    throw new Error("Проект должен содержать хотя бы один слой");
  }
  if (!wire.layers.some((l) => l.id === wire.activeLayerId)) {
    throw new Error("activeLayerId не найден среди layers");
  }
  const visibleRaw = wire.visibleLayerIds ?? [];
  const base: Project = {
    meta,
    layers: wire.layers,
    activeLayerId: wire.activeLayerId,
    visibleLayerIds: visibleRaw,
    walls: wire.walls,
    openings: wire.openings,
    rooms: wire.rooms,
    foundation: wire.foundation,
    roof: wire.roof,
    materialSet: wire.materialSet,
    sheets: wire.sheets,
    dimensions: wire.dimensions,
    settings: wire.settings,
    viewState: wire.viewState,
  };
  return {
    ...base,
    visibleLayerIds: [...normalizeVisibleLayerIds(base)],
  };
}

export function projectFromWire(wire: ProjectFileV1 | Record<string, unknown>): Project {
  const o = wire as Record<string, unknown>;
  const sv = o["schemaVersion"];
  if (sv === 0) {
    return migrateWireV0ToProject(o);
  }
  if (sv === 1) {
    return projectFromWireV1(wire as ProjectFileV1);
  }
  throw new Error(`Неподдерживаемая schemaVersion: ${String(sv)}`);
}
