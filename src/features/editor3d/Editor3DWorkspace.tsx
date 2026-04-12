import { Grid } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, Ref, RefObject } from "react";
import type { Group } from "three";

import { slabWorldBottomMm, slabWorldTopMm } from "@/core/domain/layerVerticalStack";
import { resolveRoofRafterSectionOrientation } from "@/core/domain/roofRafter";
import { parseRoofBattenPickEntityId } from "@/core/domain/roofBattenPick3d";
import { formatLumberDisplayMark, lumberDisplayIndexByPieceId } from "@/core/domain/pieceDisplayMark";
import { buildCalculationSolidSpecsForProject } from "@/core/domain/wallCalculation3dSpecs";
import { lumberRoleLabelRu } from "@/core/domain/wallSpecification";
import { hasBlockingEditorOverlayModal } from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { isEditableKeyboardTarget } from "@/shared/editableKeyboardTarget";
import { useAppStore } from "@/store/useAppStore";

import { Editor3dCameraPresetPanel } from "./Editor3dCameraPresetPanel";
import { Editor3dFlyControls } from "./Editor3dFlyControls";
import { Editor3dOrbitControls } from "./Editor3dOrbitControls";
import { Editor3dOrbitPivotCoordinator } from "./Editor3dOrbitPivotCoordinator";
import type { Editor3dCameraPresetKind } from "./editor3dCameraPresetsMath";
import { Editor3dPresetCameraRunner } from "./Editor3dPresetCameraRunner";
import { Editor3dEntityContextMenu } from "./Editor3dEntityContextMenu";
import { Editor3dPickController } from "./Editor3dPickController";
import { Editor3dTexturePickController } from "./Editor3dTexturePickController";
import { Editor3dPivotMarker } from "./Editor3dPivotMarker";
import { Editor3dVisibilityPanel } from "./Editor3dVisibilityPanel";
import type { Editor3dPickPayload } from "./editor3dPick";
import { initialCameraPositionFromViewport3d } from "./viewport3dThreeSync";
import { ProjectCalculationMeshes } from "./ProjectCalculationMeshes";
import { ProjectFoundationPiles } from "./ProjectFoundationPiles";
import { ProjectFoundationStrips } from "./ProjectFoundationStrips";
import { ProjectOpeningMeshes } from "./ProjectOpeningMeshes";
import { ProjectSipSeamLines } from "./ProjectSipSeamLines";
import { ProjectSlabs } from "./ProjectSlabs";
import { ProjectWalls } from "./ProjectWalls";
import { ProjectFloorBeams } from "./ProjectFloorBeams";
import { ProjectFloorInsulation } from "./ProjectFloorInsulation";
import { ProjectRoofAssembly } from "./ProjectRoofAssembly";
import { ProjectRoofFramingWood } from "./ProjectRoofFramingWood";
import { ProjectRoofRafters } from "./ProjectRoofRafters";
import { useEditor3dThemeColors } from "./useEditor3dThemeColors";

type CalcFocus = { readonly wallId: string; readonly reactKey: string };

/** Иконка «мишень» / фокус для вращения вокруг точки. */
function IconOrbitAroundPoint() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.75" />
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21"
      />
      <path stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" d="M5.6 5.6l1.5 1.5m10.3 10.3l1.5 1.5m0-13.4l-1.5 1.5M7.1 16.9l-1.5 1.5" />
    </svg>
  );
}

/** Иконка «человечек» для режима обхода (упрощённый силуэт). */
function IconWalkPerson() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="5.5" r="2.2" />
      <path d="M12 8.2c-1.4 0-2.6 1-2.8 2.3L8.4 17c-.1.6.4 1.1 1 1.1s.9-.4 1-.9l.6-4.2h.8l.6 4.2c.1.5.5.9 1 .9s1.1-.5 1-1.1l-.8-6.5c-.2-1.3-1.4-2.3-2.8-2.3z" />
      <path d="M8.2 10.5L6.4 9.1c-.4-.3-1-.2-1.2.2s-.1.9.3 1.2l2.2 1.6c.3.2.7.2 1 0l1.1-.8-1.8-1.3-.6.5zm7.6 0l.6-.5-1.8 1.3 1.1.8c.3.2.7.2 1 0l2.2-1.6c.4-.3.5-.8.3-1.2s-.8-.5-1.2-.2l-1.8 1.4z" />
    </svg>
  );
}

function editorOverlaySnapshot() {
  const s = useAppStore.getState();
  return {
    activeTab: s.activeTab,
    layerManagerOpen: s.layerManagerOpen,
    layerParamsModalOpen: s.layerParamsModalOpen,
    floorInsulationModalOpen: s.floorInsulationModalOpen,
    profilesModalOpen: s.profilesModalOpen,
    addWallModalOpen: s.addWallModalOpen,
    addFloorBeamModalOpen: s.addFloorBeamModalOpen,
    floorBeamSplitModalOpen: s.floorBeamSplitModalOpen,
    addFoundationStripModalOpen: s.addFoundationStripModalOpen,
    addFoundationPileModalOpen: s.addFoundationPileModalOpen,
    addSlabModalOpen: s.addSlabModalOpen,
    addRoofPlaneModalOpen: s.addRoofPlaneModalOpen,
    addWindowModalOpen: s.addWindowModalOpen,
    addDoorModalOpen: s.addDoorModalOpen,
    windowEditModal: s.windowEditModal,
    doorEditModal: s.doorEditModal,
    slabEditModal: s.slabEditModal,
    roofSystemEditModal: s.roofSystemEditModal,
    roofPlaneEditModal: s.roofPlaneEditModal,
    wallJointParamsModalOpen: s.wallJointParamsModalOpen,
    wallCalculationModalOpen: s.wallCalculationModalOpen,
    roofCalculationModalOpen: s.roofCalculationModalOpen,
    generateRoofRaftersModalOpen: s.generateRoofRaftersModalOpen,
    wallCoordinateModalOpen: s.wallCoordinateModalOpen,
    floorBeamPlacementCoordinateModalOpen: s.floorBeamPlacementCoordinateModalOpen,
    slabCoordinateModalOpen: s.slabCoordinateModalOpen,
    wallAnchorCoordinateModalOpen: s.wallAnchorCoordinateModalOpen,
    wallMoveCopyCoordinateModalOpen: s.wallMoveCopyCoordinateModalOpen,
    floorBeamMoveCopyCoordinateModalOpen: s.floorBeamMoveCopyCoordinateModalOpen,
    lengthChangeCoordinateModalOpen: s.lengthChangeCoordinateModalOpen,
    projectOriginCoordinateModalOpen: s.projectOriginCoordinateModalOpen,
    openingAlongMoveNumericModalOpen: s.openingAlongMoveNumericModalOpen,
    roofPlaneEdgeOffsetModal: s.roofPlaneEdgeOffsetModal,
    foundationStripAutoPilesModal: s.foundationStripAutoPilesModal,
    entityCopyCoordinateModalOpen: s.entityCopyCoordinateModalOpen,
    entityCopyParamsModal: s.entityCopyParamsModal,
    textureApply3dParamsModal: s.textureApply3dParamsModal,
    editor3dContextMenu: s.editor3dContextMenu,
  };
}

function SceneFromProject({
  selectedWallEntityId,
  selectedFloorBeamEntityId,
  selectedOpeningEntityId,
  selectedPileEntityId,
  selectedStripEntityId,
  selectedSlabEntityId,
  calcFocus,
  hoverWallEntityId,
  hoverFloorBeamEntityId,
  hoverOpeningEntityId,
  hoverPileEntityId,
  hoverStripEntityId,
  hoverSlabEntityId,
  hoverRoofBattenEntityId,
  hoverRoofPlaneEntityId,
  hoverCalcReactKey,
  texturePickHover,
  texturePickLocked,
  selectedRoofBattenEntityId,
  selectedRoofPlaneEntityId,
  selectedRoofRafterEntityId,
  selectedFloorInsulationEntityId,
  hoverFloorInsulationEntityId,
  hoverRoofRafterEntityId,
}: {
  readonly selectedWallEntityId: string | null;
  readonly selectedFloorBeamEntityId: string | null;
  readonly selectedOpeningEntityId: string | null;
  readonly selectedPileEntityId: string | null;
  readonly selectedStripEntityId: string | null;
  readonly selectedSlabEntityId: string | null;
  readonly selectedRoofBattenEntityId: string | null;
  readonly selectedRoofPlaneEntityId: string | null;
  readonly selectedRoofRafterEntityId: string | null;
  readonly selectedFloorInsulationEntityId: string | null;
  readonly hoverFloorInsulationEntityId: string | null;
  readonly hoverRoofRafterEntityId: string | null;
  readonly calcFocus: CalcFocus | null;
  readonly hoverWallEntityId: string | null;
  readonly hoverFloorBeamEntityId: string | null;
  readonly hoverOpeningEntityId: string | null;
  readonly hoverPileEntityId: string | null;
  readonly hoverStripEntityId: string | null;
  readonly hoverSlabEntityId: string | null;
  readonly hoverRoofBattenEntityId: string | null;
  readonly hoverRoofPlaneEntityId: string | null;
  readonly hoverCalcReactKey: string | null;
  readonly texturePickHover: Editor3dPickPayload | null;
  readonly texturePickLocked: Editor3dPickPayload | null;
}) {
  const project = useAppStore((s) => s.currentProject);
  const showCalc = project.viewState.show3dCalculation !== false;
  const vs = project.viewState;
  const showSipSeamLines = showCalc && (vs.show3dLayerEps !== false || vs.show3dLayerOsb !== false);
  return (
    <>
      <ProjectFoundationStrips
        project={project}
        selectedStripEntityId={selectedStripEntityId}
        hoverStripEntityId={hoverStripEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectWalls
        project={project}
        selectedWallEntityId={selectedWallEntityId}
        calcFocus={calcFocus}
        hoverWallEntityId={hoverWallEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectFloorBeams
        project={project}
        selectedBeamEntityId={selectedFloorBeamEntityId}
        hoverBeamEntityId={hoverFloorBeamEntityId}
      />
      <ProjectFloorInsulation
        project={project}
        selectedPieceId={selectedFloorInsulationEntityId}
        hoverPieceId={hoverFloorInsulationEntityId}
      />
      <ProjectFoundationPiles
        project={project}
        selectedPileEntityId={selectedPileEntityId}
        hoverPileEntityId={hoverPileEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectSlabs
        project={project}
        selectedSlabEntityId={selectedSlabEntityId}
        hoverSlabEntityId={hoverSlabEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectCalculationMeshes
        project={project}
        visible={showCalc}
        calcFocus={calcFocus}
        hoverCalcReactKey={hoverCalcReactKey}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectSipSeamLines project={project} visible={showSipSeamLines} />
      <ProjectOpeningMeshes
        project={project}
        selectedOpeningEntityId={selectedOpeningEntityId}
        hoverOpeningEntityId={hoverOpeningEntityId}
        texturePickHover={texturePickHover}
        texturePickLocked={texturePickLocked}
      />
      <ProjectRoofAssembly
        project={project}
        selectedRoofBattenEntityId={selectedRoofBattenEntityId}
        hoverRoofBattenEntityId={hoverRoofBattenEntityId}
        selectedRoofPlaneEntityId={selectedRoofPlaneEntityId}
        hoverRoofPlaneEntityId={hoverRoofPlaneEntityId}
      />
      <ProjectRoofRafters
        project={project}
        selectedRafterEntityId={selectedRoofRafterEntityId}
        hoverRafterEntityId={hoverRoofRafterEntityId}
      />
      <ProjectRoofFramingWood project={project} />
    </>
  );
}

function Editor3dCanvasScene({
  theme3d,
  originXM,
  originZM,
  calcFocus,
  setCalcFocus,
  onHoverPickChange,
  hoverWallEntityId,
  hoverFloorBeamEntityId,
  hoverOpeningEntityId,
  hoverPileEntityId,
  hoverStripEntityId,
  hoverSlabEntityId,
  hoverFloorInsulationEntityId,
  hoverRoofBattenEntityId,
  hoverRoofPlaneEntityId,
  hoverRoofRafterEntityId,
  hoverCalcReactKey,
  flyModeActive,
  orbitPivotModeActive,
  pivotMarkerWorld,
  setPivotMarkerWorld,
  textureApply3dToolActive,
  textureParamsModalOpen,
  onTextureHoverPick,
  texturePickHover,
  texturePickLocked,
  modelBoundsRef,
  presetCameraRequest,
  onPresetCameraConsumed,
  cameraPresetDriving,
  orbitViewportSerialRef,
  onCameraPresetDrivingChange,
}: {
  readonly theme3d: ReturnType<typeof useEditor3dThemeColors>;
  readonly originXM: number;
  readonly originZM: number;
  readonly calcFocus: CalcFocus | null;
  readonly setCalcFocus: (v: CalcFocus | null) => void;
  readonly onHoverPickChange: (p: Editor3dPickPayload | null) => void;
  readonly hoverWallEntityId: string | null;
  readonly hoverFloorBeamEntityId: string | null;
  readonly hoverOpeningEntityId: string | null;
  readonly hoverPileEntityId: string | null;
  readonly hoverStripEntityId: string | null;
  readonly hoverSlabEntityId: string | null;
  readonly hoverFloorInsulationEntityId: string | null;
  readonly hoverRoofBattenEntityId: string | null;
  readonly hoverRoofPlaneEntityId: string | null;
  readonly hoverRoofRafterEntityId: string | null;
  readonly hoverCalcReactKey: string | null;
  readonly flyModeActive: boolean;
  readonly orbitPivotModeActive: boolean;
  readonly pivotMarkerWorld: readonly [number, number, number] | null;
  readonly setPivotMarkerWorld: (p: readonly [number, number, number] | null) => void;
  readonly textureApply3dToolActive: boolean;
  readonly textureParamsModalOpen: boolean;
  readonly onTextureHoverPick: (p: Editor3dPickPayload | null) => void;
  readonly texturePickHover: Editor3dPickPayload | null;
  readonly texturePickLocked: Editor3dPickPayload | null;
  readonly modelBoundsRef: RefObject<Group | null>;
  readonly presetCameraRequest: { readonly id: number; readonly kind: Editor3dCameraPresetKind } | null;
  readonly onPresetCameraConsumed: () => void;
  readonly cameraPresetDriving: boolean;
  readonly orbitViewportSerialRef: MutableRefObject<string>;
  readonly onCameraPresetDrivingChange: (v: boolean) => void;
}) {
  const project = useAppStore((s) => s.currentProject);
  const selectedEntityIds = useAppStore((s) => s.selectedEntityIds);

  const selectedWallEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.walls.some((w) => w.id === id) ? id : null;
  }, [project.walls, selectedEntityIds]);

  const selectedOpeningEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.openings.some((o) => o.id === id) ? id : null;
  }, [project.openings, selectedEntityIds]);

  const selectedPileEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.foundationPiles.some((p) => p.id === id) ? id : null;
  }, [project.foundationPiles, selectedEntityIds]);

  const selectedStripEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.foundationStrips.some((s) => s.id === id) ? id : null;
  }, [project.foundationStrips, selectedEntityIds]);

  const selectedSlabEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.slabs.some((s) => s.id === id) ? id : null;
  }, [project.slabs, selectedEntityIds]);

  const selectedFloorBeamEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.floorBeams.some((b) => b.id === id) ? id : null;
  }, [project.floorBeams, selectedEntityIds]);

  const selectedFloorInsulationEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.floorInsulationPieces.some((p) => p.id === id) ? id : null;
  }, [project.floorInsulationPieces, selectedEntityIds]);

  const selectedRoofBattenEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return parseRoofBattenPickEntityId(id) != null ? id : null;
  }, [selectedEntityIds]);

  const selectedRoofPlaneEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    if (parseRoofBattenPickEntityId(id) != null) {
      return null;
    }
    if (project.roofRafters.some((r) => r.id === id)) {
      return null;
    }
    return project.roofPlanes.some((r) => r.id === id) ? id : null;
  }, [project.roofPlanes, project.roofRafters, selectedEntityIds]);

  const selectedRoofRafterEntityId = useMemo(() => {
    if (selectedEntityIds.length !== 1) {
      return null;
    }
    const id = selectedEntityIds[0]!;
    return project.roofRafters.some((r) => r.id === id) ? id : null;
  }, [project.roofRafters, selectedEntityIds]);

  const show3dGrid = project.viewState.show3dGrid !== false;

  return (
    <>
      <color attach="background" args={[theme3d.bg]} />
      <ambientLight intensity={0.58} />
      <hemisphereLight color="#e8eef4" groundColor="#7a6a58" intensity={0.45} />
      <directionalLight
        position={[14, 18, 12]}
        intensity={0.78}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={90}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-bias={-0.00015}
      />
      <directionalLight position={[-10, 8, -6]} intensity={0.22} />
      <group position={[originXM, 0, originZM]} userData={{ editor3dExcludeFromOrbitPivot: true }}>
        {show3dGrid ? (
          <Grid
            infiniteGrid
            fadeDistance={120}
            sectionSize={1}
            cellSize={0.2}
            sectionColor={theme3d.section}
            cellColor={theme3d.cell}
            position={[0, 0, 0]}
          />
        ) : null}
        <axesHelper args={[2.5]} />
      </group>
      <Editor3dPickController
        setCalcFocus={setCalcFocus}
        onHoverPickChange={onHoverPickChange}
        pickingSuspended={flyModeActive || textureApply3dToolActive}
        deferClickSelection={orbitPivotModeActive && !flyModeActive}
      />
      {textureApply3dToolActive && !flyModeActive ? (
        <Editor3dTexturePickController modalOpen={textureParamsModalOpen} onHoverTexturablePick={onTextureHoverPick} />
      ) : null}
      <group ref={modelBoundsRef as Ref<Group>}>
        <SceneFromProject
          selectedWallEntityId={selectedWallEntityId}
          selectedFloorBeamEntityId={selectedFloorBeamEntityId}
          selectedOpeningEntityId={selectedOpeningEntityId}
          selectedPileEntityId={selectedPileEntityId}
          selectedStripEntityId={selectedStripEntityId}
          selectedSlabEntityId={selectedSlabEntityId}
          selectedRoofBattenEntityId={selectedRoofBattenEntityId}
          selectedRoofPlaneEntityId={selectedRoofPlaneEntityId}
          selectedRoofRafterEntityId={selectedRoofRafterEntityId}
          selectedFloorInsulationEntityId={selectedFloorInsulationEntityId}
          calcFocus={calcFocus}
          hoverWallEntityId={hoverWallEntityId}
          hoverFloorBeamEntityId={hoverFloorBeamEntityId}
          hoverOpeningEntityId={hoverOpeningEntityId}
          hoverPileEntityId={hoverPileEntityId}
          hoverStripEntityId={hoverStripEntityId}
          hoverSlabEntityId={hoverSlabEntityId}
          hoverRoofBattenEntityId={hoverRoofBattenEntityId}
          hoverRoofPlaneEntityId={hoverRoofPlaneEntityId}
          hoverRoofRafterEntityId={hoverRoofRafterEntityId}
          hoverFloorInsulationEntityId={hoverFloorInsulationEntityId}
          hoverCalcReactKey={hoverCalcReactKey}
          texturePickHover={texturePickHover}
          texturePickLocked={texturePickLocked}
        />
      </group>
      <Editor3dPivotMarker point={pivotMarkerWorld} />
      <Editor3dFlyControls enabled={flyModeActive} />
      <Editor3dOrbitControls
        flyModeActive={flyModeActive}
        suspendApplyFromStore={cameraPresetDriving}
        lastAppliedSerialRef={orbitViewportSerialRef}
      />
      <Editor3dPresetCameraRunner
        modelBoundsRef={modelBoundsRef}
        pending={presetCameraRequest}
        flyModeActive={flyModeActive}
        onDrivingChange={onCameraPresetDrivingChange}
        onConsumed={onPresetCameraConsumed}
        orbitLastAppliedRef={orbitViewportSerialRef}
      />
      <Editor3dOrbitPivotCoordinator
        modeActive={orbitPivotModeActive}
        flyModeActive={flyModeActive}
        onPivotMarkerWorld={setPivotMarkerWorld}
      />
    </>
  );
}

export function Editor3DWorkspace() {
  const showLayers = useAppStore((s) => s.currentProject.viewState.show3dProfileLayers);
  const setShow3dProfileLayers = useAppStore((s) => s.setShow3dProfileLayers);
  const showCalc = useAppStore((s) => s.currentProject.viewState.show3dCalculation);
  const setShow3dCalculation = useAppStore((s) => s.setShow3dCalculation);
  const show3dGrid = useAppStore((s) => s.currentProject.viewState.show3dGrid !== false);
  const set3dLayerVisibility = useAppStore((s) => s.set3dLayerVisibility);
  const theme3d = useEditor3dThemeColors();
  const project = useAppStore((s) => s.currentProject);
  const selectedEntityIds = useAppStore((s) => s.selectedEntityIds);
  const activeTab = useAppStore((s) => s.activeTab);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const textureApply3dToolActive = useAppStore((s) => s.textureApply3dToolActive);
  const textureApply3dParamsModal = useAppStore((s) => s.textureApply3dParamsModal);

  const originXM = (project.projectOrigin?.x ?? 0) * 0.001;
  const originZM = -(project.projectOrigin?.y ?? 0) * 0.001;
  const [calcFocus, setCalcFocus] = useState<CalcFocus | null>(null);
  const [hoverPick, setHoverPick] = useState<Editor3dPickPayload | null>(null);
  const [textureToolHoverPick, setTextureToolHoverPick] = useState<Editor3dPickPayload | null>(null);
  const [flyModeActive, setFlyModeActive] = useState(false);
  const [orbitPivotModeActive, setOrbitPivotModeActive] = useState(false);
  const [editor3dVisibilityOpen, setEditor3dVisibilityOpen] = useState(false);
  const [pivotMarkerWorld, setPivotMarkerWorld] = useState<readonly [number, number, number] | null>(null);
  const modelBoundsRef = useRef<Group | null>(null);
  const orbitViewportSerialRef = useRef<string>("");
  const [presetCameraRequest, setPresetCameraRequest] = useState<{
    readonly id: number;
    readonly kind: Editor3dCameraPresetKind;
  } | null>(null);
  const [cameraPresetDriving, setCameraPresetDriving] = useState(false);
  const onPresetCameraConsumed = useCallback(() => setPresetCameraRequest(null), []);
  const onCameraPresetDrivingChange = useCallback((v: boolean) => setCameraPresetDriving(v), []);
  const requestCameraPreset = useCallback((kind: Editor3dCameraPresetKind) => {
    setPresetCameraRequest({ id: Date.now(), kind });
  }, []);
  const initialCameraPosRef = useRef<[number, number, number] | null>(null);
  if (initialCameraPosRef.current == null) {
    initialCameraPosRef.current = initialCameraPositionFromViewport3d(project.viewState.viewport3d);
  }

  const onHoverPickChange = useCallback((p: Editor3dPickPayload | null) => {
    setHoverPick(p);
  }, []);

  const editor3dContextDeleteEpoch = useAppStore((s) => s.editor3dContextDeleteEpoch);
  const prevCtxEpochRef = useRef(0);
  useEffect(() => {
    if (editor3dContextDeleteEpoch !== prevCtxEpochRef.current && editor3dContextDeleteEpoch > 0) {
      setHoverPick(null);
    }
    prevCtxEpochRef.current = editor3dContextDeleteEpoch;
  }, [editor3dContextDeleteEpoch]);

  const onTextureHoverPick = useCallback((p: Editor3dPickPayload | null) => {
    setTextureToolHoverPick(p);
  }, []);

  const textureParamsModalOpen = textureApply3dParamsModal != null;
  const texturePickLocked = textureApply3dParamsModal?.pick ?? null;
  const texturePickHover =
    textureApply3dToolActive && !textureApply3dParamsModal ? textureToolHoverPick : null;

  const hoverWallEntityId = hoverPick?.kind === "wall" ? hoverPick.entityId : null;
  const hoverFloorBeamEntityId = hoverPick?.kind === "floorBeam" ? hoverPick.entityId : null;
  const hoverOpeningEntityId = hoverPick?.kind === "opening" ? hoverPick.entityId : null;
  const hoverPileEntityId = hoverPick?.kind === "foundationPile" ? hoverPick.entityId : null;
  const hoverStripEntityId = hoverPick?.kind === "foundationStrip" ? hoverPick.entityId : null;
  const hoverSlabEntityId = hoverPick?.kind === "slab" ? hoverPick.entityId : null;
  const hoverFloorInsulationEntityId = hoverPick?.kind === "floorInsulation" ? hoverPick.entityId : null;
  const hoverRoofBattenEntityId = hoverPick?.kind === "roofBatten" ? hoverPick.entityId : null;
  const hoverRoofPlaneEntityId = hoverPick?.kind === "roofPlane" ? hoverPick.entityId : null;
  const hoverRoofRafterEntityId = hoverPick?.kind === "roofRafter" ? hoverPick.entityId : null;
  const hoverCalcReactKey = hoverPick?.kind === "calc" ? hoverPick.reactKey : null;

  useEffect(() => {
    if (calcFocus == null) {
      return;
    }
    if (selectedEntityIds.length !== 1 || selectedEntityIds[0] !== calcFocus.wallId) {
      setCalcFocus(null);
    }
  }, [calcFocus, selectedEntityIds]);

  useEffect(() => {
    if (activeTab !== "3d") {
      setCalcFocus(null);
      setHoverPick(null);
      setTextureToolHoverPick(null);
      setFlyModeActive(false);
      setOrbitPivotModeActive(false);
      setPivotMarkerWorld(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!textureApply3dToolActive) {
      setTextureToolHoverPick(null);
    }
  }, [textureApply3dToolActive]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "Escape") {
        return;
      }
      if (activeTab !== "3d") {
        return;
      }
      if (isEditableKeyboardTarget(e.target)) {
        return;
      }
      const st = useAppStore.getState();
      if (st.textureApply3dParamsModal != null) {
        e.preventDefault();
        st.closeTextureApply3dParamsModal();
        return;
      }
      if (st.textureApply3dToolActive) {
        e.preventDefault();
        st.cancelTextureApply3dTool();
        setTextureToolHoverPick(null);
        return;
      }
      if (st.editor3dContextMenu != null) {
        e.preventDefault();
        st.closeEditor3dContextMenu();
        return;
      }
      if (hasBlockingEditorOverlayModal(editorOverlaySnapshot())) {
        return;
      }
      setCalcFocus(null);
      clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, clearSelection]);

  const onPointerMissedClear = useCallback(() => {
    setCalcFocus(null);
    clearSelection();
    setHoverPick(null);
  }, [clearSelection]);

  const selectedInfo = useMemo(() => {
    const ids = selectedEntityIds;
    if (ids.length !== 1) {
      return null;
    }
    const id = ids[0]!;

    if (calcFocus != null && id === calcFocus.wallId) {
      const specs = buildCalculationSolidSpecsForProject(project);
      const s = specs.find((x) => x.reactKey === calcFocus.reactKey);
      if (s) {
        const calc = project.wallCalculations.find((c) => c.id === s.calculationId);
        const piece = s.pieceId ? calc?.lumberPieces.find((p) => p.id === s.pieceId) : undefined;
        const lumberIdx = calc && piece ? lumberDisplayIndexByPieceId(calc.lumberPieces).get(piece.id) : undefined;
        const detailLabel =
          piece && lumberIdx != null
            ? formatLumberDisplayMark(piece.wallMark, lumberIdx)
            : s.source === "sip"
              ? "—"
              : (s.pieceId ?? "—");
        return {
          title: "Расчётный элемент",
          rows: [
            ["ID", s.reactKey],
            ["Категория", s.source],
            ["Стена", s.wallId],
            ["Расчёт", s.calculationId],
            ["Деталь", detailLabel],
            ["Роль", piece ? lumberRoleLabelRu(piece.role) : "—"],
            ["Ширина", `${Math.round(s.width * 1000)} мм`],
            ["Высота", `${Math.round(s.height * 1000)} мм`],
            ["Длина", `${Math.round(s.depth * 1000)} мм`],
          ] as const,
        };
      }
    }

    const opening = project.openings.find((o) => o.id === id);
    if (opening && opening.wallId != null) {
      return {
        title: opening.kind === "door" ? "Дверь" : opening.kind === "window" ? "Окно" : "Проём",
        rows: [
          ["ID", opening.id],
          ["Стена", opening.wallId],
          ["Ширина", `${opening.widthMm} мм`],
          ["Высота", `${opening.heightMm} мм`],
        ] as const,
      };
    }

    const wall = project.walls.find((w) => w.id === id);
    if (wall) {
      return {
        title: "Стена",
        rows: [
          ["ID", wall.id],
          ["Высота", `${wall.heightMm} мм`],
          ["Толщина", `${wall.thicknessMm} мм`],
        ] as const,
      };
    }

    const strip = project.foundationStrips.find((s) => s.id === id);
    if (strip) {
      const kindRu =
        strip.kind === "ortho_ring"
          ? "Замкнутое кольцо"
          : strip.kind === "footprint_poly"
            ? "Объединённый контур"
            : "Сегмент";
      return {
        title: "Лента фундамента",
        rows: [
          ["ID", strip.id],
          ["Форма", kindRu],
          ["Глубина", `${strip.depthMm} мм`],
          ["Сторона наружу", `${strip.sideOutMm} мм`],
          ["Сторона внутрь", `${strip.sideInMm} мм`],
        ] as const,
      };
    }

    const pile = project.foundationPiles.find((p) => p.id === id);
    if (pile) {
      const typeRu =
        pile.pileKind === "screw"
          ? "Винтовая"
          : pile.pileKind === "reinforcedConcrete"
            ? "Железобетонная"
            : pile.pileKind;
      return {
        title: "Свая",
        rows: [
          ["ID", pile.id],
          ["Тип", typeRu],
          ["Размер", `${Math.round(pile.sizeMm)} мм`],
          ["Площадка", `${Math.round(pile.capSizeMm)} мм`],
          ["Высота", `${Math.round(pile.heightMm)} мм`],
          ["Уровень", `${Math.round(pile.levelMm)} мм`],
        ] as const,
      };
    }

    const beam = project.floorBeams.find((b) => b.id === id);
    if (beam) {
      return {
        title: "Балка перекрытия",
        rows: [
          ["ID", beam.id],
          ["Профиль", beam.profileId],
          ["Уровень низа", `${Math.round(beam.baseElevationMm)} мм`],
          ["Развернуть сечение", beam.sectionRolled ? "да" : "нет"],
          ["Привязка", beam.linearPlacementMode],
        ] as const,
      };
    }

    const slab = project.slabs.find((s) => s.id === id);
    if (slab) {
      const topW = Math.round(slabWorldTopMm(slab, project));
      const botW = Math.round(slabWorldBottomMm(slab, project));
      return {
        title: "Плита",
        rows: [
          ["ID", slab.id],
          ["Вершин", String(slab.pointsMm.length)],
          ["Верх в слое", `${Math.round(slab.levelMm)} мм`],
          ["Верх (мир)", `${topW} мм`],
          ["Низ (мир)", `${botW} мм`],
          ["Глубина", `${Math.round(slab.depthMm)} мм`],
        ] as const,
      };
    }

    const roofPlaneSel = project.roofPlanes.find((r) => r.id === id);
    if (roofPlaneSel) {
      const modeRu = roofPlaneSel.roofSystemId ? "простая крыша (генератор)" : "плоскость вручную";
      return {
        title: roofPlaneSel.roofSystemId ? "Скат (генератор)" : "Скат крыши",
        rows: [
          ["ID", roofPlaneSel.id],
          ["Режим", modeRu],
          ["Угол", `${Math.round(roofPlaneSel.angleDeg * 10) / 10}°`],
          ["Скат №", String(roofPlaneSel.slopeIndex)],
          ["Профиль", roofPlaneSel.profileId],
        ] as const,
      };
    }

    const roofBattenPick = parseRoofBattenPickEntityId(id);
    if (roofBattenPick) {
      const plane = project.roofPlanes.find((p) => p.id === roofBattenPick.planeId);
      return {
        title: "Доска обрешётки",
        rows: [
          ["Скат", roofBattenPick.planeId],
          ["Индекс доски", String(roofBattenPick.battenIndex)],
          ["Профиль кровли", plane?.profileId ?? "—"],
        ] as const,
      };
    }

    const rafter = project.roofRafters.find((r) => r.id === id);
    if (rafter) {
      const orientRu = resolveRoofRafterSectionOrientation(rafter) === "edge" ? "на ребро" : "плашмя";
      return {
        title: "Стропило",
        rows: [
          ["ID", rafter.id],
          ["Скат", rafter.roofPlaneId],
          ["Перекрытие", rafter.supportingFloorBeamId],
          ["Профиль", rafter.profileId],
          ["Сечение", orientRu],
        ] as const,
      };
    }

    return null;
  }, [calcFocus, project, selectedEntityIds]);

  const hoverTooltip = useMemo(() => {
    if (!hoverPick) {
      return null;
    }
    if (hoverPick.kind === "wall") {
      return "Стена";
    }
    if (hoverPick.kind === "floorBeam") {
      return "Балка перекрытия";
    }
    if (hoverPick.kind === "foundationPile") {
      return "Свая";
    }
    if (hoverPick.kind === "foundationStrip") {
      return "Лента фундамента";
    }
    if (hoverPick.kind === "slab") {
      return "Плита";
    }
    if (hoverPick.kind === "roofBatten") {
      return "Доска обрешётки";
    }
    if (hoverPick.kind === "roofPlane") {
      return "Скат крыши";
    }
    if (hoverPick.kind === "roofRafter") {
      return "Стропило";
    }
    if (hoverPick.kind === "calc") {
      return "Элемент расчёта";
    }
    const o = project.openings.find((x) => x.id === hoverPick.entityId);
    if (o?.kind === "door") {
      return "Дверь";
    }
    if (o?.kind === "window") {
      return "Окно";
    }
    return "Проём";
  }, [hoverPick, project.openings]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        cursor:
          textureApply3dToolActive && !flyModeActive && !textureParamsModalOpen ? "crosshair" : undefined,
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      <Editor3dVisibilityPanel onOpenChange={setEditor3dVisibilityOpen} />
      {!editor3dVisibilityOpen ? (
        <Editor3dCameraPresetPanel disabled={flyModeActive} onSelectPreset={requestCameraPreset} />
      ) : null}
      <label
        style={{
          position: "absolute",
          zIndex: 1,
          top: 10,
          left: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--color-border-subtle)",
          background: theme3d.overlayBg,
          color: theme3d.overlayText,
          fontSize: 13,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input type="checkbox" checked={showLayers} onChange={(e) => setShow3dProfileLayers(e.target.checked)} />
        Слои профиля в 3D
      </label>
      <label
        style={{
          position: "absolute",
          zIndex: 1,
          top: 48,
          left: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--color-border-subtle)",
          background: theme3d.overlayBg,
          color: theme3d.overlayText,
          fontSize: 13,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input type="checkbox" checked={showCalc !== false} onChange={(e) => setShow3dCalculation(e.target.checked)} />
        Расчёт в 3D (SIP и доски)
      </label>
      <label
        style={{
          position: "absolute",
          zIndex: 1,
          top: 86,
          left: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--color-border-subtle)",
          background: theme3d.overlayBg,
          color: theme3d.overlayText,
          fontSize: 13,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={show3dGrid}
          onChange={(e) => set3dLayerVisibility({ show3dGrid: e.target.checked })}
        />
        Сетка в 3D
      </label>
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          top: 124,
          left: 10,
          display: "flex",
          flexDirection: "row",
          gap: 6,
        }}
      >
        <button
          type="button"
          title="Режим обхода 3D"
          aria-label="Режим обхода 3D"
          aria-pressed={flyModeActive}
          onClick={() => {
            setFlyModeActive((v) => {
              const next = !v;
              if (next) {
                setOrbitPivotModeActive(false);
              }
              return next;
            });
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 34,
            padding: 0,
            borderRadius: 6,
            border: flyModeActive ? "2px solid var(--color-accent-outline, #5a9fff)" : "1px solid var(--color-border-subtle)",
            background: flyModeActive ? "var(--color-accent-soft, rgba(90, 167, 255, 0.18))" : theme3d.overlayBg,
            color: flyModeActive ? "var(--color-accent, #6eb0ff)" : theme3d.overlayText,
            cursor: "pointer",
            boxShadow: flyModeActive ? "0 0 0 1px var(--color-accent-outline, rgba(90, 167, 255, 0.35))" : undefined,
          }}
        >
          <IconWalkPerson />
        </button>
        <button
          type="button"
          title="Вращение вокруг точки. Зажмите ЛКМ по объекту и вращайте камеру вокруг точки попадания. Выключите режим, чтобы вернуться к прежней точке вращения."
          aria-label="Вращение вокруг точки"
          aria-pressed={orbitPivotModeActive}
          onClick={() => {
            setOrbitPivotModeActive((v) => {
              const next = !v;
              if (next) {
                setFlyModeActive(false);
              }
              return next;
            });
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 34,
            padding: 0,
            borderRadius: 6,
            border: orbitPivotModeActive
              ? "2px solid var(--color-accent-outline, #5a9fff)"
              : "1px solid var(--color-border-subtle)",
            background: orbitPivotModeActive
              ? "var(--color-accent-soft, rgba(90, 167, 255, 0.18))"
              : theme3d.overlayBg,
            color: orbitPivotModeActive ? "var(--color-accent, #6eb0ff)" : theme3d.overlayText,
            cursor: "pointer",
            boxShadow: orbitPivotModeActive
              ? "0 0 0 1px var(--color-accent-outline, rgba(90, 167, 255, 0.35))"
              : undefined,
          }}
        >
          <IconOrbitAroundPoint />
        </button>
      </div>
      <Canvas
        shadows
        camera={{
          position: initialCameraPosRef.current,
          fov: 45,
          near: 0.1,
          far: 500,
        }}
        style={{ width: "100%", height: "100%", minHeight: 0 }}
        onPointerMissed={onPointerMissedClear}
      >
        <Editor3dCanvasScene
          theme3d={theme3d}
          originXM={originXM}
          originZM={originZM}
          calcFocus={calcFocus}
          setCalcFocus={setCalcFocus}
          onHoverPickChange={onHoverPickChange}
          hoverWallEntityId={hoverWallEntityId}
          hoverFloorBeamEntityId={hoverFloorBeamEntityId}
          hoverOpeningEntityId={hoverOpeningEntityId}
          hoverPileEntityId={hoverPileEntityId}
          hoverStripEntityId={hoverStripEntityId}
          hoverSlabEntityId={hoverSlabEntityId}
          hoverFloorInsulationEntityId={hoverFloorInsulationEntityId}
          hoverRoofBattenEntityId={hoverRoofBattenEntityId}
          hoverRoofPlaneEntityId={hoverRoofPlaneEntityId}
          hoverRoofRafterEntityId={hoverRoofRafterEntityId}
          hoverCalcReactKey={hoverCalcReactKey}
          flyModeActive={flyModeActive}
          orbitPivotModeActive={orbitPivotModeActive}
          pivotMarkerWorld={pivotMarkerWorld}
          setPivotMarkerWorld={setPivotMarkerWorld}
          textureApply3dToolActive={textureApply3dToolActive}
          textureParamsModalOpen={textureParamsModalOpen}
          onTextureHoverPick={onTextureHoverPick}
          texturePickHover={texturePickHover}
          texturePickLocked={texturePickLocked}
          modelBoundsRef={modelBoundsRef}
          presetCameraRequest={presetCameraRequest}
          onPresetCameraConsumed={onPresetCameraConsumed}
          cameraPresetDriving={cameraPresetDriving}
          orbitViewportSerialRef={orbitViewportSerialRef}
          onCameraPresetDrivingChange={onCameraPresetDrivingChange}
        />
      </Canvas>
      {flyModeActive ? (
        <div
          style={{
            position: "absolute",
            zIndex: 4,
            left: "50%",
            bottom: 52,
            transform: "translateX(-50%)",
            maxWidth: "min(520px, calc(100% - 24px))",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            fontSize: 11,
            lineHeight: 1.45,
            textAlign: "center",
            pointerEvents: "none",
            opacity: 0.92,
          }}
        >
          W/A/S/D — движение, Q/E — вверх/вниз, Shift — ускорение, Esc — выход
        </div>
      ) : orbitPivotModeActive ? (
        <div
          style={{
            position: "absolute",
            zIndex: 4,
            left: "50%",
            bottom: 52,
            transform: "translateX(-50%)",
            maxWidth: "min(520px, calc(100% - 24px))",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            fontSize: 11,
            lineHeight: 1.45,
            textAlign: "center",
            pointerEvents: "none",
            opacity: 0.92,
          }}
        >
          Зажмите ЛКМ по объекту, чтобы вращаться вокруг точки попадания
        </div>
      ) : textureApply3dToolActive && !flyModeActive ? (
        <div
          style={{
            position: "absolute",
            zIndex: 4,
            left: "50%",
            bottom: 52,
            transform: "translateX(-50%)",
            maxWidth: "min(520px, calc(100% - 24px))",
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            fontSize: 11,
            lineHeight: 1.45,
            textAlign: "center",
            pointerEvents: "none",
            opacity: 0.92,
          }}
        >
          {textureParamsModalOpen
            ? "Настройте текстуру и нажмите «Применить»."
            : "Выберите объект для наложения текстуры. ПКМ или Esc — выход из инструмента."}
        </div>
      ) : null}
      {hoverTooltip ? (
        <div
          style={{
            position: "absolute",
            zIndex: 3,
            left: 16,
            bottom: 16,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          {hoverTooltip}
        </div>
      ) : null}
      {selectedInfo ? (
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 10,
            zIndex: 2,
            width: 280,
            borderRadius: 8,
            border: "1px solid var(--color-border-subtle)",
            background: theme3d.overlayBg,
            color: theme3d.overlayText,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{selectedInfo.title}</div>
          {selectedInfo.rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <div style={{ opacity: 0.74, minWidth: 70 }}>{k}</div>
              <div style={{ wordBreak: "break-word" }}>{v}</div>
            </div>
          ))}
        </div>
      ) : null}
      <Editor3dEntityContextMenu />
    </div>
  );
}
