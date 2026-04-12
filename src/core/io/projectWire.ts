import { PROJECT_SCHEMA_VERSION, PROJECT_UNITS } from "../domain/constants";
import { normalizeVisibleLayerIds } from "../domain/layerVisibility";
import type { Profile } from "../domain/profile";
import type { Project } from "../domain/project";
import type { WallJoint } from "../domain/wallJoint";
import type { ProjectMeta } from "../domain/projectMeta";
import { normalizeProjectSettings, type ProjectSettingsWire } from "../domain/settings";

import { normalizeViewState, projectWithViewport3dTargetAlignedToOriginIfDefault } from "../domain/viewState";

import { normalizeWallCalculationsInProject } from "../domain/wallCalculationNormalize";
import { normalizeSurfaceTextureState } from "../domain/surfaceTextureOps";
import { normalizeLayer, type Layer } from "../domain/layer";
import { migrateRoofProfileAssemblyWire } from "../domain/roofProfileAssembly";
import { migrateWireV0ToProject } from "./migrateWireV0";

/** schema v1: slopeDirection хранил направление выдавливания; в v2 — направление стока (инверсия). */
function migrateRoofPlanesSlopeSemanticsV1ToV2(roofPlanes: Project["roofPlanes"]): Project["roofPlanes"] {
  return roofPlanes.map((rp) => ({
    ...rp,
    slopeDirection: { x: -rp.slopeDirection.x, y: -rp.slopeDirection.y },
  }));
}

/** Старые проекты без markPrefix у профилей «стена». */
function normalizeProfilesImported(profiles: readonly Profile[]): Profile[] {
  return profiles.map((p) => {
    if (p.category === "roof") {
      return { ...p, roofAssembly: migrateRoofProfileAssemblyWire(p.roofAssembly) };
    }
    if (p.category !== "wall") {
      return p;
    }
    if (p.markPrefix != null && String(p.markPrefix).trim() !== "") {
      return p;
    }
    return { ...p, markPrefix: "W" };
  });
}

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
  /** В старых файлах может отсутствовать — null. */
  readonly projectOrigin?: Project["projectOrigin"];
  /** В старых файлах может отсутствовать — подставляется []. */
  readonly visibleLayerIds?: Project["visibleLayerIds"];
  readonly walls: Project["walls"];
  /** В старых файлах может отсутствовать — []. */
  readonly planLines?: Project["planLines"];
  readonly foundationStrips?: Project["foundationStrips"];
  readonly foundationPiles?: Project["foundationPiles"];
  readonly slabs?: Project["slabs"];
  readonly floorBeams?: Project["floorBeams"];
  readonly roofPlanes?: Project["roofPlanes"];
  readonly roofAssemblyCalculations?: Project["roofAssemblyCalculations"];
  /** В старых файлах может отсутствовать — []. */
  readonly wallCalculations?: Project["wallCalculations"];
  /** В старых файлах может отсутствовать — []. */
  readonly wallJoints?: readonly WallJoint[];
  readonly openings: Project["openings"];
  /** В старых файлах может отсутствовать — []. */
  readonly openingFramingPieces?: Project["openingFramingPieces"];
  readonly rooms: Project["rooms"];
  readonly foundation: Project["foundation"];
  readonly roof: Project["roof"];
  readonly materialSet: Project["materialSet"];
  readonly sheets: Project["sheets"];
  readonly dimensions: Project["dimensions"];
  readonly settings: Project["settings"];
  readonly viewState: Project["viewState"];
  readonly profiles?: Project["profiles"];
  readonly surfaceTextureState?: Project["surfaceTextureState"];
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
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: wire.id,
    name: wire.name,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
    units: PROJECT_UNITS,
  };
  if (wire.units !== PROJECT_UNITS) {
    throw new Error(`Ожидались единицы ${PROJECT_UNITS}`);
  }
  if (wire.schemaVersion !== 1 && wire.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Неподдерживаемая schemaVersion: ${wire.schemaVersion}`);
  }
  if (!wire.layers.length) {
    throw new Error("Проект должен содержать хотя бы один слой");
  }
  if (!wire.layers.some((l) => l.id === wire.activeLayerId)) {
    throw new Error("activeLayerId не найден среди layers");
  }
  const visibleRaw = wire.visibleLayerIds ?? [];
  let roofPlanes = wire.roofPlanes ?? [];
  if (wire.schemaVersion === 1) {
    roofPlanes = migrateRoofPlanesSlopeSemanticsV1ToV2(roofPlanes);
  }
  const base: Project = {
    meta,
    projectOrigin: wire.projectOrigin ?? null,
    layers: wire.layers.map((l) => normalizeLayer(l as Layer)),
    activeLayerId: wire.activeLayerId,
    visibleLayerIds: visibleRaw,
    walls: wire.walls,
    planLines: wire.planLines ?? [],
    foundationStrips: wire.foundationStrips ?? [],
    foundationPiles: wire.foundationPiles ?? [],
    slabs: wire.slabs ?? [],
    floorBeams: wire.floorBeams ?? [],
    roofPlanes,
    roofAssemblyCalculations: wire.roofAssemblyCalculations ?? [],
    wallCalculations: wire.wallCalculations ?? [],
    wallJoints: wire.wallJoints ?? [],
    openings: wire.openings,
    openingFramingPieces: wire.openingFramingPieces ?? [],
    rooms: wire.rooms,
    foundation: wire.foundation,
    roof: wire.roof,
    materialSet: wire.materialSet,
    sheets: wire.sheets,
    dimensions: wire.dimensions,
    settings: normalizeProjectSettings(wire.settings as ProjectSettingsWire),
    viewState: normalizeViewState(wire.viewState),
    profiles: normalizeProfilesImported(wire.profiles ?? []),
    surfaceTextureState: normalizeSurfaceTextureState(wire.surfaceTextureState),
  };
  const withVis = {
    ...base,
    visibleLayerIds: [...normalizeVisibleLayerIds(base)],
  };
  const withOriginTarget = projectWithViewport3dTargetAlignedToOriginIfDefault(withVis);
  return normalizeWallCalculationsInProject(withOriginTarget);
}

export function projectFromWire(wire: ProjectFileV1 | Record<string, unknown>): Project {
  const o = wire as Record<string, unknown>;
  const sv = o["schemaVersion"];
  if (sv === 0) {
    return migrateWireV0ToProject(o);
  }
  if (sv === 1 || sv === 2) {
    return projectFromWireV1(wire as ProjectFileV1);
  }
  throw new Error(`Неподдерживаемая schemaVersion: ${String(sv)}`);
}
