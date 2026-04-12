import { createEmptyMeta, touchProjectMeta } from "./projectFactory";
import { normalizeProjectSettings } from "./settings";
import { EMPTY_SURFACE_TEXTURE_STATE } from "./surfaceTextureState";
import { normalizeLayer, type Layer } from "./layer";
import type { Project } from "./project";
import type { Profile } from "./profile";
import { newEntityId } from "./ids";

/**
 * Демонстрационный проект: несколько стен и проёмов для проверки 2D/3D визуализации.
 */
export function createDemoProject(): Project {
  const meta = createEmptyMeta({ name: "Демо SIP (этап 1)" });
  const t = new Date().toISOString();
  const layerId = newEntityId();
  const defaultLayer: Layer = normalizeLayer({
    id: layerId,
    name: "Стены 1 эт",
    orderIndex: 0,
    elevationMm: 0,
    levelMode: "absolute",
    offsetFromBelowMm: 0,
    manualHeightMm: 0,
    isVisible: true,
    createdAt: t,
    updatedAt: t,
  });

  const wallNorthId = newEntityId();
  const wallEastId = newEntityId();
  const wallSouthId = newEntityId();

  const sipProfileId = newEntityId();
  const demoProfiles: readonly Profile[] = [
    {
      id: sipProfileId,
      name: "SIP 174 (OSB–EPS–OSB)",
      category: "wall",
      markPrefix: "1S",
      compositionMode: "layered",
      defaultHeightMm: 2800,
      notes: "Пример для библиотеки профилей",
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
        { id: newEntityId(), orderIndex: 1, materialName: "EPS", materialType: "eps", thicknessMm: 145 },
        { id: newEntityId(), orderIndex: 2, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
      ],
      createdAt: t,
      updatedAt: t,
    },
  ];

  const base: Project = {
    meta,
    projectOrigin: { x: 0, y: 0 },
    layers: [defaultLayer],
    activeLayerId: layerId,
    visibleLayerIds: [],
    wallJoints: [],
    wallCalculations: [],
    walls: [
      {
        id: wallNorthId,
        layerId,
        profileId: sipProfileId,
        start: { x: 0, y: 0 },
        end: { x: 8000, y: 0 },
        thicknessMm: 174,
        heightMm: 2800,
        baseElevationMm: 0,
        markPrefix: "1S",
        markSequenceNumber: 1,
        markLabel: "1S_1",
      },
      {
        id: wallEastId,
        layerId,
        profileId: sipProfileId,
        start: { x: 8000, y: 0 },
        end: { x: 8000, y: 6000 },
        thicknessMm: 174,
        heightMm: 2800,
        baseElevationMm: 0,
        markPrefix: "1S",
        markSequenceNumber: 2,
        markLabel: "1S_2",
      },
      {
        id: wallSouthId,
        layerId,
        profileId: sipProfileId,
        start: { x: 8000, y: 6000 },
        end: { x: 0, y: 6000 },
        thicknessMm: 174,
        heightMm: 2800,
        baseElevationMm: 0,
        markPrefix: "1S",
        markSequenceNumber: 3,
        markLabel: "1S_3",
      },
      {
        id: newEntityId(),
        layerId,
        profileId: sipProfileId,
        start: { x: 0, y: 6000 },
        end: { x: 0, y: 0 },
        thicknessMm: 174,
        heightMm: 2800,
        baseElevationMm: 0,
        markPrefix: "1S",
        markSequenceNumber: 4,
        markLabel: "1S_4",
      },
    ],
    planLines: [],
    foundationStrips: [],
    foundationPiles: [],
    slabs: [],
    floorBeams: [],
    roofPlanes: [],
    roofAssemblyCalculations: [],
    openingFramingPieces: [],
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
    profiles: demoProfiles,
    surfaceTextureState: EMPTY_SURFACE_TEXTURE_STATE,
    settings: normalizeProjectSettings({
      gridStepMm: 500,
      show2dGrid: true,
    }),
    viewState: {
      activeTab: "2d",
      editor2dPlanScope: "main",
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
      rightPropertiesCollapsed: false,
      show3dProfileLayers: true,
      show2dProfileLayers: true,
      show3dCalculation: true,
      show3dLayerOsb: true,
      show3dLayerEps: true,
      show3dLayerFrame: true,
      show3dLayerGypsum: true,
      show3dLayerWindows: true,
      show3dLayerDoors: true,
      show3dGrid: true,
      show3dRoof: true,
      show3dRoofMembrane: true,
      show3dRoofBattens: true,
      show3dRoofCovering: true,
      show3dRoofSoffit: false,
    },
  };

  return touchProjectMeta(base);
}
