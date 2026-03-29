import { createEmptyMeta, touchProjectMeta } from "./projectFactory";
import type { Layer } from "./layer";
import type { Project } from "./project";
import { newEntityId } from "./ids";

/**
 * Демонстрационный проект: несколько стен и проёмов для проверки 2D/3D визуализации.
 */
export function createDemoProject(): Project {
  const meta = createEmptyMeta({ name: "Демо SIP (этап 1)" });
  const t = new Date().toISOString();
  const layerId = newEntityId();
  const defaultLayer: Layer = {
    id: layerId,
    name: "Стены 1 эт",
    orderIndex: 0,
    elevationMm: 0,
    isVisible: true,
    createdAt: t,
    updatedAt: t,
  };

  const wallNorthId = newEntityId();
  const wallEastId = newEntityId();
  const wallSouthId = newEntityId();

  const base: Project = {
    meta,
    layers: [defaultLayer],
    activeLayerId: layerId,
    visibleLayerIds: [],
    walls: [
      {
        id: wallNorthId,
        layerId,
        start: { x: 0, y: 0 },
        end: { x: 8000, y: 0 },
        thicknessMm: 174,
        heightMm: 2800,
      },
      {
        id: wallEastId,
        layerId,
        start: { x: 8000, y: 0 },
        end: { x: 8000, y: 6000 },
        thicknessMm: 174,
        heightMm: 2800,
      },
      {
        id: wallSouthId,
        layerId,
        start: { x: 8000, y: 6000 },
        end: { x: 0, y: 6000 },
        thicknessMm: 174,
        heightMm: 2800,
      },
      {
        id: newEntityId(),
        layerId,
        start: { x: 0, y: 6000 },
        end: { x: 0, y: 0 },
        thicknessMm: 174,
        heightMm: 2800,
      },
    ],
    openings: [
      {
        id: newEntityId(),
        wallId: wallNorthId,
        kind: "door",
        offsetFromStartMm: 3500,
        widthMm: 900,
        heightMm: 2100,
      },
      {
        id: newEntityId(),
        wallId: wallEastId,
        kind: "window",
        offsetFromStartMm: 2000,
        widthMm: 1200,
        heightMm: 1400,
        sillHeightMm: 900,
      },
    ],
    rooms: [
      {
        id: newEntityId(),
        layerId,
        name: "Гостиная",
      },
    ],
    foundation: { type: "strip", notes: "Заглушка фундамента" },
    roof: {
      slopes: [{ id: newEntityId(), pitchDeg: 35, azimuthDeg: 0 }],
      notes: "Заглушка кровли",
    },
    materialSet: { id: newEntityId(), name: "SIP 174 мм", panelThicknessMm: 174 },
    sheets: [],
    dimensions: [],
    settings: {
      gridStepMm: 500,
      showGrid: true,
    },
    viewState: {
      activeTab: "2d",
      viewport2d: {
        panXMm: 4000,
        panYMm: 3000,
        zoomPixelsPerMm: 0.08,
      },
      viewport3d: {
        polarAngle: 0.85,
        azimuthalAngle: 0.65,
        distance: 18_000,
        targetXMm: 4000,
        targetYMm: 3000,
        targetZMm: 1400,
      },
    },
  };

  return touchProjectMeta(base);
}
