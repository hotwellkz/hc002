import { PROJECT_SCHEMA_VERSION, PROJECT_UNITS } from "./constants";
import type { Layer } from "./layer";
import type { Project } from "./project";
import type { ProjectMeta } from "./projectMeta";
import { normalizeProjectSettings } from "./settings";
import { newEntityId } from "./ids";

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyMeta(overrides?: Partial<Pick<ProjectMeta, "name">>): ProjectMeta {
  const t = nowIso();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newEntityId(),
    name: overrides?.name ?? "Новый проект",
    createdAt: t,
    updatedAt: t,
    units: PROJECT_UNITS,
  };
}

function createDefaultLayer(): { layer: Layer; layerId: string } {
  const layerId = newEntityId();
  const t = nowIso();
  const layer: Layer = {
    id: layerId,
    name: "Стены 1 эт",
    orderIndex: 0,
    elevationMm: 0,
    isVisible: true,
    createdAt: t,
    updatedAt: t,
  };
  return { layer, layerId };
}

export function createEmptyProject(): Project {
  const { layer, layerId } = createDefaultLayer();
  return {
    meta: createEmptyMeta(),
    projectOrigin: null,
    layers: [layer],
    activeLayerId: layerId,
    visibleLayerIds: [],
    walls: [],
    wallCalculations: [],
    wallJoints: [],
    openings: [],
    openingFramingPieces: [],
    rooms: [],
    foundation: { type: "none" },
    roof: { slopes: [] },
    materialSet: { id: newEntityId(), name: "По умолчанию" },
    sheets: [],
    dimensions: [],
    profiles: [],
    settings: normalizeProjectSettings({
      gridStepMm: 100,
      showGrid: true,
    }),
    viewState: {
      activeTab: "2d",
      viewport2d: {
        panXMm: 0,
        panYMm: 0,
        zoomPixelsPerMm: 0.15,
      },
      viewport3d: {
        polarAngle: Math.PI / 4,
        azimuthalAngle: Math.PI / 4,
        distance: 12_000,
        targetXMm: 0,
        targetYMm: 0,
        targetZMm: 1500,
      },
      rightPropertiesCollapsed: false,
      show3dProfileLayers: true,
      show2dProfileLayers: true,
      show3dCalculation: true,
      show3dLayerOsb: true,
      show3dLayerEps: true,
      show3dLayerFrame: true,
      show3dLayerWindows: true,
      show3dLayerDoors: true,
    },
  };
}

export function touchProjectMeta(project: Project): Project {
  return {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: new Date().toISOString(),
    },
  };
}
