import { normalizeWallCalculationsInProject } from "../domain/wallCalculationNormalize";
import { PROJECT_SCHEMA_VERSION, PROJECT_UNITS } from "../domain/constants";
import { normalizeLayer, type Layer } from "../domain/layer";
import type { Project } from "../domain/project";
import type { ProjectMeta } from "../domain/projectMeta";
import { normalizeProjectSettings, type ProjectSettingsWire } from "../domain/settings";
import { EMPTY_SURFACE_TEXTURE_STATE } from "../domain/surfaceTextureState";
import { normalizeViewState } from "../domain/viewState";
import type { Room } from "../domain/room";
import type { Wall } from "../domain/wall";

interface LevelV0 {
  readonly id: string;
  readonly name: string;
  readonly elevationMm: number;
  readonly order: number;
}

interface WallV0 extends Omit<Wall, "layerId"> {
  readonly levelId: string;
}

interface RoomV0 extends Omit<Room, "layerId"> {
  readonly levelId: string;
}

/** Миграция сохранённого файла schema v0 → доменная модель v1. */
export function migrateWireV0ToProject(data: Record<string, unknown>): Project {
  const levels = data["levels"] as LevelV0[] | undefined;
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error("v0: ожидался непустой массив levels");
  }
  const t = new Date().toISOString();
  const layers: Layer[] = levels.map((lev, i) =>
    normalizeLayer({
      id: lev.id,
      name: i === 0 ? "Стены 1 эт" : lev.name,
      orderIndex: lev.order,
      elevationMm: lev.elevationMm,
      levelMode: "absolute",
      offsetFromBelowMm: 0,
      manualHeightMm: 0,
      isVisible: true,
      createdAt: t,
      updatedAt: t,
    }),
  );
  const sorted = [...layers].sort((a, b) => a.orderIndex - b.orderIndex);
  const activeLayerId = sorted[0]!.id;

  const wallsRaw = data["walls"] as WallV0[];
  const walls: Wall[] = wallsRaw.map((w) => {
    const { levelId, ...rest } = w;
    return { ...rest, layerId: levelId };
  });

  const roomsRaw = data["rooms"] as RoomV0[];
  const rooms: Room[] = roomsRaw.map((r) => {
    const { levelId, ...rest } = r;
    return { ...rest, layerId: levelId };
  });

  const meta: ProjectMeta = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: String(data["id"]),
    name: String(data["name"]),
    createdAt: String(data["createdAt"]),
    updatedAt: new Date().toISOString(),
    units: PROJECT_UNITS,
  };

  return normalizeWallCalculationsInProject({
    meta,
    projectOrigin: null,
    layers,
    activeLayerId,
    visibleLayerIds: [],
    walls,
    planLines: [],
    foundationStrips: [],
    foundationPiles: [],
    slabs: [],
    floorBeams: [],
    roofPlanes: [],
    roofSystems: [],
    roofAssemblyCalculations: [],
    wallCalculations: [],
    wallJoints: [],
    openings: data["openings"] as Project["openings"],
    openingFramingPieces: [],
    rooms,
    foundation: data["foundation"] as Project["foundation"],
    roof: data["roof"] as Project["roof"],
    materialSet: data["materialSet"] as Project["materialSet"],
    sheets: data["sheets"] as Project["sheets"],
    dimensions: data["dimensions"] as Project["dimensions"],
    settings: normalizeProjectSettings(data["settings"] as ProjectSettingsWire),
    viewState: normalizeViewState(data["viewState"] as Parameters<typeof normalizeViewState>[0]),
    profiles: [],
    surfaceTextureState: EMPTY_SURFACE_TEXTURE_STATE,
  });
}
