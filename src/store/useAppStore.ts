import { create } from "zustand";

import {
  canDeleteLayer,
  createLayerInProject,
  deleteLayerAndEntities,
  getAdjacentLayerIdInDomain,
  getLayerById,
  getNextLayerId,
  getPreviousLayerId,
  moveLayerToDomainSortedIndex,
  moveLayerToStackPosition,
  projectWithActiveLayerMatchingPlanScope,
  reorderLayerRelative,
  reorderLayerRelativeInDomain,
  setActiveLayerId,
  sortLayersForDomain,
  updateLayerInProject,
  type LayerUpdatePatch,
} from "@/core/domain/layerOps";
import { editor2dPlanScopeToLayerDomain, type LayerDomain } from "@/core/domain/layerDomain";
import { normalizeVisibleLayerIds, setVisibleLayerIdsOnProject } from "@/core/domain/layerVisibility";
import { createDemoProject } from "@/core/domain/demoProject";
import { newEntityId } from "@/core/domain/ids";
import { MIN_PLAN_LINE_LENGTH_MM, type PlanLine } from "@/core/domain/planLine";
import { createEmptyProject, touchProjectMeta } from "@/core/domain/projectFactory";
import type { Profile } from "@/core/domain/profile";
import {
  addProfile as addProfileToProject,
  duplicateProfile as duplicateProfileInProject,
  removeProfile as removeProfileFromProject,
  updateProfile as updateProfileInProject,
} from "@/core/domain/profileMutations";
import { getProfileById } from "@/core/domain/profileOps";
import { validateProfile } from "@/core/domain/profileValidation";
import type { Project } from "@/core/domain/project";
import {
  DEFAULT_WALL_CALC_STAGE3_OPTIONS,
  type WallCalculationResult,
  type WallCalculationStage3Options,
} from "@/core/domain/wallCalculation";
import type { DoorOpeningSwing } from "@/core/domain/opening";
import { removeUnplacedWindowDraft } from "@/core/domain/openingDraftCleanup";
import {
  addUnplacedDoorToProject,
  addUnplacedWindowToProject,
  placedDoorOpeningToDraftPayload,
  placedWindowOpeningToDraftPayload,
  type AddDoorDraftPayload,
  type AddWindowDraftPayload,
} from "@/core/domain/openingMutations";
import {
  finalizeWindowPlacementWithDefaults,
  placeDraftWindowOnWall,
  repositionPlacedWindowLeftEdge,
  saveWindowParamsAndRegenerateFraming,
  type SaveWindowParamsPayload,
} from "@/core/domain/openingWindowMutations";
import {
  placeDraftDoorOnWall,
  repositionPlacedDoorLeftEdge,
  saveDoorParams,
  type SaveDoorParamsPayload,
} from "@/core/domain/openingDoorMutations";
import {
  clampOpeningLeftEdgeMm,
  clampPlacedOpeningLeftEdgeMm,
  offsetFromStartForCursorCentered,
  pickClosestWallAlongPoint,
  validateWindowPlacementOnWall,
} from "@/core/domain/openingWindowGeometry";
import { editor3dPickSupportsContextDelete } from "@/core/domain/editor3dContextMenuPolicy";
import { deleteEntitiesFromProject } from "@/core/domain/projectMutations";
import {
  applyRoofCalculationToProject,
  refreshAllCalculatedRoofPlaneOverhangsInProject,
  refreshRoofOverhangForJoinPairInProject,
} from "@/core/domain/roofCalculationPipeline";
import { buildViewportTransform, type ViewportTransform } from "@/core/geometry/viewportTransform";
import type { Point2D } from "@/core/geometry/types";
import {
  DOOR_SWING_PICK_DEAD_ZONE_MM,
  doorCursorLocalDots,
  resolveDoorSwingWithHysteresis,
} from "@/core/geometry/doorSwingPick2d";
import { applyWallDirectionAngleSnapToPoint } from "@/core/geometry/wallDirectionAngleSnap";
import { resolveSnap2d, type SnapKind } from "@/core/geometry/snap2d";
import {
  findWallPlacementShiftLockSnapHit,
  resolveWallPlacementToolSnap,
  type WallToolSnapLayerBias,
} from "@/core/geometry/wallPlacementSnap2d";
import {
  computeLengthChangePreviewAlongAxis,
  computeLinearSecondPointPreview,
  computeShiftDirectionLockUnit,
  unitDirectionOrNull,
} from "@/core/geometry/shiftDirectionLock2d";
import { computeProfileThickness, MIN_WALL_SEGMENT_LENGTH_MM, setProjectOrigin } from "@/core/domain/wallOps";
import type {
  EntityCopyParamsModalState,
  EntityCopySession,
  EntityCopyStrategyId,
  EntityCopyTarget,
} from "@/core/domain/entityCopySession";
import { applyEntityCopyWithAnchorTargets } from "@/core/domain/entityCopyApply";
import { computeEntityCopyAnchorWorldTargets } from "@/core/domain/entityCopyStrategies";
import {
  buildEntityCopySnapMarkers,
  collectEntityCopySnapPointsForFullScene,
  collectEntityCopySnapPointsForSourceTarget,
  computeEntityCopyPickTargetRefWorldMm,
  layerIdsForEntityCopy,
  resolveEntityCopySnap,
} from "@/core/domain/entityCopySnapSystem";
import { distanceAlongWallAxisFromStartUnclampedMm } from "@/core/domain/wallCalculationGeometry";
import { translateWallInProject } from "@/core/domain/wallTranslate";
import type { WallMoveCopySession } from "@/core/domain/wallMoveCopySession";
import { initialLine2dSession, type Line2dSession } from "@/core/domain/line2dSession";
import { initialRuler2dSession, type Ruler2dSession } from "@/core/domain/ruler2dSession";
import type { LengthChange2dSession, LengthChange2dTarget } from "@/core/domain/lengthChange2dSession";
import { applyLinearLengthChangeInProject } from "@/core/domain/linearLengthChangeApply";
import {
  axisFromFixedTowardMovingFloorBeam,
  fixedRefEndpointForFloorBeamLengthChange,
  floorBeamRefLengthMm,
} from "@/core/domain/floorBeamLengthChangeGeometry";
import {
  axisFromFixedTowardMoving,
  fixedEndpointForLengthChange,
  lengthFromSnappedPointForWallLengthEdit,
  movingEndpointForLengthMm,
} from "@/core/domain/wallLengthChangeGeometry";
import { wallLengthMm } from "@/core/domain/wallCalculationGeometry";
import { closestPointOnSegment } from "@/core/domain/wallJointGeometry";
import { commitWallPlacementSecondPoint } from "@/core/domain/wallPlacementCommit";
import type { WallPlacementSession } from "@/core/domain/wallPlacement";
import { initialWallPlacementPhase } from "@/core/domain/wallPlacement";
import { commitFloorBeamPlacementSecondPoint } from "@/core/domain/floorBeamPlacementCommit";
import type { FloorBeamPlacementSession } from "@/core/domain/floorBeamPlacement";
import { initialFloorBeamPlacementPhase } from "@/core/domain/floorBeamPlacement";
import {
  floorBeamPlacementSecondPointFromNumericInput,
  linearSecondPointFromNumericInput,
  type FloorBeamPlacementNumericField,
} from "@/core/domain/floorBeamPlacementNumericPreview";
import { mergeFloorBeamPlacementPreviewFromRawWorldMm } from "@/core/domain/floorBeamPlacementPreviewApply";
import { applyFloorBeamSplitInProject } from "@/core/domain/floorBeamSplit";
import type { FloorBeamSplitMode } from "@/core/domain/floorBeamSplitMode";
import { beamPlanThicknessAndVerticalMm, isProfileUsableForFloorBeam } from "@/core/domain/floorBeamSection";
import {
  initialRoofContourJoinSession,
  type RoofContourJoinSession,
} from "@/core/domain/roofContourJoin";
import {
  areRoofJoinEdgePairCompatibleMm,
  joinTwoRoofPlaneContoursBySelectedEdgesMm,
  roofJoinEdgeTangentsParallelMm,
} from "@/core/domain/roofContourJoinGeometry";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import {
  isProfileUsableForRoofPlane,
  nextRoofPlaneSlopeIndex,
  roofPlaneEntityApplyPlanQuadMm,
  roofPlaneImplicitQuadVerticesMm,
  roofPlaneNormalAndDepthFromCursorMm,
  roofPlanePolygonMm,
} from "@/core/domain/roofPlane";
import {
  clampRoofQuadEdgeDeltaMm,
  tryMoveRoofQuadEdgeMm,
  type RoofQuad4,
} from "@/core/domain/roofPlaneQuadEditGeometry";
import { applyCornerWallJoint, applyTeeWallJoint } from "@/core/domain/wallJointApply";
import type { WallEndSide, WallJointKind } from "@/core/domain/wallJoint";
import type { WallJointSession } from "@/core/domain/wallJointSession";
import { pickNearestWallEnd, pickWallSegmentInterior } from "@/core/domain/wallJointPick";
import { narrowProjectToActiveLayer } from "@/core/domain/projectLayerSlice";
import type { SlabBuildMode } from "@/core/domain/settings";
import {
  addSlabToProject,
  createSlabFromPolygon,
  translateSlabsInProjectByIds,
  updateSlabInProject,
} from "@/core/domain/slabOps";
import { rectangleCornersFromDiagonalMm } from "@/core/domain/slabPolygon";
import type { RoofSystemKind } from "@/core/domain/roofSystem";
import { applyManualRoofPlaneParamsInProject } from "@/core/domain/roofPlaneManualParamsApply";
import { addRectangleRoofSystemToProject, replaceRectangleRoofSystemInProject } from "@/core/domain/roofSystemToProject";
import type { MonoCardinalDrain } from "@/core/domain/roofSystemRectangleGeometry";
import type { SlabStructuralPurpose } from "@/core/domain/slab";
import type { FoundationPileEntity, FoundationPileKind } from "@/core/domain/foundationPile";
import type { FoundationPileMoveCopySession } from "@/core/domain/foundationPileMoveCopySession";
import type { FloorBeamMoveCopySession } from "@/core/domain/floorBeamMoveCopySession";
import { translateFoundationPilesInProject } from "@/core/domain/foundationPileOps";
import { translateFloorBeamsInProject } from "@/core/domain/floorBeamOps";
import type { FoundationStripAutoPileSettings, FoundationStripSegmentEntity } from "@/core/domain/foundationStrip";
import {
  applyAutoPilePersistToStripGroup,
  buildFoundationPileEntitiesFromAutoLayout,
  computeAutoFoundationPileLayout,
  removeFoundationPilesWithBatchId,
  removeFoundationPilesWithUnreferencedAutoBatchOnLayer,
} from "@/core/domain/foundationStripAutoPiles";
import {
  buildOrthoRectangleFoundationStripRingEntity,
  mergeCollinearFoundationStripSegments,
} from "@/core/domain/foundationStripGeometry";
import {
  findFoundationStripIdContainingPlanPointMm,
  getConnectedFoundationStripsOnLayer,
  mergeTouchingFoundationStripBands,
} from "@/core/domain/foundationStripMerge";
import {
  pickOutwardNormalForStripAxisMm,
  referenceWallIdFromSnapForFoundationStrip,
} from "@/features/editor2d/foundationStripNormals2d";
import { pickClosestFoundationPileHandle } from "@/features/editor2d/foundationPilePick2d";
import {
  pickRoofContourJoinHoverMm,
  pickRoofContourJoinSecondEdgeHoverMm,
} from "@/features/editor2d/roofContourJoinPick2d";
import { snapFloorBeamMoveBasePoint } from "@/features/editor2d/floorBeamPick2d";
import { buildWallCalculationForWall, SipWallLayoutError } from "@/core/domain/sipWallLayout";
import type { WallShapeMode } from "@/core/domain/wallShapeMode";
import {
  type Editor2dPlanScope,
  type EditorTab,
  viewport3dWithPlanOrbitTargetMm,
} from "@/core/domain/viewState";
import { setLastOpenedProjectId } from "@/data/lastOpenedProjectId";
import { createProjectInDb, updateProjectSnapshot } from "@/data/projectFirestoreRepository";
import { syncProjectToFirestore } from "@/data/projectFirestoreSync";
import { tryGetFirestoreDb } from "@/firebase/app";
import { deserializeProject } from "@/core/io/serialization";
import { pickAndLoadProject, saveProjectWithFallback } from "@/core/io/projectFile";
import { validateProjectSchema } from "@/core/validation/validateProjectSchema";
import type { Editor3dPickPayload } from "@/core/domain/editor3dPickPayload";
import {
  applySurfaceTextureToProject,
  meshKeyFromEditorPick,
  type SurfaceTextureApplyMode,
} from "@/core/domain/surfaceTextureOps";
import { pickLayerIdForSurfaceTexture } from "@/core/domain/surfaceTexturePick";
import type { TextureApply3dParamsModalState } from "@/core/domain/textureApply3dModal";
import { getTextureCatalogEntry } from "@/core/textures/textureCatalog";
import type { LinearProfilePlacementMode } from "@/core/geometry/linearPlacementGeometry";
import { isSceneCoordinateModalBlocking } from "@/shared/sceneCoordinateModalLock";
import {
  appendPastClearFuture,
  capFutureFront,
  cloneProjectSnapshot,
  filterSelectionToExistingProjectIds,
  initialProjectHistory,
  mergeLiveNavigationIntoProject,
  projectsModelEqual,
  PROJECT_HISTORY_LIMIT,
  type ProjectHistoryStacks,
} from "@/store/projectHistory";

export type ActiveTool = "select" | "pan" | "ruler" | "changeLength" | "line";

export type FoundationStripBuildMode = "linear" | "rectangle";

export interface FoundationStripPlacementDraft {
  readonly depthMm: number;
  readonly side1Mm: number;
  readonly side2Mm: number;
  readonly buildMode: FoundationStripBuildMode;
}

export interface FoundationStripPlacementSession {
  readonly draft: FoundationStripPlacementDraft;
  readonly phase: "waitingFirstPoint" | "waitingSecondPoint";
  readonly firstPointMm: Point2D | null;
  readonly previewEndMm: Point2D | null;
  readonly lastSnapKind: SnapKind | null;
  readonly lastReferenceWallId: string | null;
}

export type SlabPlacementPhase = "waitingFirstPoint" | "waitingSecondPoint" | "polylineDrawing";

export interface SlabPlacementDraftPersisted {
  readonly depthMm: number;
  readonly levelMm: number;
  readonly purpose: SlabStructuralPurpose;
}

export interface SlabPlacementSession {
  readonly draft: SlabPlacementDraftPersisted;
  readonly buildMode: SlabBuildMode;
  readonly phase: SlabPlacementPhase;
  readonly firstPointMm: Point2D | null;
  readonly polylineVerticesMm: readonly Point2D[];
  readonly previewEndMm: Point2D | null;
  readonly lastSnapKind: SnapKind | null;
}

export interface RoofPlanePlacementDraftPersisted {
  readonly angleDeg: number;
  readonly levelMm: number;
  readonly profileId: string;
}

export type RoofPlanePlacementPhase = "waitingFirstPoint" | "waitingSecondPoint" | "waitingDepth";

export interface RoofPlanePlacementSession {
  readonly draft: RoofPlanePlacementDraftPersisted;
  readonly phase: RoofPlanePlacementPhase;
  readonly p1: Point2D | null;
  readonly p2: Point2D | null;
  readonly previewEndMm: Point2D | null;
  readonly lastSnapKind: SnapKind | null;
  readonly angleSnapLockedDeg: number | null;
  readonly shiftDirectionLockUnit: Point2D | null;
  readonly shiftLockReferenceMm: Point2D | null;
  readonly depthShiftLockNormal: Point2D | null;
  readonly previewDepthMm: number | null;
  readonly previewSlopeNormal: Point2D | null;
}

export interface RoofSystemPlacementDraftPersisted {
  readonly roofKind: RoofSystemKind;
  readonly pitchDeg: number;
  readonly baseLevelMm: number;
  readonly profileId: string;
  readonly eaveOverhangMm: number;
  readonly sideOverhangMm: number;
  readonly ridgeAlong: "short" | "long";
  readonly monoDrainCardinal: MonoCardinalDrain;
}

export type RoofSystemPlacementPhase = "waitingFirstCorner" | "waitingSecondCorner";

export interface RoofSystemPlacementSession {
  readonly draft: RoofSystemPlacementDraftPersisted;
  readonly phase: RoofSystemPlacementPhase;
  readonly firstPointMm: Point2D | null;
  readonly previewEndMm: Point2D | null;
  readonly lastSnapKind: SnapKind | null;
}

export interface FoundationPilePlacementDraft {
  readonly pileKind: FoundationPileKind;
  readonly sizeMm: number;
  readonly capSizeMm: number;
  readonly heightMm: number;
  readonly levelMm: number;
}

export interface FoundationPilePlacementSession {
  readonly draft: FoundationPilePlacementDraft;
  readonly previewWorldMm: Point2D | null;
  readonly lastSnapKind: SnapKind | null;
}

/** Окно создано из модалки, ожидает привязку к стене (этап 2). */
export interface PendingWindowPlacement {
  readonly openingId: string;
}
export type PendingDoorPlacementPhase = "pickWall" | "chooseSwing";

export interface PendingDoorPlacement {
  readonly openingId: string;
  readonly phase: PendingDoorPlacementPhase;
  /** Этап выбора открывания: зафиксированная стена и левый край проёма, мм. */
  readonly wallId?: string;
  readonly leftAlongMm?: number;
  readonly swingPreview?: DoorOpeningSwing;
}

export type WindowEditModalTab = "form" | "position" | "sip";

/** Редактирование размещённого окна (вкладки после установки на стену). */
export interface WindowEditModalState {
  readonly openingId: string;
  readonly initialTab: WindowEditModalTab;
}
export interface DoorEditModalState {
  readonly openingId: string;
  readonly initialTab: WindowEditModalTab;
}

/** Одна мобильная шторка за раз (bottom sheet). */
export type MobileSheetId =
  | "mainMenu"
  | "planView"
  | "planTopTools"
  | "editorTools"
  | "properties"
  | "placementRails";

export interface UiPanelsState {
  readonly rightPropertiesOpen: boolean;
  /** Bottom sheet на телефоне; null — закрыто. */
  readonly mobileSheet: MobileSheetId | null;
}

export type UndoRedoSkeleton = ProjectHistoryStacks;

interface AppState {
  readonly currentProject: Project;
  readonly selectedEntityIds: readonly string[];
  readonly activeTool: ActiveTool;
  readonly viewport2d: Project["viewState"]["viewport2d"];
  readonly viewport3d: Project["viewState"]["viewport3d"];
  readonly activeTab: EditorTab;
  readonly uiPanels: UiPanelsState;
  readonly layerManagerOpen: boolean;
  /** Список слоёв в UI: только текущий раздел 2D или все слои проекта. */
  readonly layerListDisplayMode: "context" | "project";
  readonly layerParamsModalOpen: boolean;
  readonly profilesModalOpen: boolean;
  readonly addWallModalOpen: boolean;
  readonly addWindowModalOpen: boolean;
  readonly addDoorModalOpen: boolean;
  readonly pendingWindowPlacement: PendingWindowPlacement | null;
  readonly pendingDoorPlacement: PendingDoorPlacement | null;
  /** Последние параметры «Добавить окно» (липкие вставки и префилл модалки). */
  readonly lastWindowPlacementParams: AddWindowDraftPayload | null;
  /** Последние параметры «Добавить дверь». */
  readonly lastDoorPlacementParams: AddDoorDraftPayload | null;
  readonly windowEditModal: WindowEditModalState | null;
  readonly doorEditModal: DoorEditModalState | null;
  readonly wallJointParamsModalOpen: boolean;
  /** Ручной инструмент «Угловое соединение» после выбора типа в модалке. */
  readonly wallJointSession: WallJointSession | null;
  /** Режим постановки стены на 2D (после модалки «Добавить стену»). */
  readonly wallPlacementSession: WallPlacementSession | null;
  readonly addFoundationStripModalOpen: boolean;
  readonly foundationStripPlacementSession: FoundationStripPlacementSession | null;
  readonly foundationStripPlacementHistoryBaseline: Project | null;
  readonly addFoundationPileModalOpen: boolean;
  readonly foundationPilePlacementSession: FoundationPilePlacementSession | null;
  readonly foundationPilePlacementHistoryBaseline: Project | null;
  /** Двойной клик по ленте: параметры авто-свай для связной группы лент. */
  readonly foundationStripAutoPilesModal: { readonly seedStripId: string } | null;
  /** Липкие параметры «Добавить плиту» по контексту (перекрытие / фундамент). */
  readonly lastSlabPlacementParamsByPurpose: Readonly<
    Record<SlabStructuralPurpose, { readonly depthMm: number; readonly levelMm: number }>
  >;
  readonly addSlabModalOpen: boolean;
  /** Контекст открытой модалки плиты (совпадает с выбранным режимом слева). */
  readonly addSlabModalPurpose: SlabStructuralPurpose | null;
  readonly slabPlacementSession: SlabPlacementSession | null;
  readonly slabPlacementHistoryBaseline: Project | null;
  readonly slabCoordinateModalOpen: boolean;
  readonly slabEditModal: { readonly slabId: string } | null;
  readonly addFloorBeamModalOpen: boolean;
  readonly floorBeamPlacementSession: FloorBeamPlacementSession | null;
  readonly floorBeamPlacementHistoryBaseline: Project | null;
  readonly floorBeamSplitModalOpen: boolean;
  /** Активен режим «Разделить»: после «Применить» в модалке — клик по балке. */
  readonly floorBeamSplitSession: { readonly mode: FloorBeamSplitMode; readonly overlapMm: number } | null;
  readonly addRoofPlaneModalOpen: boolean;
  readonly lastRoofPlanePlacementParams: RoofPlanePlacementDraftPersisted | null;
  readonly roofPlanePlacementSession: RoofPlanePlacementSession | null;
  readonly roofPlanePlacementHistoryBaseline: Project | null;
  readonly lastRoofSystemPlacementParams: RoofSystemPlacementDraftPersisted | null;
  readonly roofSystemPlacementSession: RoofSystemPlacementSession | null;
  readonly roofSystemPlacementHistoryBaseline: Project | null;
  /** Редактирование параметров крыши-генератора (двойной клик по скату). */
  readonly roofSystemEditModal: { readonly roofSystemId: string } | null;
  /** Редактирование ручной плоскости крыши. */
  readonly roofPlaneEditModal: { readonly roofPlaneId: string } | null;
  /** Стыковка контуров скатов (режим «Крыша»). */
  readonly roofContourJoinSession: RoofContourJoinSession | null;
  readonly roofContourJoinHistoryBaseline: Project | null;
  readonly wallCoordinateModalOpen: boolean;
  /** Пробел: ручной ввод ΔX/ΔY второй точки балки перекрытия (только превью, без коммита). */
  readonly floorBeamPlacementCoordinateModalOpen: boolean;
  /** Модалка смещения начала стены от опорной точки (Пробел после выбора опоры). */
  readonly wallAnchorCoordinateModalOpen: boolean;
  /** Режим «Точка привязки»: опорная точка и смещение для начала стены (вместе с «Добавить стену»). */
  readonly wallAnchorPlacementModeActive: boolean;
  readonly wallPlacementAnchorMm: Point2D | null;
  readonly wallPlacementAnchorPreviewEndMm: Point2D | null;
  readonly wallPlacementAnchorLastSnapKind: SnapKind | null;
  /** Гистерезис угловой привязки вектора «опора → начало стены». */
  readonly wallPlacementAnchorAngleSnapLockedDeg: number | null;
  /** Контекстное меню стены на 2D (экранные координаты). */
  readonly wallContextMenu: { readonly wallId: string; readonly clientX: number; readonly clientY: number } | null;
  /** Контекстное меню сваи на 2D (экранные координаты, position: fixed). */
  readonly foundationPileContextMenu: { readonly pileId: string; readonly clientX: number; readonly clientY: number } | null;
  /** Контекстное меню балки перекрытия на 2D. */
  readonly floorBeamContextMenu: { readonly beamId: string; readonly clientX: number; readonly clientY: number } | null;
  /** Линия / лента / проём: только действия вроде «Копировать». */
  readonly editor2dSecondaryContextMenu:
    | { readonly scope: "planLine"; readonly id: string; readonly clientX: number; readonly clientY: number }
    | { readonly scope: "foundationStrip"; readonly id: string; readonly clientX: number; readonly clientY: number }
    | { readonly scope: "slab"; readonly id: string; readonly clientX: number; readonly clientY: number }
    | { readonly scope: "opening"; readonly id: string; readonly clientX: number; readonly clientY: number }
    | null;
  /** Перенос или копия стены двумя точками (как постановка стены). */
  readonly wallMoveCopySession: WallMoveCopySession | null;
  /** Перенос или копия сваи: базовая точка → цель с привязкой. */
  readonly foundationPileMoveCopySession: FoundationPileMoveCopySession | null;
  /** Перенос балки перекрытия: базовая точка → цель с привязкой. */
  readonly floorBeamMoveCopySession: FloorBeamMoveCopySession | null;
  /** Пробел: смещение второй точки переноса/копии. */
  readonly wallMoveCopyCoordinateModalOpen: boolean;
  /** Пробел: ручной ввод смещения при переносе балки (вторая стадия). */
  readonly floorBeamMoveCopyCoordinateModalOpen: boolean;
  /** Какое поле X/Y сфокусировать при открытии модалки координат (горячие клавиши X/Y). */
  readonly sceneCoordModalDesiredFocus: "x" | "y" | null;
  readonly wallCalculationModalOpen: boolean;
  readonly roofCalculationModalOpen: boolean;
  readonly dirty: boolean;
  readonly lastError: string | null;
  readonly history: UndoRedoSkeleton;
  /** Снимок до начала постановки стены (модалка «Добавить стену») — один undo на завершённую стену. */
  readonly wallPlacementHistoryBaseline: Project | null;
  /** Снимок до добавления черновика окна/двери — один undo на полную установку. */
  readonly pendingOpeningPlacementHistoryBaseline: Project | null;
  /** Снимок до переноса/копии стены. */
  readonly wallMoveCopyHistoryBaseline: Project | null;
  /** Снимок до переноса/копии сваи. */
  readonly foundationPileMoveCopyHistoryBaseline: Project | null;
  /** Снимок до переноса балки. */
  readonly floorBeamMoveCopyHistoryBaseline: Project | null;
  /** Универсальное копирование по двум точкам (House Creator): привязка → конец отрезка → параметры. */
  readonly entityCopySession: EntityCopySession | null;
  readonly entityCopyParamsModal: EntityCopyParamsModalState | null;
  readonly entityCopyHistoryBaseline: Project | null;
  /** Пробел / координаты: ручной ввод смещения второй точки универсального копирования. */
  readonly entityCopyCoordinateModalOpen: boolean;
  /** Снимок до изменения длины по торцу. */
  readonly lengthChangeHistoryBaseline: Project | null;
  readonly persistenceReady: boolean;
  readonly persistenceStatus: "idle" | "loading" | "saving" | "saved" | "error";
  readonly firestoreEnabled: boolean;
  /** Размер canvas 2D для привязки и модалки координат (не персистится). */
  readonly viewportCanvas2dPx: { readonly width: number; readonly height: number } | null;
  /** Режим редактирования смещения выбранного проёма по размерным линиям. */
  readonly openingMoveModeActive: boolean;
  /** Выбранная стена для режима «Вид стены». */
  readonly wallDetailWallId: string | null;
  /** Замер расстояния на 2D (только при activeTool === "ruler"). */
  readonly ruler2dSession: Ruler2dSession | null;
  /** Чертежная линия на 2D (только при activeTool === "line"). */
  readonly line2dSession: Line2dSession | null;
  /** Изменение длины стены по торцу (только при activeTool === "changeLength"). */
  readonly lengthChange2dSession: LengthChange2dSession | null;
  /** Пробел: точный ввод Δ длины (мм) в режиме изменения длины. */
  readonly lengthChangeCoordinateModalOpen: boolean;
  /** Перенос базовой точки плана (0,0) без сдвига геометрии. */
  readonly projectOriginMoveToolActive: boolean;
  readonly projectOriginCoordinateModalOpen: boolean;
  /** Пробел во время перетаскивания проёма: точный ввод смещения вдоль стены (мм). */
  readonly openingAlongMoveNumericModalOpen: boolean;
  /** Точный ввод смещения ребра контура плоскости крыши (мм), режим «Крыша». */
  readonly roofPlaneEdgeOffsetModal: {
    readonly planeId: string;
    readonly edgeIndex: number;
    readonly baseQuad: RoofQuad4;
    readonly initialValueStr: string;
  } | null;
  /**
   * 2D: временно скрыть бейдж активного слоя, пока видна карточка подсказки инструмента
   * (исключение наложения в левом верхнем углу canvas).
   */
  readonly editor2dSuppressActiveLayerBadge: boolean;
  /** 3D: назначение текстур по raycast. */
  readonly textureApply3dToolActive: boolean;
  readonly textureApply3dParamsModal: TextureApply3dParamsModalState | null;
  /** ПКМ по объекту в 3D: контекстное меню (экранные координаты + pick). */
  readonly editor3dContextMenu: {
    readonly clientX: number;
    readonly clientY: number;
    readonly pick: Editor3dPickPayload;
  } | null;
  /** Увеличивается после удаления из 3D-меню — сброс hover в оболочке 3D. */
  readonly editor3dContextDeleteEpoch: number;
}

interface AppActions {
  setSelectedEntityIds: (ids: readonly string[]) => void;
  clearSelection: () => void;
  deleteSelectedEntities: () => void;
  openEditor3dContextMenu: (payload: {
    readonly clientX: number;
    readonly clientY: number;
    readonly pick: Editor3dPickPayload;
  }) => void;
  closeEditor3dContextMenu: () => void;
  /** Удаляет сущность из открытого 3D-контекстного меню (как deleteEntitiesFromProject). */
  deleteEntityFromEditor3dContextMenu: () => void;
  setActiveTool: (tool: ActiveTool) => void;
  setViewport2d: (v: Project["viewState"]["viewport2d"]) => void;
  setViewport3d: (v: Project["viewState"]["viewport3d"]) => void;
  setActiveTab: (tab: EditorTab) => void;
  toggleRightPanel: () => void;
  openMobileSheet: (id: MobileSheetId) => void;
  closeMobileSheet: () => void;
  setRightPropertiesCollapsed: (collapsed: boolean) => void;
  setShow3dProfileLayers: (show: boolean) => void;
  setShow2dProfileLayers: (show: boolean) => void;
  setShow3dCalculation: (show: boolean) => void;
  /** Видимость категорий 3D (OSB/EPS/каркас; окна/двери — заготовка). */
  set3dLayerVisibility: (
    patch: Partial<
      Pick<
        Project["viewState"],
        | "show3dLayerOsb"
        | "show3dLayerEps"
        | "show3dLayerFrame"
        | "show3dLayerGypsum"
        | "show3dLayerWindows"
        | "show3dLayerDoors"
        | "show3dGrid"
        | "show3dFoundation"
        | "show3dPiles"
        | "show3dOverlap"
        | "show3dRoof"
        | "show3dRoofMembrane"
        | "show3dRoofBattens"
        | "show3dRoofCovering"
        | "show3dRoofSoffit"
      >
    >,
  ) => void;
  markClean: () => void;
  undo: () => void;
  redo: () => void;
  bootstrapDemo: () => void;
  createNewProject: () => void;
  openProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  importProjectJson: (json: string) => void;
  /** Новые сущности плана в будущем создавать на активном слое. */
  getActiveLayerIdForNewEntities: () => string;
  createLayer: (input: { readonly name: string; readonly elevationMm: number; readonly domain?: LayerDomain }) => void;
  goToPreviousLayer: () => void;
  goToNextLayer: () => void;
  deleteCurrentLayer: () => void;
  setActiveLayer: (layerId: string) => void;
  updateLayer: (layerId: string, patch: LayerUpdatePatch) => void;
  reorderLayerUp: (layerId: string) => void;
  reorderLayerDown: (layerId: string) => void;
  moveLayerToStackIndex: (layerId: string, targetSortedIndex: number) => void;
  deleteLayerById: (layerId: string) => void;
  openLayerManager: () => void;
  /** Модалка «Все слои проекта» (без фильтра по разделу). */
  openProjectLayersManager: () => void;
  setLayerListDisplayMode: (mode: "context" | "project") => void;
  setEditor2dSuppressActiveLayerBadge: (suppress: boolean) => void;
  closeLayerManager: () => void;
  openLayerParamsModal: () => void;
  closeLayerParamsModal: () => void;
  toggleVisibleLayer: (layerId: string) => void;
  openProfilesModal: () => void;
  closeProfilesModal: () => void;
  upsertProfile: (profile: Profile) => boolean;
  removeProfileById: (profileId: string) => void;
  duplicateProfileById: (profileId: string) => void;
  openAddWallModal: () => void;
  closeAddWallModal: () => void;
  openAddSlabModal: (purpose: SlabStructuralPurpose) => void;
  closeAddSlabModal: () => void;
  applyAddSlabModal: (input: { readonly depthMm: number; readonly levelMm: number }) => void;
  cancelSlabPlacement: () => void;
  slabPlacementBackOrExit: () => void;
  slabPlacementPreviewMove: (worldMm: Point2D, viewport: ViewportTransform) => void;
  slabPlacementPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly clickDetail?: number },
  ) => void;
  slabPlacementTryFinishPolylineByEnter: () => void;
  openSlabCoordinateModal: (opts?: { readonly focus?: "x" | "y" }) => void;
  closeSlabCoordinateModal: () => void;
  applySlabCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
  applySlabsWorldDeltaMm: (
    slabIds: readonly string[],
    dxMm: number,
    dyMm: number,
    opts?: { readonly skipHistory?: boolean },
  ) => void;
  openSlabEditModal: (slabId: string) => void;
  closeSlabEditModal: () => void;
  applySlabEditModal: (input: { readonly depthMm: number; readonly levelMm: number }) => void;
  setSlabBuildMode: (mode: SlabBuildMode) => void;
  openAddFoundationStripModal: () => void;
  closeAddFoundationStripModal: () => void;
  applyAddFoundationStripModal: (input: {
    readonly depthMm: number;
    readonly side1Mm: number;
    readonly side2Mm: number;
    readonly buildMode: FoundationStripBuildMode;
  }) => void;
  cancelFoundationStripPlacement: () => void;
  foundationStripPlacementBackOrExit: () => void;
  foundationStripPlacementPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
  ) => void;
  foundationStripPlacementPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
  ) => void;
  openAddFoundationPileModal: () => void;
  closeAddFoundationPileModal: () => void;
  applyAddFoundationPileModal: (input: FoundationPilePlacementDraft) => void;
  cancelFoundationPilePlacement: () => void;
  foundationPilePlacementPreviewMove: (worldMm: Point2D, viewport: ViewportTransform) => void;
  foundationPilePlacementPrimaryClick: (worldMm: Point2D, viewport: ViewportTransform) => void;
  applyFoundationPilesWorldDeltaMm: (
    pileIds: readonly string[],
    dxMm: number,
    dyMm: number,
    opts?: { readonly skipHistory?: boolean },
  ) => void;
  openFoundationStripAutoPilesModal: (seedStripId: string) => void;
  closeFoundationStripAutoPilesModal: () => void;
  applyFoundationStripAutoPiles: (
    action: "buildNew" | "update" | "delete",
    settings: FoundationStripAutoPileSettings,
  ) => void;
  openAddWindowModal: () => void;
  closeAddWindowModal: () => void;
  openAddDoorModal: () => void;
  closeAddDoorModal: () => void;
  /** Создать окно в проекте по данным вкладки «Форма окна». */
  applyWindowFormModal: (input: AddWindowDraftPayload) => void;
  applyDoorFormModal: (input: AddDoorDraftPayload) => void;
  /** Отмена режима установки: удалить черновик окна без стены. */
  clearPendingWindowPlacement: () => void;
  clearPendingDoorPlacement: () => void;
  /**
   * Esc / ПКМ в режиме установки: отменить текущую попытку; инструмент остаётся активным
   * (новый черновик с теми же параметрами для окна; для двери — шаг назад или новый черновик).
   */
  abortPendingWindowPlacement: () => void;
  abortPendingDoorPlacement: () => void;
  tryCommitPendingWindowPlacementAtWorld: (worldMm: { readonly x: number; readonly y: number }) => void;
  tryCommitPendingDoorPlacementAtWorld: (worldMm: { readonly x: number; readonly y: number }) => void;
  updatePendingDoorSwingAtWorld: (worldMm: { readonly x: number; readonly y: number }) => void;
  closeWindowEditModal: () => void;
  applyWindowEditModal: (payload: SaveWindowParamsPayload) => void;
  closeDoorEditModal: () => void;
  applyDoorEditModal: (payload: SaveDoorParamsPayload) => void;
  /** Повторное открытие модалки для окна, уже стоящего на стене. */
  openWindowEditModal: (openingId: string, initialTab?: WindowEditModalTab) => void;
  openDoorEditModal: (openingId: string, initialTab?: WindowEditModalTab) => void;
  /** Перемещение окна вдоль стены (левый край, мм); без lastError — для drag. false если невалидно. */
  applyOpeningRepositionLeftEdge: (
    openingId: string,
    leftEdgeMm: number,
    opts?: { readonly skipHistory?: boolean },
  ) => boolean;
  /** Сохранить проект после редактирования размеров в «Виде стены» (пересчёт стены уже выполнен в домене). */
  commitWallDetailProjectUpdate: (nextProject: Project) => void;
  setOpeningMoveModeActive: (active: boolean) => void;
  toggleOpeningMoveMode: () => void;
  setOpeningAlongMoveNumericModalOpen: (open: boolean) => void;
  openRoofPlaneEdgeOffsetModal: (input: {
    planeId: string;
    edgeIndex: number;
    baseQuad: RoofQuad4;
    initialValueStr: string;
  }) => void;
  closeRoofPlaneEdgeOffsetModal: () => void;
  applyRoofPlaneEdgeOffsetModal: (offsetMm: number) => void;
  applyRoofPlaneQuadLive: (planeId: string, quad: RoofQuad4, opts?: { readonly skipHistory?: boolean }) => void;
  toggleProjectOriginMoveTool: () => void;
  openProjectOriginCoordinateModal: () => void;
  closeProjectOriginCoordinateModal: () => void;
  applyProjectOriginCoordinateModalWorldMm: (pt: Point2D) => void;
  applyProjectOriginAtWorldMm: (pt: Point2D) => void;
  openWallDetail: (wallId: string) => void;
  closeWallDetail: () => void;
  openWallJointParamsModal: () => void;
  closeWallJointParamsModal: () => void;
  applyWallJointParamsModal: (kind: WallJointKind) => void;
  /**
   * Esc / ПКМ: при выборе второй стены — вернуться к первой; в фазе выбора первой — выйти из инструмента.
   */
  wallJointBackOrExit: () => void;
  wallJointPrimaryClick: (worldMm: { readonly x: number; readonly y: number }, toleranceMm: number) => void;
  applyAddWallModal: (input: {
    readonly profileId: string;
    readonly heightMm: number;
    readonly baseElevationMm: number;
  }) => void;
  /** Полностью выключить инструмент стены (сессия сбрасывается). */
  cancelWallPlacement: () => void;
  /**
   * Esc / ПКМ: если ждём вторую точку — отменить текущий сегмент и вернуться к первой точке;
   * иначе сбросить незавершённый штрих, оставаясь в инструменте «Добавить стену» с тем же черновиком.
   */
  wallPlacementBackOrExit: () => void;
  setViewportCanvas2dPx: (width: number, height: number) => void;
  wallPlacementPreviewMove: (
    worldMm: { readonly x: number; readonly y: number },
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  /** Shift keydown: зафиксировать направление второй точки (стена / линейка / перенос). */
  linearPlacementEngageShiftDirectionLock: (
    cursorWorldMm: Point2D,
    viewport: ViewportTransform,
  ) => void;
  /** Shift keyup: снять фиксацию направления. */
  linearPlacementReleaseShiftDirectionLock: () => void;
  /** Preview первой точки / начала координат: snap и маркер до клика. */
  wallPlacementFirstPointHoverMove: (
    worldMm: { readonly x: number; readonly y: number },
    viewport: ViewportTransform,
  ) => void;
  wallPlacementPrimaryClick: (
    worldMm: { readonly x: number; readonly y: number },
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  wallPlacementCompleteSecondPoint: (secondSnappedMm: { readonly x: number; readonly y: number }) => void;
  openAddFloorBeamModal: () => void;
  closeAddFloorBeamModal: () => void;
  applyAddFloorBeamModal: (input: {
    readonly profileId: string;
    readonly baseElevationMm: number;
    readonly sectionRolled: boolean;
  }) => void;
  cancelFloorBeamPlacement: () => void;
  floorBeamPlacementBackOrExit: () => void;
  floorBeamPlacementFirstPointHoverMove: (worldMm: Point2D, viewport: ViewportTransform) => void;
  floorBeamPlacementPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  floorBeamPlacementPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  floorBeamPlacementCompleteSecondPoint: (secondSnappedMm: Point2D) => boolean;
  openFloorBeamSplitModal: () => void;
  closeFloorBeamSplitModal: () => void;
  applyFloorBeamSplitModal: (input: { readonly mode: FloorBeamSplitMode; readonly overlapMm: number }) => void;
  cancelFloorBeamSplitTool: () => void;
  floorBeamSplitCommitOnBeamClick: (input: {
    readonly beamId: string;
    readonly rawWorldMm: Point2D;
    readonly viewport: ViewportTransform;
  }) => void;
  setEditor2dPlanScope: (scope: Editor2dPlanScope) => void;
  openAddRoofPlaneModal: () => void;
  closeAddRoofPlaneModal: () => void;
  applyAddRoofPlaneModal: (input: {
    readonly angleDeg: number;
    readonly levelMm: number;
    readonly profileId: string;
  }) => void;
  applyAddRoofSystemModal: (input: {
    readonly roofKind: RoofSystemKind;
    readonly pitchDeg: number;
    readonly baseLevelMm: number;
    readonly profileId: string;
    readonly eaveOverhangMm: number;
    readonly sideOverhangMm: number;
    readonly ridgeAlong: "short" | "long";
    readonly monoDrainCardinal: MonoCardinalDrain;
  }) => void;
  openRoofSystemEditModal: (roofSystemId: string) => void;
  closeRoofSystemEditModal: () => void;
  applyRoofSystemEditModal: (input: {
    readonly roofKind: RoofSystemKind;
    readonly pitchDeg: number;
    readonly baseLevelMm: number;
    readonly profileId: string;
    readonly eaveOverhangMm: number;
    readonly sideOverhangMm: number;
    readonly ridgeAlong: "short" | "long";
    readonly monoDrainCardinal: MonoCardinalDrain;
  }) => void;
  openRoofPlaneEditModal: (roofPlaneId: string) => void;
  closeRoofPlaneEditModal: () => void;
  applyRoofPlaneEditModal: (input: { readonly angleDeg: number; readonly levelMm: number; readonly profileId: string }) => void;
  cancelRoofSystemPlacement: () => void;
  roofSystemPlacementBackOrExit: () => void;
  roofSystemPlacementPreviewMove: (worldMm: Point2D, viewport: ViewportTransform) => void;
  roofSystemPlacementPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly clickDetail?: number },
  ) => void;
  cancelRoofPlanePlacement: () => void;
  roofPlanePlacementBackOrExit: () => void;
  roofPlanePlacementFirstPointHoverMove: (worldMm: Point2D, viewport: ViewportTransform) => void;
  roofPlanePlacementSecondPointPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  roofPlanePlacementDepthPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  roofPlanePlacementPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  startRoofContourJoinTool: () => void;
  cancelRoofContourJoinTool: () => void;
  roofContourJoinBackOrExit: () => void;
  roofContourJoinPointerMove: (worldMm: Point2D, viewport: ViewportTransform) => void;
  roofContourJoinPrimaryClick: (worldMm: Point2D, viewport: ViewportTransform) => void;
  setLinearPlacementMode: (mode: LinearProfilePlacementMode) => void;
  setWallShapeMode: (mode: WallShapeMode) => void;
  setSnapToVertex: (value: boolean) => void;
  setSnapToEdge: (value: boolean) => void;
  setSnapToGrid: (value: boolean) => void;
  /** Только отображение сетки на 2D-плане; не связано с привязкой к сетке и с 3D-сеткой. */
  setShow2dGrid: (value: boolean) => void;
  openWallCoordinateModal: (opts?: { readonly focus?: "x" | "y" }) => void;
  closeWallCoordinateModal: () => void;
  applyWallCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
  openFloorBeamPlacementCoordinateModal: (opts?: { readonly focus?: "x" | "y" }) => void;
  closeFloorBeamPlacementCoordinateModal: () => void;
  applyFloorBeamPlacementCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
  /** Ручной ввод X/Y/D у live-HUD: та же цепочка snap, затем commit, как второй клик. */
  floorBeamPlacementCommitNumericField: (input: {
    readonly field: FloorBeamPlacementNumericField;
    readonly valueMm: number;
  }) => boolean;
  wallMoveCopyApplyNumericPreviewField: (input: {
    readonly field: FloorBeamPlacementNumericField;
    readonly valueMm: number;
  }) => void;
  floorBeamMoveCopyApplyNumericPreviewField: (input: {
    readonly field: FloorBeamPlacementNumericField;
    readonly valueMm: number;
  }) => void;
  entityCopyApplyNumericPreviewField: (input: {
    readonly field: FloorBeamPlacementNumericField;
    readonly valueMm: number;
  }) => void;
  openWallContextMenu: (input: { readonly wallId: string; readonly clientX: number; readonly clientY: number }) => void;
  closeWallContextMenu: () => void;
  deleteWallFromContextMenu: (wallId: string) => void;
  startWallMoveFromContextMenu: (wallId: string) => void;
  startWallCopyFromContextMenu: (wallId: string) => void;
  openFoundationPileContextMenu: (input: {
    readonly pileId: string;
    readonly clientX: number;
    readonly clientY: number;
  }) => void;
  closeFoundationPileContextMenu: () => void;
  openEditor2dSecondaryContextMenu: (
    input:
      | { readonly scope: "planLine"; readonly id: string; readonly clientX: number; readonly clientY: number }
      | { readonly scope: "foundationStrip"; readonly id: string; readonly clientX: number; readonly clientY: number }
      | { readonly scope: "slab"; readonly id: string; readonly clientX: number; readonly clientY: number }
      | { readonly scope: "opening"; readonly id: string; readonly clientX: number; readonly clientY: number },
  ) => void;
  closeEditor2dSecondaryContextMenu: () => void;
  deleteFoundationPileFromContextMenu: (pileId: string) => void;
  startFoundationPileMoveFromContextMenu: (pileId: string) => void;
  startFoundationPileCopyFromContextMenu: (pileId: string) => void;
  cancelFoundationPileMoveCopy: () => void;
  foundationPileMoveCopyPreviewMove: (worldMm: Point2D, viewport: ViewportTransform) => void;
  foundationPileMoveCopyPrimaryClick: (worldMm: Point2D, viewport: ViewportTransform) => void;
  openFloorBeamContextMenu: (input: {
    readonly beamId: string;
    readonly clientX: number;
    readonly clientY: number;
  }) => void;
  closeFloorBeamContextMenu: () => void;
  deleteFloorBeamFromContextMenu: (beamId: string) => void;
  startFloorBeamMoveFromContextMenu: (beamId: string) => void;
  startFloorBeamCopyFromContextMenu: (beamId: string) => void;
  cancelFloorBeamMoveCopy: () => void;
  floorBeamMoveCopyPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  floorBeamMoveCopyPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  cancelWallMoveCopy: () => void;
  wallMoveCopyPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  wallMoveCopyPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  wallMoveCopyCommitTarget: (worldMm: Point2D) => void;
  openWallMoveCopyCoordinateModal: (opts?: { readonly focus?: "x" | "y" }) => void;
  closeWallMoveCopyCoordinateModal: () => void;
  applyWallMoveCopyCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
  openFloorBeamMoveCopyCoordinateModal: (opts?: { readonly focus?: "x" | "y" }) => void;
  closeFloorBeamMoveCopyCoordinateModal: () => void;
  applyFloorBeamMoveCopyCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
  setSceneCoordModalDesiredFocus: (focus: "x" | "y" | null) => void;
  startEntityCopyMode: (target: EntityCopyTarget) => void;
  cancelEntityCopyFlow: () => void;
  entityCopyPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  entityCopyPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  closeEntityCopyParamsModal: () => void;
  applyEntityCopyParamsModal: (input: {
    readonly strategy: EntityCopyStrategyId;
    readonly count: number;
  }) => void;
  openEntityCopyCoordinateModal: (opts?: { readonly focus?: "x" | "y" }) => void;
  closeEntityCopyCoordinateModal: () => void;
  applyEntityCopyCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
  toggleTextureApply3dTool: () => void;
  cancelTextureApply3dTool: () => void;
  openTextureApply3dParamsModal: (pick: Editor3dPickPayload) => void;
  closeTextureApply3dParamsModal: () => void;
  applyTextureApply3dParamsModal: (input: {
    readonly mode: SurfaceTextureApplyMode;
    readonly reset: boolean;
    readonly textureId: string;
    readonly scalePercent: number;
  }) => void;
  ruler2dPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  ruler2dPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  /** Esc: сброс замера или выход из линейки. */
  ruler2dCancel: () => void;
  line2dPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  line2dPrimaryClick: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  /** Esc: сброс черновика линии или выход из инструмента. */
  line2dCancel: () => void;
  /** После выбора торца — начать перетаскивание (клик–движение–клик). */
  startLengthChange2dSession: (
    target: LengthChange2dTarget,
    movingEnd: WallEndSide,
    worldMm: Point2D,
    viewport: ViewportTransform,
  ) => void;
  lengthChange2dPreviewMove: (
    worldMm: Point2D,
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  /** Второй ЛКМ: зафиксировать длину. */
  lengthChange2dCommit: () => void;
  /** Esc: отменить перетаскивание; если торец не выбран — выйти из инструмента. */
  lengthChange2dEsc: () => void;
  openLengthChangeCoordinateModal: () => void;
  closeLengthChangeCoordinateModal: () => void;
  /** Δ к исходной длинине (мм); применяет и закрывает режим перетаскивания. */
  applyLengthChangeCoordinateModal: (input: { readonly deltaMm: number }) => void;
  toggleWallAnchorPlacementMode: () => void;
  clearWallPlacementAnchor: () => void;
  wallPlacementAnchorPreviewMove: (
    worldMm: { readonly x: number; readonly y: number },
    viewport: ViewportTransform,
    opts?: { readonly altKey?: boolean },
  ) => void;
  openWallAnchorCoordinateModal: () => void;
  closeWallAnchorCoordinateModal: () => void;
  applyWallAnchorCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
  openWallCalculationModal: () => void;
  closeWallCalculationModal: () => void;
  applyWallCalculationModal: (input: {
    readonly clearWallFirst: boolean;
    readonly stage3Options?: Partial<WallCalculationStage3Options>;
  }) => void;
  openRoofCalculationModal: () => void;
  closeRoofCalculationModal: () => void;
  applyRoofCalculationModal: () => void;
  /** После серии правок без истории (например drag проёма) — одна запись undo, если модель изменилась. */
  recordUndoIfModelChangedSince: (baseline: Project) => void;
}

export type AppStore = AppState & AppActions;

let projectHistorySuppressDepth = 0;

/**
 * Выполнить обновления проекта без записи в undo (вложенные вызовы, внутренняя логика).
 */
export function runWithoutProjectHistory<T>(fn: () => T): T {
  projectHistorySuppressDepth += 1;
  try {
    return fn();
  } finally {
    projectHistorySuppressDepth -= 1;
  }
}

function shouldRecordProjectHistory(): boolean {
  return projectHistorySuppressDepth === 0;
}

/** Убрать черновики проёмов из проекта при смене инструмента/модалки создания. */
function projectWithoutPendingOpeningDrafts(
  currentProject: Project,
  pendingWindow: PendingWindowPlacement | null,
  pendingDoor: PendingDoorPlacement | null,
): { project: Project; mutated: boolean } {
  let p = currentProject;
  let mutated = false;
  if (pendingWindow) {
    p = removeUnplacedWindowDraft(p, pendingWindow.openingId);
    mutated = true;
  }
  if (pendingDoor) {
    p = removeUnplacedWindowDraft(p, pendingDoor.openingId);
    mutated = true;
  }
  return { project: p, mutated };
}

function historyJumpClearTransientUi(s: AppStore, restored: Project): Partial<AppStore> {
  const wd =
    s.wallDetailWallId && restored.walls.some((w) => w.id === s.wallDetailWallId) ? s.wallDetailWallId : null;
  return {
    wallPlacementSession: null,
    wallJointSession: null,
    pendingWindowPlacement: null,
    pendingDoorPlacement: null,
    lastWindowPlacementParams: null,
    lastDoorPlacementParams: null,
    windowEditModal: null,
    doorEditModal: null,
    wallMoveCopySession: null,
    wallMoveCopyCoordinateModalOpen: false,
    floorBeamMoveCopyCoordinateModalOpen: false,
    sceneCoordModalDesiredFocus: null,
    wallCalculationModalOpen: false,
    roofCalculationModalOpen: false,
    wallCoordinateModalOpen: false,
    floorBeamPlacementCoordinateModalOpen: false,
    wallAnchorCoordinateModalOpen: false,
    wallAnchorPlacementModeActive: false,
    wallPlacementAnchorMm: null,
    wallPlacementAnchorPreviewEndMm: null,
    wallPlacementAnchorLastSnapKind: null,
    wallPlacementAnchorAngleSnapLockedDeg: null,
    wallContextMenu: null,
    foundationPileContextMenu: null,
    floorBeamContextMenu: null,
    editor2dSecondaryContextMenu: null,
    foundationPileMoveCopySession: null,
    foundationPileMoveCopyHistoryBaseline: null,
    floorBeamMoveCopySession: null,
    floorBeamMoveCopyHistoryBaseline: null,
    entityCopySession: null,
    entityCopyParamsModal: null,
    entityCopyHistoryBaseline: null,
    entityCopyCoordinateModalOpen: false,
    openingMoveModeActive: false,
    ruler2dSession: null,
    line2dSession: null,
    lengthChange2dSession: null,
    lengthChangeCoordinateModalOpen: false,
    projectOriginMoveToolActive: false,
    projectOriginCoordinateModalOpen: false,
    openingAlongMoveNumericModalOpen: false,
    roofPlaneEdgeOffsetModal: null,
    wallPlacementHistoryBaseline: null,
    pendingOpeningPlacementHistoryBaseline: null,
    wallMoveCopyHistoryBaseline: null,
    lengthChangeHistoryBaseline: null,
    addWallModalOpen: false,
    addWindowModalOpen: false,
    addDoorModalOpen: false,
    wallJointParamsModalOpen: false,
    addFoundationStripModalOpen: false,
    foundationStripPlacementSession: null,
    foundationStripPlacementHistoryBaseline: null,
    addFoundationPileModalOpen: false,
    foundationPilePlacementSession: null,
    foundationPilePlacementHistoryBaseline: null,
    foundationStripAutoPilesModal: null,
    addSlabModalOpen: false,
    addSlabModalPurpose: null,
    slabPlacementSession: null,
    slabPlacementHistoryBaseline: null,
    slabCoordinateModalOpen: false,
    slabEditModal: null,
    addFloorBeamModalOpen: false,
    floorBeamPlacementSession: null,
    floorBeamPlacementHistoryBaseline: null,
    floorBeamSplitModalOpen: false,
    floorBeamSplitSession: null,
    addRoofPlaneModalOpen: false,
    lastRoofPlanePlacementParams: null,
    roofPlanePlacementSession: null,
    roofPlanePlacementHistoryBaseline: null,
    lastRoofSystemPlacementParams: null,
    roofSystemPlacementSession: null,
    roofSystemPlacementHistoryBaseline: null,
    roofSystemEditModal: null,
    roofPlaneEditModal: null,
    roofContourJoinSession: null,
    roofContourJoinHistoryBaseline: null,
    activeTool: "select",
    wallDetailWallId: wd,
    textureApply3dToolActive: false,
    textureApply3dParamsModal: null,
    editor3dContextMenu: null,
    editor3dContextDeleteEpoch: 0,
    editor2dSuppressActiveLayerBadge: false,
  };
}

function buildProjectMutationState(
  s: AppStore,
  nextProject: Project,
  extra: Partial<AppStore> = {},
  opt?: { readonly historyBefore?: Project; readonly skipHistory?: boolean },
): Partial<AppStore> {
  const merged = mergeLiveNavigationIntoProject(nextProject, {
    viewport2d: s.viewport2d,
    viewport3d: s.viewport3d,
    activeTab: s.activeTab,
  });
  if (opt?.skipHistory || !shouldRecordProjectHistory()) {
    return { currentProject: merged, ...extra };
  }
  const beforeSnap = cloneProjectSnapshot(opt?.historyBefore ?? s.currentProject);
  return {
    currentProject: merged,
    history: appendPastClearFuture(s.history, beforeSnap),
    ...extra,
  };
}

function resolvePlacementSnap(
  get: () => AppStore,
  rawWorldMm: { readonly x: number; readonly y: number },
  viewport: ViewportTransform | null,
  excludeFoundationPileId?: string,
  excludeFloorBeamId?: string,
) {
  const p0 = get().currentProject;
  const e2 = p0.settings.editor2d;
  return resolveSnap2d({
    rawWorldMm,
    viewport,
    project: p0,
    snapSettings: {
      snapToVertex: e2.snapToVertex,
      snapToEdge: e2.snapToEdge,
      snapToGrid: e2.snapToGrid,
    },
    gridStepMm: p0.settings.gridStepMm,
    excludeFoundationPileId,
    excludeFloorBeamId,
  });
}

function resolveWallPlacementSnapFromStore(
  get: () => AppStore,
  rawWorldMm: { readonly x: number; readonly y: number },
  viewport: ViewportTransform | null,
  opts?: { readonly snapLayerBias?: WallToolSnapLayerBias },
) {
  const p0 = get().currentProject;
  const e2 = p0.settings.editor2d;
  return resolveWallPlacementToolSnap({
    rawWorldMm,
    viewport,
    project: p0,
    snapSettings: {
      snapToVertex: e2.snapToVertex,
      snapToEdge: e2.snapToEdge,
      snapToGrid: e2.snapToGrid,
    },
    gridStepMm: p0.settings.gridStepMm,
    linearPlacementMode: e2.linearPlacementMode,
    snapLayerBias: opts?.snapLayerBias,
  });
}

function editor2dSnapSettings(project: Project) {
  const e2 = project.settings.editor2d;
  return {
    snapToVertex: e2.snapToVertex,
    snapToEdge: e2.snapToEdge,
    snapToGrid: e2.snapToGrid,
  };
}

function mergeViewState(
  project: Project,
  patch: Partial<Project["viewState"]>,
): Project {
  return {
    ...project,
    viewState: { ...project.viewState, ...patch },
  };
}

function runFoundationStripAutoPilesImpl(
  get: () => AppStore,
  set: (partial: Partial<AppStore> | ((s: AppStore) => Partial<AppStore>)) => void,
  action: "buildNew" | "update" | "delete",
  settings: FoundationStripAutoPileSettings,
): void {
  const modal = get().foundationStripAutoPilesModal;
  if (!modal) {
    return;
  }
  const p0 = get().currentProject;
  const seed = p0.foundationStrips.find((s) => s.id === modal.seedStripId);
  if (!seed) {
    set({ lastError: "Лента не найдена.", foundationStripAutoPilesModal: null });
    return;
  }
  const layerId = seed.layerId;
  const group = getConnectedFoundationStripsOnLayer(p0.foundationStrips, layerId, modal.seedStripId);
  const groupIds = new Set(group.map((s) => s.id));

  if (action === "delete") {
    const historyBefore = cloneProjectSnapshot(p0);
    const batchIds = new Set(group.map((s) => s.autoPile?.batchId).filter((x): x is string => Boolean(x)));
    const strips = p0.foundationStrips.map((s) => (groupIds.has(s.id) ? { ...s, autoPile: undefined } : s));
    let piles: FoundationPileEntity[] = [...p0.foundationPiles];
    for (const bid of batchIds) {
      piles = removeFoundationPilesWithBatchId(piles, bid);
    }
    piles = removeFoundationPilesWithUnreferencedAutoBatchOnLayer(piles, strips, layerId);
    const next = touchProjectMeta({ ...p0, foundationPiles: piles, foundationStrips: strips });
    set((st) =>
      buildProjectMutationState(
        st,
        next,
        {
          foundationStripAutoPilesModal: null,
          dirty: true,
          lastError: null,
        },
        { historyBefore },
      ),
    );
    return;
  }

  if (settings.pileKind !== "reinforcedConcrete") {
    set({ lastError: "Авто-сваи пока только для железобетонной сваи." });
    return;
  }

  const layout = computeAutoFoundationPileLayout(group, settings);
  if (!layout || layout.pileCentersMm.length === 0) {
    set({ lastError: "Не удалось построить сетку свай (проверьте геометрию лент)." });
    return;
  }

  /** Снимок до любых правок foundationPiles/foundationStrips — один шаг Undo откатывает всё действие целиком. */
  const historyBefore = cloneProjectSnapshot(p0);

  const oldBatches = new Set(group.map((s) => s.autoPile?.batchId).filter((x): x is string => Boolean(x)));
  let batchId: string;
  if (action === "update" && oldBatches.size === 1) {
    batchId = [...oldBatches][0]!;
  } else {
    batchId = newEntityId();
  }

  let piles: FoundationPileEntity[] = [...p0.foundationPiles];
  for (const bid of oldBatches) {
    piles = removeFoundationPilesWithBatchId(piles, bid);
  }
  piles = removeFoundationPilesWithUnreferencedAutoBatchOnLayer(piles, p0.foundationStrips, layerId);

  const newPiles = buildFoundationPileEntitiesFromAutoLayout(layout, {
    layerId,
    batchId,
    newPileId: newEntityId,
    nowIso: () => new Date().toISOString(),
  });
  const autoPilePersist = { settings, batchId };
  const strips = applyAutoPilePersistToStripGroup(p0.foundationStrips, groupIds, autoPilePersist);
  const next = touchProjectMeta({
    ...p0,
    foundationPiles: [...piles, ...newPiles],
    foundationStrips: strips,
  });
  set((st) =>
    buildProjectMutationState(
      st,
      next,
      {
        foundationStripAutoPilesModal: null,
        dirty: true,
        lastError: null,
      },
      { historyBefore },
    ),
  );
}

function slabCloseToleranceMm(viewport: ViewportTransform): number {
  const z = viewport.zoomPixelsPerMm;
  return Math.max(20, 35 / Math.max(z, 1e-6));
}

function newSlabPlacementSession(project: Project, draft: SlabPlacementDraftPersisted): SlabPlacementSession {
  return {
    draft,
    buildMode: project.settings.editor2d.slabBuildMode,
    phase: "waitingFirstPoint",
    firstPointMm: null,
    polylineVerticesMm: [],
    previewEndMm: null,
    lastSnapKind: null,
  };
}

function newRoofPlanePlacementSession(draft: RoofPlanePlacementDraftPersisted): RoofPlanePlacementSession {
  return {
    draft,
    phase: "waitingFirstPoint",
    p1: null,
    p2: null,
    previewEndMm: null,
    lastSnapKind: null,
    angleSnapLockedDeg: null,
    shiftDirectionLockUnit: null,
    shiftLockReferenceMm: null,
    depthShiftLockNormal: null,
    previewDepthMm: null,
    previewSlopeNormal: null,
  };
}

function newRoofSystemPlacementSession(draft: RoofSystemPlacementDraftPersisted): RoofSystemPlacementSession {
  return {
    draft,
    phase: "waitingFirstCorner",
    firstPointMm: null,
    previewEndMm: null,
    lastSnapKind: null,
  };
}

function tryCommitSlabOutline(
  project: Project,
  session: SlabPlacementSession,
  pointsMm: readonly Point2D[],
):
  | { readonly ok: true; readonly nextProject: Project; readonly slabId: string; readonly nextSession: SlabPlacementSession }
  | { readonly ok: false; readonly error: string } {
  const created = createSlabFromPolygon({
    layerId: project.activeLayerId,
    pointsMm,
    levelMm: session.draft.levelMm,
    depthMm: session.draft.depthMm,
    structuralPurpose: session.draft.purpose,
  });
  if ("error" in created) {
    return { ok: false, error: created.error };
  }
  const nextProject = addSlabToProject(project, created.slab);
  const nextSession = newSlabPlacementSession(nextProject, session.draft);
  return { ok: true, nextProject, slabId: created.slab.id, nextSession };
}

export const useAppStore = create<AppStore>((set, get) => {
  const empty = createEmptyProject();
  return {
    currentProject: empty,
    selectedEntityIds: [],
    activeTool: "select",
    viewport2d: empty.viewState.viewport2d,
    viewport3d: empty.viewState.viewport3d,
    activeTab: empty.viewState.activeTab,
    uiPanels: { rightPropertiesOpen: true, mobileSheet: null },
    layerManagerOpen: false,
    layerListDisplayMode: "context",
    layerParamsModalOpen: false,
    profilesModalOpen: false,
    addWallModalOpen: false,
    addWindowModalOpen: false,
    addDoorModalOpen: false,
    pendingWindowPlacement: null,
    pendingDoorPlacement: null,
    lastWindowPlacementParams: null,
    lastDoorPlacementParams: null,
    windowEditModal: null,
    doorEditModal: null,
    wallJointParamsModalOpen: false,
    wallJointSession: null,
    wallPlacementSession: null,
    addFoundationStripModalOpen: false,
    foundationStripPlacementSession: null,
    foundationStripPlacementHistoryBaseline: null,
    addFoundationPileModalOpen: false,
    foundationPilePlacementSession: null,
    foundationPilePlacementHistoryBaseline: null,
    foundationStripAutoPilesModal: null,
    lastSlabPlacementParamsByPurpose: {
      overlap: { depthMm: 1000, levelMm: 0 },
      foundation: { depthMm: 1000, levelMm: 0 },
    },
    addSlabModalOpen: false,
    addSlabModalPurpose: null,
    slabPlacementSession: null,
    slabPlacementHistoryBaseline: null,
    slabCoordinateModalOpen: false,
    slabEditModal: null,
    addFloorBeamModalOpen: false,
    floorBeamPlacementSession: null,
    floorBeamPlacementHistoryBaseline: null,
    floorBeamSplitModalOpen: false,
    floorBeamSplitSession: null,
    addRoofPlaneModalOpen: false,
    lastRoofPlanePlacementParams: null,
    roofPlanePlacementSession: null,
    roofPlanePlacementHistoryBaseline: null,
    lastRoofSystemPlacementParams: null,
    roofSystemPlacementSession: null,
    roofSystemPlacementHistoryBaseline: null,
    roofSystemEditModal: null,
    roofPlaneEditModal: null,
    roofContourJoinSession: null,
    roofContourJoinHistoryBaseline: null,
    wallCoordinateModalOpen: false,
    floorBeamPlacementCoordinateModalOpen: false,
    wallAnchorCoordinateModalOpen: false,
    wallAnchorPlacementModeActive: false,
    wallPlacementAnchorMm: null,
    wallPlacementAnchorPreviewEndMm: null,
    wallPlacementAnchorLastSnapKind: null,
    wallPlacementAnchorAngleSnapLockedDeg: null,
    wallContextMenu: null,
    foundationPileContextMenu: null,
    floorBeamContextMenu: null,
    editor2dSecondaryContextMenu: null,
    wallMoveCopySession: null,
    foundationPileMoveCopySession: null,
    floorBeamMoveCopySession: null,
    wallMoveCopyCoordinateModalOpen: false,
    floorBeamMoveCopyCoordinateModalOpen: false,
    sceneCoordModalDesiredFocus: null,
    wallCalculationModalOpen: false,
    roofCalculationModalOpen: false,
    dirty: false,
    lastError: null,
    history: initialProjectHistory,
    wallPlacementHistoryBaseline: null,
    pendingOpeningPlacementHistoryBaseline: null,
    wallMoveCopyHistoryBaseline: null,
    foundationPileMoveCopyHistoryBaseline: null,
    floorBeamMoveCopyHistoryBaseline: null,
    entityCopySession: null,
    entityCopyParamsModal: null,
    entityCopyHistoryBaseline: null,
    entityCopyCoordinateModalOpen: false,
    lengthChangeHistoryBaseline: null,
    persistenceReady: false,
    persistenceStatus: "loading",
    firestoreEnabled: false,
    viewportCanvas2dPx: null,
    openingMoveModeActive: false,
    wallDetailWallId: null,
    ruler2dSession: null,
    line2dSession: null,
    lengthChange2dSession: null,
    lengthChangeCoordinateModalOpen: false,
    projectOriginMoveToolActive: false,
    projectOriginCoordinateModalOpen: false,
    openingAlongMoveNumericModalOpen: false,
    roofPlaneEdgeOffsetModal: null,
    textureApply3dToolActive: false,
    textureApply3dParamsModal: null,
    editor3dContextMenu: null,
    editor3dContextDeleteEpoch: 0,
    editor2dSuppressActiveLayerBadge: false,

    setViewportCanvas2dPx: (width, height) =>
      set({
        viewportCanvas2dPx:
          Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
            ? { width, height }
            : null,
      }),

    setEditor2dSuppressActiveLayerBadge: (suppress) => set({ editor2dSuppressActiveLayerBadge: suppress }),

    setSelectedEntityIds: (ids) => set({ selectedEntityIds: ids }),

    clearSelection: () => set({ selectedEntityIds: [] }),

    deleteSelectedEntities: () => {
      const { currentProject, selectedEntityIds } = get();
      if (selectedEntityIds.length === 0) {
        return;
      }
      const next = deleteEntitiesFromProject(currentProject, new Set(selectedEntityIds));
      set((s) =>
        buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true, lastError: null }),
      );
    },

    openEditor3dContextMenu: (payload) => set({ editor3dContextMenu: payload }),

    closeEditor3dContextMenu: () => set({ editor3dContextMenu: null }),

    deleteEntityFromEditor3dContextMenu: () => {
      set((s) => {
        const menu = s.editor3dContextMenu;
        if (!menu || !editor3dPickSupportsContextDelete(menu.pick)) {
          return {};
        }
        const id = menu.pick.entityId;
        const next = deleteEntitiesFromProject(s.currentProject, new Set([id]));
        return buildProjectMutationState(s, next, {
          selectedEntityIds: s.selectedEntityIds.filter((x) => x !== id),
          editor3dContextMenu: null,
          editor3dContextDeleteEpoch: s.editor3dContextDeleteEpoch + 1,
          dirty: true,
          lastError: null,
        });
      });
    },

    setActiveTool: (tool) =>
      set((s) => {
        let proj = s.currentProject;
        let dirty = s.dirty;
        let projectMutated = false;
        if (s.pendingWindowPlacement) {
          proj = removeUnplacedWindowDraft(proj, s.pendingWindowPlacement.openingId);
          dirty = true;
          projectMutated = true;
        }
        if (s.pendingDoorPlacement) {
          proj = removeUnplacedWindowDraft(proj, s.pendingDoorPlacement.openingId);
          dirty = true;
          projectMutated = true;
        }
        if (tool !== "select" && s.wallMoveCopySession?.mode === "copy") {
          proj = touchProjectMeta(deleteEntitiesFromProject(proj, new Set([s.wallMoveCopySession.workingWallId])));
          dirty = true;
          projectMutated = true;
        }
        if (tool !== "select" && s.foundationPileMoveCopySession?.mode === "copy") {
          proj = touchProjectMeta(
            deleteEntitiesFromProject(proj, new Set([s.foundationPileMoveCopySession.workingPileId])),
          );
          dirty = true;
          projectMutated = true;
        }
        const wallMoveCopySession = tool === "select" ? s.wallMoveCopySession : null;
        const wallMoveCopyCoordinateModalOpen = tool === "select" ? s.wallMoveCopyCoordinateModalOpen : false;
        const floorBeamMoveCopyCoordinateModalOpen = tool === "select" ? s.floorBeamMoveCopyCoordinateModalOpen : false;
        const wallContextMenu = tool === "select" ? s.wallContextMenu : null;
        const foundationPileMoveCopySession = tool === "select" ? s.foundationPileMoveCopySession : null;
        const foundationPileContextMenu = tool === "select" ? s.foundationPileContextMenu : null;
        const floorBeamMoveCopySession = tool === "select" ? s.floorBeamMoveCopySession : null;
        const floorBeamContextMenu = tool === "select" ? s.floorBeamContextMenu : null;
        const editor2dSecondaryContextMenu = tool === "select" ? s.editor2dSecondaryContextMenu : null;
        const entityCopySession = tool === "select" ? s.entityCopySession : null;
        const entityCopyParamsModal = tool === "select" ? s.entityCopyParamsModal : null;
        const entityCopyHistoryBaseline = tool === "select" ? s.entityCopyHistoryBaseline : null;
        const entityCopyCoordinateModalOpen = tool === "select" ? s.entityCopyCoordinateModalOpen : false;
        const commonClear = {
          currentProject: proj,
          dirty,
          wallMoveCopyHistoryBaseline: projectMutated ? null : s.wallMoveCopyHistoryBaseline,
          foundationPileMoveCopyHistoryBaseline: projectMutated ? null : s.foundationPileMoveCopyHistoryBaseline,
          floorBeamMoveCopyHistoryBaseline: projectMutated ? null : s.floorBeamMoveCopyHistoryBaseline,
          wallMoveCopySession,
          wallMoveCopyCoordinateModalOpen,
          floorBeamMoveCopyCoordinateModalOpen,
          wallContextMenu,
          foundationPileMoveCopySession,
          foundationPileContextMenu,
          floorBeamMoveCopySession,
          floorBeamContextMenu,
          editor2dSecondaryContextMenu,
          entityCopySession,
          entityCopyParamsModal,
          entityCopyHistoryBaseline,
          entityCopyCoordinateModalOpen,
          wallJointSession: null,
          wallJointParamsModalOpen: false,
          wallPlacementSession: null,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          addDoorModalOpen: false,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          pendingOpeningPlacementHistoryBaseline: null,
          projectOriginMoveToolActive: false,
          projectOriginCoordinateModalOpen: false,
          openingAlongMoveNumericModalOpen: false,
          roofPlaneEdgeOffsetModal: null,
          wallPlacementHistoryBaseline: null,
          addFoundationStripModalOpen: false,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          addFoundationPileModalOpen: false,
          foundationPilePlacementSession: null,
          foundationPilePlacementHistoryBaseline: null,
          addSlabModalOpen: false,
          addSlabModalPurpose: null,
          slabPlacementSession: null,
          slabPlacementHistoryBaseline: null,
          slabCoordinateModalOpen: false,
          slabEditModal: null,
          addFloorBeamModalOpen: false,
          floorBeamPlacementSession: null,
          floorBeamPlacementHistoryBaseline: null,
          floorBeamSplitModalOpen: false,
          floorBeamSplitSession: null,
        };
        const mergeHist = (base: Partial<AppStore>): Partial<AppStore> =>
          projectMutated ? { ...base, ...buildProjectMutationState(s, proj, { dirty: true }) } : base;
        if (tool === "select") {
          return mergeHist({
            activeTool: "select",
            ...commonClear,
            openingMoveModeActive: s.openingMoveModeActive,
            ruler2dSession: null,
            line2dSession: null,
            lengthChange2dSession: null,
            lengthChangeCoordinateModalOpen: false,
          });
        }
        if (tool === "ruler") {
          return mergeHist({
            activeTool: "ruler",
            ...commonClear,
            openingMoveModeActive: false,
            ruler2dSession: initialRuler2dSession(),
            line2dSession: null,
            lengthChange2dSession: null,
            lengthChangeCoordinateModalOpen: false,
          });
        }
        if (tool === "line") {
          return mergeHist({
            activeTool: "line",
            ...commonClear,
            openingMoveModeActive: false,
            ruler2dSession: null,
            line2dSession: initialLine2dSession(),
            lengthChange2dSession: null,
            lengthChangeCoordinateModalOpen: false,
          });
        }
        if (tool === "changeLength") {
          return mergeHist({
            activeTool: "changeLength",
            ...commonClear,
            openingMoveModeActive: false,
            ruler2dSession: null,
            line2dSession: null,
            lengthChange2dSession: null,
            lengthChangeCoordinateModalOpen: false,
          });
        }
        return mergeHist({
          activeTool: "pan",
          ...commonClear,
          openingMoveModeActive: false,
          ruler2dSession: null,
          line2dSession: null,
          lengthChange2dSession: null,
          lengthChangeCoordinateModalOpen: false,
        });
      }),

    setViewport2d: (v) =>
      set((s) => ({
        viewport2d: v,
        currentProject: mergeViewState(s.currentProject, { viewport2d: v }),
        dirty: true,
      })),

    setViewport3d: (v) =>
      set((s) => ({
        viewport3d: v,
        currentProject: mergeViewState(s.currentProject, { viewport3d: v }),
        dirty: true,
      })),

    setActiveTab: (tab) =>
      set((s) => {
        let proj = s.currentProject;
        if (tab !== "2d" && s.pendingWindowPlacement) {
          proj = removeUnplacedWindowDraft(proj, s.pendingWindowPlacement.openingId);
        }
        if (tab !== "2d" && s.pendingDoorPlacement) {
          proj = removeUnplacedWindowDraft(proj, s.pendingDoorPlacement.openingId);
        }
        if (tab !== "2d" && s.wallMoveCopySession?.mode === "copy") {
          proj = deleteEntitiesFromProject(proj, new Set([s.wallMoveCopySession.workingWallId]));
        }
        if (tab !== "2d" && s.foundationPileMoveCopySession?.mode === "copy") {
          proj = deleteEntitiesFromProject(proj, new Set([s.foundationPileMoveCopySession.workingPileId]));
        }
        const modelTouched =
          tab !== "2d" &&
          Boolean(
            s.pendingWindowPlacement ||
              s.pendingDoorPlacement ||
              s.wallMoveCopySession?.mode === "copy" ||
              s.foundationPileMoveCopySession?.mode === "copy",
          );
        const projectForView = modelTouched ? proj : s.currentProject;
        const nextProject = mergeViewState(projectForView, { activeTab: tab });
        const baselinePatch: Partial<AppStore> = {
          pendingOpeningPlacementHistoryBaseline:
            tab !== "2d" && (s.pendingWindowPlacement != null || s.pendingDoorPlacement != null)
              ? null
              : s.pendingOpeningPlacementHistoryBaseline,
          wallMoveCopyHistoryBaseline:
            tab !== "2d" && s.wallMoveCopySession?.mode === "copy" ? null : s.wallMoveCopyHistoryBaseline,
          foundationPileMoveCopyHistoryBaseline:
            tab !== "2d" && s.foundationPileMoveCopySession?.mode === "copy"
              ? null
              : s.foundationPileMoveCopyHistoryBaseline,
        };
        const staticPart: Partial<AppStore> = {
          uiPanels: { ...s.uiPanels, mobileSheet: null },
          activeTab: tab,
          activeTool:
            tab === "2d"
              ? s.activeTool
              : s.activeTool === "ruler" || s.activeTool === "changeLength" || s.activeTool === "line"
                ? "select"
                : s.activeTool,
          wallPlacementSession: tab === "2d" ? s.wallPlacementSession : null,
          floorBeamPlacementSession: tab === "2d" ? s.floorBeamPlacementSession : null,
          floorBeamPlacementHistoryBaseline: tab === "2d" ? s.floorBeamPlacementHistoryBaseline : null,
          addFloorBeamModalOpen: tab === "2d" ? s.addFloorBeamModalOpen : false,
          floorBeamSplitModalOpen: tab === "2d" ? s.floorBeamSplitModalOpen : false,
          floorBeamSplitSession: tab === "2d" ? s.floorBeamSplitSession : null,
          addRoofPlaneModalOpen: tab === "2d" ? s.addRoofPlaneModalOpen : false,
          roofPlanePlacementSession: tab === "2d" ? s.roofPlanePlacementSession : null,
          roofPlanePlacementHistoryBaseline: tab === "2d" ? s.roofPlanePlacementHistoryBaseline : null,
          roofSystemPlacementSession: tab === "2d" ? s.roofSystemPlacementSession : null,
          roofSystemPlacementHistoryBaseline: tab === "2d" ? s.roofSystemPlacementHistoryBaseline : null,
          roofSystemEditModal: tab === "2d" ? s.roofSystemEditModal : null,
          roofPlaneEditModal: tab === "2d" ? s.roofPlaneEditModal : null,
          roofContourJoinSession: tab === "2d" ? s.roofContourJoinSession : null,
          roofContourJoinHistoryBaseline: tab === "2d" ? s.roofContourJoinHistoryBaseline : null,
          wallJointSession: tab === "2d" ? s.wallJointSession : null,
          wallJointParamsModalOpen: tab === "2d" ? s.wallJointParamsModalOpen : false,
          addWallModalOpen: tab === "2d" ? s.addWallModalOpen : false,
          addWindowModalOpen: tab === "2d" ? s.addWindowModalOpen : false,
          pendingWindowPlacement: tab === "2d" ? s.pendingWindowPlacement : null,
          pendingDoorPlacement: tab === "2d" ? s.pendingDoorPlacement : null,
          windowEditModal: tab === "2d" ? s.windowEditModal : null,
          wallCoordinateModalOpen: tab === "2d" ? s.wallCoordinateModalOpen : false,
          floorBeamPlacementCoordinateModalOpen: tab === "2d" ? s.floorBeamPlacementCoordinateModalOpen : false,
          wallAnchorCoordinateModalOpen: tab === "2d" ? s.wallAnchorCoordinateModalOpen : false,
          wallAnchorPlacementModeActive: tab === "2d" ? s.wallAnchorPlacementModeActive : false,
          wallPlacementAnchorMm: tab === "2d" ? s.wallPlacementAnchorMm : null,
          wallPlacementAnchorPreviewEndMm: tab === "2d" ? s.wallPlacementAnchorPreviewEndMm : null,
          wallPlacementAnchorLastSnapKind: tab === "2d" ? s.wallPlacementAnchorLastSnapKind : null,
          wallPlacementAnchorAngleSnapLockedDeg: tab === "2d" ? s.wallPlacementAnchorAngleSnapLockedDeg : null,
          wallContextMenu: tab === "2d" ? s.wallContextMenu : null,
          foundationPileContextMenu: tab === "2d" ? s.foundationPileContextMenu : null,
          floorBeamContextMenu: tab === "2d" ? s.floorBeamContextMenu : null,
          editor2dSecondaryContextMenu: tab === "2d" ? s.editor2dSecondaryContextMenu : null,
          wallMoveCopySession: tab === "2d" ? s.wallMoveCopySession : null,
          foundationPileMoveCopySession: tab === "2d" ? s.foundationPileMoveCopySession : null,
          floorBeamMoveCopySession: tab === "2d" ? s.floorBeamMoveCopySession : null,
          wallMoveCopyCoordinateModalOpen: tab === "2d" ? s.wallMoveCopyCoordinateModalOpen : false,
          floorBeamMoveCopyCoordinateModalOpen: tab === "2d" ? s.floorBeamMoveCopyCoordinateModalOpen : false,
          entityCopySession: tab === "2d" ? s.entityCopySession : null,
          entityCopyParamsModal: tab === "2d" ? s.entityCopyParamsModal : null,
          entityCopyHistoryBaseline: tab === "2d" ? s.entityCopyHistoryBaseline : null,
          entityCopyCoordinateModalOpen: tab === "2d" ? s.entityCopyCoordinateModalOpen : false,
          ruler2dSession: tab === "2d" ? s.ruler2dSession : null,
          line2dSession: tab === "2d" ? s.line2dSession : null,
          lengthChange2dSession: tab === "2d" ? s.lengthChange2dSession : null,
          lengthChangeCoordinateModalOpen: tab === "2d" ? s.lengthChangeCoordinateModalOpen : false,
          openingMoveModeActive: tab === "2d" ? s.openingMoveModeActive : false,
          projectOriginMoveToolActive: tab === "2d" ? s.projectOriginMoveToolActive : false,
          projectOriginCoordinateModalOpen: tab === "2d" ? s.projectOriginCoordinateModalOpen : false,
          openingAlongMoveNumericModalOpen: tab === "2d" ? s.openingAlongMoveNumericModalOpen : false,
          roofPlaneEdgeOffsetModal: tab === "2d" ? s.roofPlaneEdgeOffsetModal : null,
          wallDetailWallId:
            tab === "wall"
              ? s.wallDetailWallId ?? s.currentProject.walls.find((w) => s.selectedEntityIds.includes(w.id))?.id ?? null
              : s.wallDetailWallId,
          textureApply3dToolActive: tab === "3d" ? s.textureApply3dToolActive : false,
          textureApply3dParamsModal: tab === "3d" ? s.textureApply3dParamsModal : null,
          editor3dContextMenu: tab === "3d" ? s.editor3dContextMenu : null,
          ...baselinePatch,
        };
        if (modelTouched) {
          return {
            ...staticPart,
            ...buildProjectMutationState(s, nextProject, { dirty: true }),
          };
        }
        return {
          ...staticPart,
          currentProject: nextProject,
          dirty: true,
        };
      }),

    toggleRightPanel: () =>
      set((s) => ({
        uiPanels: { ...s.uiPanels, rightPropertiesOpen: !s.uiPanels.rightPropertiesOpen },
      })),

    openMobileSheet: (id) =>
      set((s) => ({
        uiPanels: { ...s.uiPanels, mobileSheet: id },
      })),

    closeMobileSheet: () =>
      set((s) => ({
        uiPanels: { ...s.uiPanels, mobileSheet: null },
      })),

    setRightPropertiesCollapsed: (collapsed) =>
      set((s) => ({
        currentProject: touchProjectMeta({
          ...s.currentProject,
          viewState: { ...s.currentProject.viewState, rightPropertiesCollapsed: collapsed },
        }),
        dirty: true,
      })),

    setShow3dProfileLayers: (show3dProfileLayers) =>
      set((s) => ({
        currentProject: touchProjectMeta(mergeViewState(s.currentProject, { show3dProfileLayers })),
        dirty: true,
      })),

    setShow2dProfileLayers: (show2dProfileLayers) =>
      set((s) => ({
        currentProject: touchProjectMeta(mergeViewState(s.currentProject, { show2dProfileLayers })),
        dirty: true,
      })),

    setShow3dCalculation: (show3dCalculation) =>
      set((s) => ({
        currentProject: touchProjectMeta(mergeViewState(s.currentProject, { show3dCalculation })),
        dirty: true,
      })),

    set3dLayerVisibility: (patch) =>
      set((s) => ({
        currentProject: touchProjectMeta(mergeViewState(s.currentProject, patch)),
        dirty: true,
      })),

    markClean: () => set({ dirty: false }),

    recordUndoIfModelChangedSince: (baseline) => {
      set((s) => {
        if (!shouldRecordProjectHistory()) {
          return {};
        }
        if (projectsModelEqual(baseline, s.currentProject)) {
          return {};
        }
        return {
          history: appendPastClearFuture(s.history, cloneProjectSnapshot(baseline)),
        };
      });
    },

    undo: () => {
      runWithoutProjectHistory(() => {
        set((s) => {
          if (s.history.past.length === 0) {
            return {};
          }
          const past = [...s.history.past];
          const snapshot = past.pop()!;
          const curSnap = cloneProjectSnapshot(s.currentProject);
          const restored = mergeLiveNavigationIntoProject(snapshot, {
            viewport2d: s.viewport2d,
            viewport3d: s.viewport3d,
            activeTab: s.activeTab,
          });
          const future = capFutureFront([curSnap, ...s.history.future]);
          const ui = historyJumpClearTransientUi(s, restored);
          return {
            ...ui,
            currentProject: restored,
            viewport2d: restored.viewState.viewport2d,
            viewport3d: restored.viewState.viewport3d,
            activeTab: restored.viewState.activeTab,
            history: { past, future },
            dirty: true,
            selectedEntityIds: filterSelectionToExistingProjectIds(s.selectedEntityIds, restored),
          };
        });
      });
    },
    redo: () => {
      runWithoutProjectHistory(() => {
        set((s) => {
          if (s.history.future.length === 0) {
            return {};
          }
          const future = [...s.history.future];
          const snapshot = future.shift()!;
          const curSnap = cloneProjectSnapshot(s.currentProject);
          const restored = mergeLiveNavigationIntoProject(snapshot, {
            viewport2d: s.viewport2d,
            viewport3d: s.viewport3d,
            activeTab: s.activeTab,
          });
          const past = [...s.history.past, curSnap];
          const cappedPast =
            past.length > PROJECT_HISTORY_LIMIT ? past.slice(-PROJECT_HISTORY_LIMIT) : past;
          const ui = historyJumpClearTransientUi(s, restored);
          return {
            ...ui,
            currentProject: restored,
            viewport2d: restored.viewState.viewport2d,
            viewport3d: restored.viewState.viewport3d,
            activeTab: restored.viewState.activeTab,
            history: { past: cappedPast, future },
            dirty: true,
            selectedEntityIds: filterSelectionToExistingProjectIds(s.selectedEntityIds, restored),
          };
        });
      });
    },

    getActiveLayerIdForNewEntities: () => {
      const p = get().currentProject;
      if (p.viewState.activeTab !== "2d") {
        return p.activeLayerId;
      }
      const domain = editor2dPlanScopeToLayerDomain(p.viewState.editor2dPlanScope);
      const active = getLayerById(p, p.activeLayerId);
      if (active?.domain === domain) {
        return p.activeLayerId;
      }
      const inScope = sortLayersForDomain(p, domain);
      return inScope[0]?.id ?? p.activeLayerId;
    },

    createLayer: (input) => {
      const p0 = get().currentProject;
      const domain =
        input.domain ??
        (p0.viewState.activeTab === "2d"
          ? editor2dPlanScopeToLayerDomain(p0.viewState.editor2dPlanScope)
          : "floorPlan");
      const next = createLayerInProject(p0, { ...input, domain });
      set((s) => buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true, lastError: null }));
    },

    goToPreviousLayer: () => {
      const p = get().currentProject;
      const id =
        p.viewState.activeTab === "2d"
          ? getAdjacentLayerIdInDomain(p, p.activeLayerId, "previous")
          : getPreviousLayerId(p);
      if (!id) {
        return;
      }
      const next = setActiveLayerId(p, id);
      if (next) {
        set((s) => buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true }));
      }
    },

    goToNextLayer: () => {
      const p = get().currentProject;
      const id =
        p.viewState.activeTab === "2d"
          ? getAdjacentLayerIdInDomain(p, p.activeLayerId, "next")
          : getNextLayerId(p);
      if (!id) {
        return;
      }
      const next = setActiveLayerId(p, id);
      if (next) {
        set((s) => buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true }));
      }
    },

    deleteCurrentLayer: () => {
      const id = get().currentProject.activeLayerId;
      const next = deleteLayerAndEntities(get().currentProject, id);
      if (!next) {
        set({ lastError: "Нельзя удалить последний слой." });
        return;
      }
      set((s) => buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true, lastError: null }));
    },

    setActiveLayer: (layerId) => {
      const next = setActiveLayerId(get().currentProject, layerId);
      if (next) {
        set((s) => buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true }));
      }
    },

    updateLayer: (layerId, patch) => {
      const next = updateLayerInProject(get().currentProject, layerId, patch);
      set((s) => buildProjectMutationState(s, next, { dirty: true }));
    },

    reorderLayerUp: (layerId) => {
      const p = get().currentProject;
      const next =
        get().layerListDisplayMode === "context"
          ? reorderLayerRelativeInDomain(p, layerId, "up")
          : reorderLayerRelative(p, layerId, "up");
      set((s) => buildProjectMutationState(s, next, { dirty: true }));
    },

    reorderLayerDown: (layerId) => {
      const p = get().currentProject;
      const next =
        get().layerListDisplayMode === "context"
          ? reorderLayerRelativeInDomain(p, layerId, "down")
          : reorderLayerRelative(p, layerId, "down");
      set((s) => buildProjectMutationState(s, next, { dirty: true }));
    },

    moveLayerToStackIndex: (layerId, targetSortedIndex) => {
      const p = get().currentProject;
      const next =
        get().layerListDisplayMode === "context"
          ? moveLayerToDomainSortedIndex(p, layerId, targetSortedIndex)
          : moveLayerToStackPosition(p, layerId, targetSortedIndex);
      set((s) => buildProjectMutationState(s, next, { dirty: true }));
    },

    deleteLayerById: (layerId) => {
      const next = deleteLayerAndEntities(get().currentProject, layerId);
      if (!next) {
        set({ lastError: "Нельзя удалить последний слой." });
        return;
      }
      set((s) => buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true, lastError: null }));
    },

    openLayerManager: () => set({ layerManagerOpen: true, layerListDisplayMode: "context" }),
    openProjectLayersManager: () => set({ layerManagerOpen: true, layerListDisplayMode: "project" }),
    setLayerListDisplayMode: (mode) => set({ layerListDisplayMode: mode }),
    closeLayerManager: () => set({ layerManagerOpen: false }),

    openLayerParamsModal: () => set({ layerParamsModalOpen: true, layerListDisplayMode: "context" }),
    closeLayerParamsModal: () => set({ layerParamsModalOpen: false }),

    toggleVisibleLayer: (layerId) => {
      const p = get().currentProject;
      if (layerId === p.activeLayerId) {
        return;
      }
      const cur = normalizeVisibleLayerIds(p);
      const nextSet = new Set(cur);
      if (nextSet.has(layerId)) {
        nextSet.delete(layerId);
      } else {
        nextSet.add(layerId);
      }
      const next = setVisibleLayerIdsOnProject(p, [...nextSet]);
      set((s) => buildProjectMutationState(s, next, { dirty: true }));
    },

    openProfilesModal: () => set({ profilesModalOpen: true }),
    closeProfilesModal: () => set({ profilesModalOpen: false }),

    upsertProfile: (profile) => {
      const errs = validateProfile(profile);
      if (errs.length > 0) {
        set({ lastError: errs.join(" ") });
        return false;
      }
      const p = get().currentProject;
      const exists = p.profiles.some((pr) => pr.id === profile.id);
      const next = exists ? updateProfileInProject(p, profile) : addProfileToProject(p, profile);
      set((s) => buildProjectMutationState(s, next, { dirty: true, lastError: null }));
      return true;
    },

    removeProfileById: (profileId) => {
      const next = removeProfileFromProject(get().currentProject, profileId);
      set((s) => buildProjectMutationState(s, next, { dirty: true, lastError: null }));
    },

    duplicateProfileById: (profileId) => {
      const next = duplicateProfileInProject(get().currentProject, profileId);
      if (next) {
        set((s) => buildProjectMutationState(s, next, { dirty: true, lastError: null }));
      }
    },

    openAddWallModal: () =>
      set((s) => {
        const { project, mutated } = projectWithoutPendingOpeningDrafts(
          s.currentProject,
          s.pendingWindowPlacement,
          s.pendingDoorPlacement,
        );
        const patch: Partial<AppStore> = {
          addWallModalOpen: true,
          addWindowModalOpen: false,
          addDoorModalOpen: false,
          addFoundationStripModalOpen: false,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          wallPlacementSession: null,
          wallJointSession: null,
          wallJointParamsModalOpen: false,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          pendingOpeningPlacementHistoryBaseline: null,
          foundationStripAutoPilesModal: null,
          addSlabModalOpen: false,
          addSlabModalPurpose: null,
          slabPlacementSession: null,
          slabPlacementHistoryBaseline: null,
          slabCoordinateModalOpen: false,
          slabEditModal: null,
          lastError: null,
        };
        return mutated ? { ...buildProjectMutationState(s, project, { ...patch, dirty: true }) } : patch;
      }),

    closeAddWallModal: () => set({ addWallModalOpen: false }),

    openAddFoundationStripModal: () =>
      set((s) => {
        const { project, mutated } = projectWithoutPendingOpeningDrafts(
          s.currentProject,
          s.pendingWindowPlacement,
          s.pendingDoorPlacement,
        );
        const patch: Partial<AppStore> = {
          addFoundationStripModalOpen: true,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          addDoorModalOpen: false,
          wallPlacementSession: null,
          wallPlacementHistoryBaseline: null,
          wallJointSession: null,
          wallJointParamsModalOpen: false,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          pendingOpeningPlacementHistoryBaseline: null,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          addFoundationPileModalOpen: false,
          foundationPilePlacementSession: null,
          foundationPilePlacementHistoryBaseline: null,
          foundationStripAutoPilesModal: null,
          addSlabModalOpen: false,
          addSlabModalPurpose: null,
          slabPlacementSession: null,
          slabPlacementHistoryBaseline: null,
          slabCoordinateModalOpen: false,
          slabEditModal: null,
          lastError: null,
        };
        return mutated ? { ...buildProjectMutationState(s, project, { ...patch, dirty: true }) } : patch;
      }),

    closeAddFoundationStripModal: () => set({ addFoundationStripModalOpen: false }),

    openAddFoundationPileModal: () =>
      set((s) => {
        const { project, mutated } = projectWithoutPendingOpeningDrafts(
          s.currentProject,
          s.pendingWindowPlacement,
          s.pendingDoorPlacement,
        );
        const patch: Partial<AppStore> = {
          addFoundationPileModalOpen: true,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          addDoorModalOpen: false,
          wallPlacementSession: null,
          wallPlacementHistoryBaseline: null,
          wallJointSession: null,
          wallJointParamsModalOpen: false,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          pendingOpeningPlacementHistoryBaseline: null,
          addFoundationStripModalOpen: false,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          foundationPileContextMenu: null,
          foundationPileMoveCopySession: null,
          foundationPileMoveCopyHistoryBaseline: null,
          foundationStripAutoPilesModal: null,
          addSlabModalOpen: false,
          addSlabModalPurpose: null,
          slabPlacementSession: null,
          slabPlacementHistoryBaseline: null,
          slabCoordinateModalOpen: false,
          slabEditModal: null,
          lastError: null,
        };
        return mutated ? { ...buildProjectMutationState(s, project, { ...patch, dirty: true }) } : patch;
      }),

    closeAddFoundationPileModal: () => set({ addFoundationPileModalOpen: false }),

    applyAddFoundationPileModal: (input) => {
      if (input.pileKind === "screw") {
        set({ lastError: "Винтовая свая пока не реализована. Выберите железобетонную." });
        return;
      }
      const sz = Number(input.sizeMm);
      const cap = Number(input.capSizeMm);
      const h = Number(input.heightMm);
      const lvl = Number(input.levelMm);
      if (!(Number.isFinite(sz) && sz > 0)) {
        set({ lastError: "Размер сваи должен быть числом больше 0 (мм)." });
        return;
      }
      if (!(Number.isFinite(cap) && cap > 0)) {
        set({ lastError: "Площадка должна быть числом больше 0 (мм)." });
        return;
      }
      if (!(Number.isFinite(h) && h > 0)) {
        set({ lastError: "Высота сваи должна быть числом больше 0 (мм)." });
        return;
      }
      if (!Number.isFinite(lvl)) {
        set({ lastError: "Уровень должен быть числом (мм)." });
        return;
      }
      const p = get().currentProject;
      const baseline = cloneProjectSnapshot(p);
      set({
        addFoundationPileModalOpen: false,
        foundationPilePlacementHistoryBaseline: baseline,
        foundationPilePlacementSession: {
          draft: {
            pileKind: "reinforcedConcrete",
            sizeMm: sz,
            capSizeMm: cap,
            heightMm: h,
            levelMm: lvl,
          },
          previewWorldMm: null,
          lastSnapKind: null,
        },
        addFoundationStripModalOpen: false,
        foundationStripPlacementSession: null,
        foundationStripPlacementHistoryBaseline: null,
        wallPlacementSession: null,
        wallPlacementHistoryBaseline: null,
        foundationStripAutoPilesModal: null,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    cancelFoundationPilePlacement: () =>
      set({
        foundationPilePlacementSession: null,
        foundationPilePlacementHistoryBaseline: null,
        addFoundationPileModalOpen: false,
        lastError: null,
      }),

    foundationPilePlacementPreviewMove: (worldMm, viewport) => {
      const s = get().foundationPilePlacementSession;
      if (!s || isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      set({
        foundationPilePlacementSession: {
          ...s,
          previewWorldMm: snap.point,
          lastSnapKind: snap.kind,
        },
      });
    },

    foundationPilePlacementPrimaryClick: (worldMm, viewport) => {
      const s = get().foundationPilePlacementSession;
      if (!s || s.draft.pileKind !== "reinforcedConcrete") {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      const pt = snap.point;
      const p0 = get().currentProject;
      const t = new Date().toISOString();
      const pile: FoundationPileEntity = {
        id: newEntityId(),
        layerId: p0.activeLayerId,
        pileKind: "reinforcedConcrete",
        centerX: pt.x,
        centerY: pt.y,
        sizeMm: s.draft.sizeMm,
        capSizeMm: s.draft.capSizeMm,
        heightMm: s.draft.heightMm,
        levelMm: s.draft.levelMm,
        createdAt: t,
        updatedAt: t,
      };
      const nextProject = touchProjectMeta({ ...p0, foundationPiles: [...p0.foundationPiles, pile] });
      set((st) =>
        buildProjectMutationState(
          st,
          nextProject,
          {
            foundationPilePlacementSession: {
              ...s,
              previewWorldMm: snap.point,
              lastSnapKind: snap.kind,
            },
            selectedEntityIds: [pile.id],
            dirty: true,
            lastError: null,
          },
          { historyBefore: st.currentProject },
        ),
      );
    },

    applyFoundationPilesWorldDeltaMm: (pileIds, dxMm, dyMm, opts) => {
      if (pileIds.length === 0) {
        return;
      }
      const p0 = get().currentProject;
      const next = translateFoundationPilesInProject(p0, new Set(pileIds), dxMm, dyMm);
      const merged = touchProjectMeta(next);
      if (opts?.skipHistory) {
        set({ currentProject: merged, dirty: true });
      } else {
        set((s) => buildProjectMutationState(s, merged, { dirty: true }));
      }
    },

    applySlabsWorldDeltaMm: (slabIds, dxMm, dyMm, opts) => {
      if (slabIds.length === 0) {
        return;
      }
      const p0 = get().currentProject;
      const next = translateSlabsInProjectByIds(p0, new Set(slabIds), dxMm, dyMm);
      const merged = touchProjectMeta(next);
      if (opts?.skipHistory) {
        set({ currentProject: merged, dirty: true });
      } else {
        set((s) => buildProjectMutationState(s, merged, { dirty: true }));
      }
    },

    applyAddFoundationStripModal: (input) => {
      const d = Number(input.depthMm);
      const s1 = Number(input.side1Mm);
      const s2 = Number(input.side2Mm);
      if (!(Number.isFinite(d) && d > 0)) {
        set({ lastError: "Глубина должна быть числом больше 0 (мм)." });
        return;
      }
      if (!(Number.isFinite(s1) && s1 >= 0) || !(Number.isFinite(s2) && s2 >= 0)) {
        set({ lastError: "Стороны 1 и 2 должны быть неотрицательными числами (мм)." });
        return;
      }
      if (s1 + s2 < 1) {
        set({ lastError: "Сумма боковых отступов должна быть больше 0." });
        return;
      }
      const p = get().currentProject;
      const baseline = cloneProjectSnapshot(p);
      set({
        addFoundationStripModalOpen: false,
        foundationStripPlacementHistoryBaseline: baseline,
        foundationStripPlacementSession: {
          draft: {
            depthMm: d,
            side1Mm: s1,
            side2Mm: s2,
            buildMode: input.buildMode,
          },
          phase: "waitingFirstPoint",
          firstPointMm: null,
          previewEndMm: null,
          lastSnapKind: null,
          lastReferenceWallId: null,
        },
        addFoundationPileModalOpen: false,
        foundationPilePlacementSession: null,
        foundationPilePlacementHistoryBaseline: null,
        foundationStripAutoPilesModal: null,
        wallPlacementSession: null,
        wallPlacementHistoryBaseline: null,
        addSlabModalOpen: false,
        addSlabModalPurpose: null,
        slabPlacementSession: null,
        slabPlacementHistoryBaseline: null,
        slabCoordinateModalOpen: false,
        slabEditModal: null,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    cancelFoundationStripPlacement: () =>
      set({
        foundationStripPlacementSession: null,
        foundationStripPlacementHistoryBaseline: null,
        addFoundationStripModalOpen: false,
        lastError: null,
      }),

    foundationStripPlacementBackOrExit: () => {
      const session = get().foundationStripPlacementSession;
      if (!session) {
        return;
      }
      if (session.phase === "waitingSecondPoint") {
        set({
          foundationStripPlacementSession: {
            ...session,
            phase: "waitingFirstPoint",
            firstPointMm: null,
            previewEndMm: null,
            lastSnapKind: null,
            lastReferenceWallId: null,
          },
        });
        return;
      }
      set({
        foundationStripPlacementSession: null,
        foundationStripPlacementHistoryBaseline: null,
        lastError: null,
      });
    },

    foundationStripPlacementPreviewMove: (worldMm, viewport) => {
      const s = get().foundationStripPlacementSession;
      if (!s || isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      const ref = referenceWallIdFromSnapForFoundationStrip(get().currentProject, snap);
      set({
        foundationStripPlacementSession: {
          ...s,
          previewEndMm: snap.point,
          lastSnapKind: snap.kind,
          lastReferenceWallId: ref ?? s.lastReferenceWallId,
        },
      });
    },

    foundationStripPlacementPrimaryClick: (worldMm, viewport) => {
      const s = get().foundationStripPlacementSession;
      if (!s) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      const p0 = get().currentProject;
      const pt = snap.point;
      const refWall =
        referenceWallIdFromSnapForFoundationStrip(p0, snap) ?? s.lastReferenceWallId ?? undefined;

      if (s.phase === "waitingFirstPoint") {
        set({
          foundationStripPlacementSession: {
            ...s,
            phase: "waitingSecondPoint",
            firstPointMm: pt,
            previewEndMm: pt,
            lastSnapKind: snap.kind,
            lastReferenceWallId: refWall ?? null,
          },
          lastError: null,
        });
        return;
      }

      const first = s.firstPointMm;
      if (!first) {
        return;
      }

      const minLen = 10;

      if (s.draft.buildMode === "linear") {
        if (Math.hypot(pt.x - first.x, pt.y - first.y) < minLen) {
          set({ lastError: "Сегмент ленты слишком короткий." });
          return;
        }
        const n = pickOutwardNormalForStripAxisMm(p0, first, pt, refWall);
        const seg: FoundationStripSegmentEntity = {
          kind: "segment",
          id: newEntityId(),
          layerId: p0.activeLayerId,
          axisStart: first,
          axisEnd: pt,
          outwardNormalX: n.nx,
          outwardNormalY: n.ny,
          depthMm: s.draft.depthMm,
          sideOutMm: s.draft.side1Mm,
          sideInMm: s.draft.side2Mm,
          createdAt: new Date().toISOString(),
        };
        const mergedCol = mergeCollinearFoundationStripSegments([...p0.foundationStrips, seg]);
        const merged = mergeTouchingFoundationStripBands(mergedCol, { newId: newEntityId });
        const nextProject = touchProjectMeta({ ...p0, foundationStrips: merged });
        const mid = { x: (first.x + pt.x) / 2, y: (first.y + pt.y) / 2 };
        const selectedStripId =
          findFoundationStripIdContainingPlanPointMm(merged, mid) ?? merged[merged.length - 1]?.id ?? seg.id;
        set((st) =>
          buildProjectMutationState(
            st,
            nextProject,
            {
              foundationStripPlacementSession: {
                ...s,
                phase: "waitingFirstPoint",
                firstPointMm: null,
                previewEndMm: null,
                lastSnapKind: null,
                lastReferenceWallId: null,
              },
              foundationStripPlacementHistoryBaseline: null,
              selectedEntityIds: [selectedStripId],
              dirty: true,
              lastError: null,
            },
            st.foundationStripPlacementHistoryBaseline != null
              ? { historyBefore: st.foundationStripPlacementHistoryBaseline }
              : {},
          ),
        );
        return;
      }

      const xmin = Math.min(first.x, pt.x);
      const xmax = Math.max(first.x, pt.x);
      const ymin = Math.min(first.y, pt.y);
      const ymax = Math.max(first.y, pt.y);
      if (xmax - xmin < minLen || ymax - ymin < minLen) {
        set({ lastError: "Прямоугольник слишком мал." });
        return;
      }
      const t = new Date().toISOString();
      const ring = buildOrthoRectangleFoundationStripRingEntity({
        layerId: p0.activeLayerId,
        xmin,
        xmax,
        ymin,
        ymax,
        depthMm: s.draft.depthMm,
        sideOutMm: s.draft.side1Mm,
        sideInMm: s.draft.side2Mm,
        createdAt: t,
        newId: () => newEntityId(),
      });
      const mergedRect = mergeTouchingFoundationStripBands([...p0.foundationStrips, ring], {
        newId: newEntityId,
      });
      const nextProject = touchProjectMeta({ ...p0, foundationStrips: mergedRect });
      const midRect = { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 };
      const selectedStripIdRect =
        findFoundationStripIdContainingPlanPointMm(mergedRect, midRect) ??
        mergedRect[mergedRect.length - 1]?.id ??
        ring.id;
      set((st) =>
        buildProjectMutationState(
          st,
          nextProject,
          {
            foundationStripPlacementSession: null,
            foundationStripPlacementHistoryBaseline: null,
            selectedEntityIds: [selectedStripIdRect],
            dirty: true,
            lastError: null,
          },
          st.foundationStripPlacementHistoryBaseline != null
            ? { historyBefore: st.foundationStripPlacementHistoryBaseline }
            : {},
        ),
      );
    },

    openAddSlabModal: (purpose) => set({ addSlabModalOpen: true, addSlabModalPurpose: purpose, lastError: null }),

    closeAddSlabModal: () => set({ addSlabModalOpen: false, addSlabModalPurpose: null }),

    applyAddSlabModal: (input) => {
      const depthMm = Number(input.depthMm);
      const levelMm = Number(input.levelMm);
      if (!Number.isFinite(depthMm) || depthMm <= 0) {
        set({ lastError: "Глубина должна быть числом больше 0 (мм)." });
        return;
      }
      if (!Number.isFinite(levelMm)) {
        set({ lastError: "Уровень должен быть числом (мм)." });
        return;
      }
      const st0 = get();
      const p = st0.currentProject;
      const purpose: SlabStructuralPurpose =
        st0.addSlabModalPurpose ?? st0.slabPlacementSession?.draft.purpose ?? "overlap";
      const baseline = cloneProjectSnapshot(p);
      const draft: SlabPlacementDraftPersisted = { depthMm, levelMm, purpose };
      set({
        addSlabModalOpen: false,
        addSlabModalPurpose: null,
        lastSlabPlacementParamsByPurpose: {
          ...st0.lastSlabPlacementParamsByPurpose,
          [purpose]: { depthMm, levelMm },
        },
        slabPlacementHistoryBaseline: baseline,
        slabPlacementSession: newSlabPlacementSession(p, draft),
        slabCoordinateModalOpen: false,
        slabEditModal: null,
        addWallModalOpen: false,
        wallPlacementSession: null,
        wallPlacementHistoryBaseline: null,
        addFoundationStripModalOpen: false,
        foundationStripPlacementSession: null,
        foundationStripPlacementHistoryBaseline: null,
        addFoundationPileModalOpen: false,
        foundationPilePlacementSession: null,
        foundationPilePlacementHistoryBaseline: null,
        foundationStripAutoPilesModal: null,
        wallJointSession: null,
        wallJointParamsModalOpen: false,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    cancelSlabPlacement: () =>
      set({
        slabPlacementSession: null,
        slabPlacementHistoryBaseline: null,
        addSlabModalOpen: false,
        addSlabModalPurpose: null,
        slabCoordinateModalOpen: false,
        lastError: null,
      }),

    slabPlacementBackOrExit: () => {
      const session = get().slabPlacementSession;
      if (!session) {
        return;
      }
      if (session.phase === "waitingSecondPoint") {
        set({
          slabPlacementSession: {
            ...session,
            phase: "waitingFirstPoint",
            firstPointMm: null,
            previewEndMm: null,
            lastSnapKind: null,
          },
        });
        return;
      }
      if (session.phase === "polylineDrawing") {
        const v = [...session.polylineVerticesMm];
        if (v.length > 1) {
          const last = v[v.length - 2]!;
          v.pop();
          set({
            slabPlacementSession: {
              ...session,
              polylineVerticesMm: v,
              previewEndMm: last,
              firstPointMm: v[0] ?? null,
            },
          });
          return;
        }
        if (v.length === 1) {
          set({
            slabPlacementSession: {
              ...session,
              phase: "waitingFirstPoint",
              firstPointMm: null,
              polylineVerticesMm: [],
              previewEndMm: null,
              lastSnapKind: null,
            },
          });
          return;
        }
      }
      set({
        slabPlacementSession: null,
        slabPlacementHistoryBaseline: null,
        slabCoordinateModalOpen: false,
        lastError: null,
      });
    },

    slabPlacementPreviewMove: (worldMm, viewport) => {
      const s = get().slabPlacementSession;
      if (!s || isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      set({
        slabPlacementSession: {
          ...s,
          previewEndMm: snap.point,
          lastSnapKind: snap.kind,
        },
      });
    },

    slabPlacementTryFinishPolylineByEnter: () => {
      const s = get().slabPlacementSession;
      if (!s || s.buildMode !== "polyline" || s.phase !== "polylineDrawing" || !s.previewEndMm) {
        return;
      }
      if (s.polylineVerticesMm.length < 2) {
        set({
          lastError:
            "Для завершения по Enter или двойному клику задайте минимум две вершины; текущая точка станет последней вершиной контура.",
        });
        return;
      }
      const ring = [...s.polylineVerticesMm, s.previewEndMm];
      const p0 = get().currentProject;
      const r = tryCommitSlabOutline(p0, s, ring);
      if (!r.ok) {
        set({ lastError: r.error });
        return;
      }
      set((st) =>
        buildProjectMutationState(
          st,
          r.nextProject,
          {
            slabPlacementSession: r.nextSession,
            slabPlacementHistoryBaseline: null,
            selectedEntityIds: [r.slabId],
            slabCoordinateModalOpen: false,
            dirty: true,
            lastError: null,
          },
          st.slabPlacementHistoryBaseline != null ? { historyBefore: st.slabPlacementHistoryBaseline } : {},
        ),
      );
    },

    slabPlacementPrimaryClick: (worldMm, viewport, opts) => {
      if (get().slabCoordinateModalOpen) {
        return;
      }
      const s = get().slabPlacementSession;
      if (!s) {
        return;
      }
      const detail = opts?.clickDetail ?? 1;
      if (detail >= 2 && s.buildMode === "polyline" && s.phase === "polylineDrawing") {
        get().slabPlacementTryFinishPolylineByEnter();
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      const pt = snap.point;
      const minLen = 10;
      const closeTol = slabCloseToleranceMm(viewport);

      if (s.phase === "waitingFirstPoint") {
        if (s.buildMode === "rectangle") {
          set({
            slabPlacementSession: {
              ...s,
              phase: "waitingSecondPoint",
              firstPointMm: pt,
              previewEndMm: pt,
              lastSnapKind: snap.kind,
            },
          });
        } else {
          set({
            slabPlacementSession: {
              ...s,
              phase: "polylineDrawing",
              firstPointMm: pt,
              polylineVerticesMm: [pt],
              previewEndMm: pt,
              lastSnapKind: snap.kind,
            },
          });
        }
        return;
      }

      if (s.phase === "waitingSecondPoint" && s.firstPointMm) {
        const corners = rectangleCornersFromDiagonalMm(s.firstPointMm, pt);
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        if (w < minLen || h < minLen) {
          set({ lastError: "Прямоугольник слишком мал." });
          return;
        }
        const p0 = get().currentProject;
        const r = tryCommitSlabOutline(p0, s, corners);
        if (!r.ok) {
          set({ lastError: r.error });
          return;
        }
        set((st) =>
          buildProjectMutationState(
            st,
            r.nextProject,
            {
              slabPlacementSession: r.nextSession,
              slabPlacementHistoryBaseline: null,
              selectedEntityIds: [r.slabId],
              dirty: true,
              lastError: null,
            },
            st.slabPlacementHistoryBaseline != null ? { historyBefore: st.slabPlacementHistoryBaseline } : {},
          ),
        );
        return;
      }

      if (s.phase === "polylineDrawing" && s.firstPointMm) {
        const first = s.firstPointMm;
        if (s.polylineVerticesMm.length >= 3) {
          const dClose = Math.hypot(pt.x - first.x, pt.y - first.y);
          if (dClose < closeTol) {
            const p0 = get().currentProject;
            const r = tryCommitSlabOutline(p0, s, s.polylineVerticesMm);
            if (!r.ok) {
              set({ lastError: r.error });
              return;
            }
            set((st) =>
              buildProjectMutationState(
                st,
                r.nextProject,
                {
                  slabPlacementSession: r.nextSession,
                  slabPlacementHistoryBaseline: null,
                  selectedEntityIds: [r.slabId],
                  dirty: true,
                  lastError: null,
                },
                st.slabPlacementHistoryBaseline != null ? { historyBefore: st.slabPlacementHistoryBaseline } : {},
              ),
            );
            return;
          }
        }
        const last = s.polylineVerticesMm[s.polylineVerticesMm.length - 1]!;
        if (Math.hypot(pt.x - last.x, pt.y - last.y) < minLen) {
          set({ lastError: "Точка слишком близко к предыдущей." });
          return;
        }
        set({
          slabPlacementSession: {
            ...s,
            polylineVerticesMm: [...s.polylineVerticesMm, pt],
            previewEndMm: pt,
            lastSnapKind: snap.kind,
          },
        });
      }
    },

    openSlabCoordinateModal: (opts) => {
      const s = get().slabPlacementSession;
      if (!s) {
        return;
      }
      if (s.phase === "waitingSecondPoint" && s.firstPointMm) {
        set({
          slabCoordinateModalOpen: true,
          lastError: null,
          sceneCoordModalDesiredFocus: opts?.focus ?? "x",
        });
        return;
      }
      if (s.phase === "polylineDrawing" && s.polylineVerticesMm.length >= 1) {
        set({
          slabCoordinateModalOpen: true,
          lastError: null,
          sceneCoordModalDesiredFocus: opts?.focus ?? "x",
        });
      }
    },

    closeSlabCoordinateModal: () => set({ slabCoordinateModalOpen: false }),

    applySlabCoordinateModal: (input) => {
      const s = get().slabPlacementSession;
      if (!s) {
        set({ slabCoordinateModalOpen: false });
        return;
      }
      if (!Number.isFinite(input.dxMm) || !Number.isFinite(input.dyMm)) {
        set({ lastError: "Введите числовые X и Y (мм)." });
        return;
      }
      let anchor: Point2D | null = null;
      if (s.phase === "waitingSecondPoint" && s.firstPointMm) {
        anchor = s.firstPointMm;
      } else if (s.phase === "polylineDrawing" && s.polylineVerticesMm.length > 0) {
        anchor = s.polylineVerticesMm[s.polylineVerticesMm.length - 1]!;
      }
      if (!anchor) {
        set({ slabCoordinateModalOpen: false });
        return;
      }
      const previewEndMm = { x: anchor.x + input.dxMm, y: anchor.y + input.dyMm };
      set({
        slabCoordinateModalOpen: false,
        slabPlacementSession: { ...s, previewEndMm, lastSnapKind: "grid" },
        lastError: null,
      });
    },

    openSlabEditModal: (slabId) => set({ slabEditModal: { slabId }, lastError: null }),

    closeSlabEditModal: () => set({ slabEditModal: null }),

    applySlabEditModal: (input) => {
      const m = get().slabEditModal;
      if (!m) {
        return;
      }
      const depthMm = Number(input.depthMm);
      const levelMm = Number(input.levelMm);
      if (!Number.isFinite(depthMm) || depthMm <= 0) {
        set({ lastError: "Глубина должна быть числом больше 0 (мм)." });
        return;
      }
      if (!Number.isFinite(levelMm)) {
        set({ lastError: "Уровень должен быть числом (мм)." });
        return;
      }
      const p0 = get().currentProject;
      const r = updateSlabInProject(p0, m.slabId, { depthMm, levelMm });
      if ("error" in r) {
        set({ lastError: r.error });
        return;
      }
      set((st) =>
        buildProjectMutationState(
          st,
          touchProjectMeta(r.project),
          {
            dirty: true,
            lastError: null,
            slabEditModal: null,
          },
          { historyBefore: st.currentProject },
        ),
      );
    },

    openFoundationStripAutoPilesModal: (seedStripId) =>
      set({
        foundationStripAutoPilesModal: { seedStripId },
        addFoundationStripModalOpen: false,
        foundationStripPlacementSession: null,
        foundationStripPlacementHistoryBaseline: null,
        lastError: null,
      }),

    closeFoundationStripAutoPilesModal: () => set({ foundationStripAutoPilesModal: null }),

    applyFoundationStripAutoPiles: (action, settings) => {
      runFoundationStripAutoPilesImpl(get, set, action, settings);
    },

    openAddWindowModal: () =>
      set((s) => {
        const { project, mutated } = projectWithoutPendingOpeningDrafts(
          s.currentProject,
          s.pendingWindowPlacement,
          s.pendingDoorPlacement,
        );
        const patch: Partial<AppStore> = {
          addWindowModalOpen: true,
          addDoorModalOpen: false,
          addWallModalOpen: false,
          addFoundationStripModalOpen: false,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          addFoundationPileModalOpen: false,
          foundationPilePlacementSession: null,
          foundationPilePlacementHistoryBaseline: null,
          foundationStripAutoPilesModal: null,
          addSlabModalOpen: false,
          addSlabModalPurpose: null,
          slabPlacementSession: null,
          slabPlacementHistoryBaseline: null,
          slabCoordinateModalOpen: false,
          slabEditModal: null,
          wallPlacementSession: null,
          wallJointSession: null,
          wallJointParamsModalOpen: false,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          windowEditModal: null,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          pendingOpeningPlacementHistoryBaseline: null,
          lastError: null,
        };
        return mutated ? { ...buildProjectMutationState(s, project, { ...patch, dirty: true }) } : patch;
      }),
    openAddDoorModal: () =>
      set((s) => {
        const { project, mutated } = projectWithoutPendingOpeningDrafts(
          s.currentProject,
          s.pendingWindowPlacement,
          s.pendingDoorPlacement,
        );
        const patch: Partial<AppStore> = {
          addDoorModalOpen: true,
          addWindowModalOpen: false,
          addWallModalOpen: false,
          addFoundationStripModalOpen: false,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          addFoundationPileModalOpen: false,
          foundationPilePlacementSession: null,
          foundationPilePlacementHistoryBaseline: null,
          addSlabModalOpen: false,
          addSlabModalPurpose: null,
          slabPlacementSession: null,
          slabPlacementHistoryBaseline: null,
          slabCoordinateModalOpen: false,
          slabEditModal: null,
          wallPlacementSession: null,
          wallJointSession: null,
          wallJointParamsModalOpen: false,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          doorEditModal: null,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          pendingOpeningPlacementHistoryBaseline: null,
          lastError: null,
        };
        return mutated ? { ...buildProjectMutationState(s, project, { ...patch, dirty: true }) } : patch;
      }),

    closeAddWindowModal: () => set({ addWindowModalOpen: false }),
    closeAddDoorModal: () => set({ addDoorModalOpen: false }),

    applyWindowFormModal: (input) => {
      const p = get().currentProject;
      const baseline = cloneProjectSnapshot(p);
      const r = addUnplacedWindowToProject(p, input);
      set({
        currentProject: r.project,
        addWindowModalOpen: false,
        pendingWindowPlacement: { openingId: r.openingId },
        pendingOpeningPlacementHistoryBaseline: baseline,
        lastWindowPlacementParams: input,
        dirty: true,
        lastError: null,
      });
    },
    applyDoorFormModal: (input) => {
      const p = get().currentProject;
      const baseline = cloneProjectSnapshot(p);
      const r = addUnplacedDoorToProject(p, input);
      set({
        currentProject: r.project,
        addDoorModalOpen: false,
        pendingDoorPlacement: { openingId: r.openingId, phase: "pickWall" },
        pendingOpeningPlacementHistoryBaseline: baseline,
        lastDoorPlacementParams: input,
        dirty: true,
        lastError: null,
      });
    },

    clearPendingWindowPlacement: () =>
      set((s) => {
        if (!s.pendingWindowPlacement) {
          return { pendingWindowPlacement: null };
        }
        const next = removeUnplacedWindowDraft(s.currentProject, s.pendingWindowPlacement.openingId);
        return {
          ...buildProjectMutationState(s, next, {
            pendingWindowPlacement: null,
            pendingOpeningPlacementHistoryBaseline: null,
            dirty: true,
            lastError: null,
          }),
        };
      }),
    clearPendingDoorPlacement: () =>
      set((s) => {
        if (!s.pendingDoorPlacement) {
          return { pendingDoorPlacement: null };
        }
        const next = removeUnplacedWindowDraft(s.currentProject, s.pendingDoorPlacement.openingId);
        return {
          ...buildProjectMutationState(s, next, {
            pendingDoorPlacement: null,
            pendingOpeningPlacementHistoryBaseline: null,
            dirty: true,
            lastError: null,
          }),
        };
      }),

    abortPendingWindowPlacement: () =>
      set((s) => {
        const pend = s.pendingWindowPlacement;
        if (!pend) {
          return {};
        }
        const cleared = removeUnplacedWindowDraft(s.currentProject, pend.openingId);
        const params = s.lastWindowPlacementParams;
        if (!params) {
          return {
            ...buildProjectMutationState(s, cleared, {
              pendingWindowPlacement: null,
              pendingOpeningPlacementHistoryBaseline: null,
              dirty: true,
              lastError: null,
            }),
          };
        }
        const baseline = cloneProjectSnapshot(cleared);
        const r = addUnplacedWindowToProject(cleared, params);
        return {
          ...buildProjectMutationState(s, r.project, {
            pendingWindowPlacement: { openingId: r.openingId },
            pendingOpeningPlacementHistoryBaseline: baseline,
            dirty: true,
            lastError: null,
          }),
        };
      }),

    abortPendingDoorPlacement: () =>
      set((s) => {
        const pend = s.pendingDoorPlacement;
        if (!pend) {
          return {};
        }
        if (pend.phase === "chooseSwing") {
          return {
            pendingDoorPlacement: { openingId: pend.openingId, phase: "pickWall" },
            lastError: null,
          };
        }
        const cleared = removeUnplacedWindowDraft(s.currentProject, pend.openingId);
        const params = s.lastDoorPlacementParams;
        if (!params) {
          return {
            ...buildProjectMutationState(s, cleared, {
              pendingDoorPlacement: null,
              pendingOpeningPlacementHistoryBaseline: null,
              dirty: true,
              lastError: null,
            }),
          };
        }
        const baseline = cloneProjectSnapshot(cleared);
        const r = addUnplacedDoorToProject(cleared, params);
        return {
          ...buildProjectMutationState(s, r.project, {
            pendingDoorPlacement: { openingId: r.openingId, phase: "pickWall" },
            pendingOpeningPlacementHistoryBaseline: baseline,
            dirty: true,
            lastError: null,
          }),
        };
      }),

    tryCommitPendingWindowPlacementAtWorld: (worldMm) => {
      const pend = get().pendingWindowPlacement;
      if (!pend) {
        return;
      }
      const p0 = get().currentProject;
      const layerSlice = narrowProjectToActiveLayer(p0);
      const walls = layerSlice.walls;
      const v = get().viewport2d;
      const sz = get().viewportCanvas2dPx;
      const tol =
        sz && sz.width > 0
          ? Math.max(14, 22 / v.zoomPixelsPerMm)
          : Math.max(14, 22 / Math.max(0.01, v.zoomPixelsPerMm));
      const hit = pickClosestWallAlongPoint(worldMm, walls, tol);
      if (!hit) {
        set({ lastError: "Наведите курсор на стену и кликните по ней." });
        return;
      }
      const op = p0.openings.find((o) => o.id === pend.openingId);
      if (!op) {
        set({ pendingWindowPlacement: null, lastError: null });
        return;
      }
      const wall = p0.walls.find((w) => w.id === hit.wallId);
      if (!wall) {
        set({ lastError: "Стена не найдена." });
        return;
      }
      const rawLeft = offsetFromStartForCursorCentered(hit.alongMm, op.widthMm);
      const left = clampOpeningLeftEdgeMm(wall, op.widthMm, rawLeft, p0);
      const vPl = validateWindowPlacementOnWall(wall, left, op.widthMm, p0, op.id);
      if (!vPl.ok) {
        set({ lastError: vPl.reason });
        return;
      }
      const placed = placeDraftWindowOnWall(p0, pend.openingId, hit.wallId, rawLeft);
      if ("error" in placed) {
        set({ lastError: placed.error });
        return;
      }
      const fin = finalizeWindowPlacementWithDefaults(placed.project, pend.openingId);
      if ("error" in fin) {
        set({ lastError: fin.error });
        return;
      }
      set((s) => {
        const placedOp = fin.project.openings.find((o) => o.id === pend.openingId);
        const draftPayload =
          (placedOp ? placedWindowOpeningToDraftPayload(placedOp) : null) ?? s.lastWindowPlacementParams;
        if (!draftPayload) {
          return buildProjectMutationState(
            s,
            fin.project,
            {
              pendingWindowPlacement: null,
              pendingOpeningPlacementHistoryBaseline: null,
              windowEditModal: { openingId: pend.openingId, initialTab: "position" },
              dirty: true,
              lastError: null,
            },
            {
              historyBefore: s.pendingOpeningPlacementHistoryBaseline ?? s.currentProject,
            },
          );
        }
        const baselineNext = cloneProjectSnapshot(fin.project);
        const r2 = addUnplacedWindowToProject(fin.project, draftPayload);
        return buildProjectMutationState(
          s,
          r2.project,
          {
            pendingWindowPlacement: { openingId: r2.openingId },
            pendingOpeningPlacementHistoryBaseline: baselineNext,
            lastWindowPlacementParams: draftPayload,
            windowEditModal: null,
            dirty: true,
            lastError: null,
          },
          {
            historyBefore: s.pendingOpeningPlacementHistoryBaseline ?? s.currentProject,
          },
        );
      });
    },
    tryCommitPendingDoorPlacementAtWorld: (worldMm) => {
      const pend0 = get().pendingDoorPlacement;
      if (!pend0) {
        return;
      }
      const p0 = get().currentProject;
      const v = get().viewport2d;
      const sz = get().viewportCanvas2dPx;
      const tol =
        sz && sz.width > 0
          ? Math.max(14, 22 / v.zoomPixelsPerMm)
          : Math.max(14, 22 / Math.max(0.01, v.zoomPixelsPerMm));
      const layerSlice = narrowProjectToActiveLayer(p0);
      const walls = layerSlice.walls;

      if (pend0.phase === "pickWall") {
        const hit = pickClosestWallAlongPoint(worldMm, walls, tol);
        if (!hit) {
          set({ lastError: "Наведите курсор на стену и кликните по ней." });
          return;
        }
        const op = p0.openings.find((o) => o.id === pend0.openingId);
        if (!op) {
          set({ pendingDoorPlacement: null, lastError: null });
          return;
        }
        if (op.kind !== "door") {
          set({ pendingDoorPlacement: null, lastError: null });
          return;
        }
        const wall = p0.walls.find((w) => w.id === hit.wallId);
        if (!wall) {
          set({ lastError: "Стена не найдена." });
          return;
        }
        const rawLeft = offsetFromStartForCursorCentered(hit.alongMm, op.widthMm);
        const left = clampPlacedOpeningLeftEdgeMm(wall, op.widthMm, rawLeft, p0, "door");
        const vPl = validateWindowPlacementOnWall(wall, left, op.widthMm, p0, op.id, { openingKind: "door" });
        if (!vPl.ok) {
          set({ lastError: vPl.reason });
          return;
        }
        const dots = doorCursorLocalDots(worldMm, wall, left, op.widthMm);
        const swing0 = dots
          ? resolveDoorSwingWithHysteresis(
              dots.tDot,
              dots.nDot,
              op.doorSwing ?? "in_right",
              DOOR_SWING_PICK_DEAD_ZONE_MM,
            )
          : (op.doorSwing ?? "in_right");
        set({
          pendingDoorPlacement: {
            openingId: pend0.openingId,
            phase: "chooseSwing",
            wallId: wall.id,
            leftAlongMm: left,
            swingPreview: swing0,
          },
          lastError: null,
        });
        return;
      }

      const pend = pend0;
      if (pend.phase !== "chooseSwing" || pend.wallId == null || pend.leftAlongMm == null) {
        set({ pendingDoorPlacement: null, lastError: null });
        return;
      }
      const wall = p0.walls.find((w) => w.id === pend.wallId);
      const op = p0.openings.find((o) => o.id === pend.openingId);
      if (!wall || !op || op.kind !== "door") {
        set({ pendingDoorPlacement: null, lastError: null });
        return;
      }
      const swing = pend.swingPreview ?? op.doorSwing ?? "in_right";
      const placed = placeDraftDoorOnWall(p0, pend.openingId, pend.wallId, pend.leftAlongMm, { doorSwing: swing });
      if ("error" in placed) {
        set({ lastError: placed.error });
        return;
      }
      set((s) => {
        const placedOp = placed.project.openings.find((o) => o.id === pend.openingId);
        const draftPayload =
          (placedOp ? placedDoorOpeningToDraftPayload(placedOp) : null) ?? s.lastDoorPlacementParams;
        if (!draftPayload) {
          return buildProjectMutationState(
            s,
            placed.project,
            {
              pendingDoorPlacement: null,
              pendingOpeningPlacementHistoryBaseline: null,
              doorEditModal: { openingId: pend.openingId, initialTab: "position" },
              dirty: true,
              lastError: null,
            },
            {
              historyBefore: s.pendingOpeningPlacementHistoryBaseline ?? s.currentProject,
            },
          );
        }
        const baselineNext = cloneProjectSnapshot(placed.project);
        const r2 = addUnplacedDoorToProject(placed.project, draftPayload);
        return buildProjectMutationState(
          s,
          r2.project,
          {
            pendingDoorPlacement: { openingId: r2.openingId, phase: "pickWall" },
            pendingOpeningPlacementHistoryBaseline: baselineNext,
            lastDoorPlacementParams: draftPayload,
            doorEditModal: null,
            dirty: true,
            lastError: null,
          },
          {
            historyBefore: s.pendingOpeningPlacementHistoryBaseline ?? s.currentProject,
          },
        );
      });
    },

    updatePendingDoorSwingAtWorld: (worldMm) => {
      set((s) => {
        const pend = s.pendingDoorPlacement;
        if (!pend || pend.phase !== "chooseSwing" || pend.wallId == null || pend.leftAlongMm == null) {
          return {};
        }
        const wall = s.currentProject.walls.find((w) => w.id === pend.wallId);
        const op = s.currentProject.openings.find((o) => o.id === pend.openingId);
        if (!wall || !op || op.kind !== "door") {
          return {};
        }
        const dots = doorCursorLocalDots(worldMm, wall, pend.leftAlongMm, op.widthMm);
        if (!dots) {
          return {};
        }
        const prevSwing = pend.swingPreview ?? op.doorSwing ?? "in_right";
        const nextSwing = resolveDoorSwingWithHysteresis(
          dots.tDot,
          dots.nDot,
          prevSwing,
          DOOR_SWING_PICK_DEAD_ZONE_MM,
        );
        if (nextSwing === pend.swingPreview) {
          return {};
        }
        return {
          pendingDoorPlacement: { ...pend, swingPreview: nextSwing },
        };
      });
    },

    closeWindowEditModal: () => set({ windowEditModal: null }),

    applyWindowEditModal: (payload) => {
      const m = get().windowEditModal;
      if (!m) {
        return;
      }
      const r = saveWindowParamsAndRegenerateFraming(get().currentProject, m.openingId, payload);
      if ("error" in r) {
        set({ lastError: r.error });
        return;
      }
      set((s) =>
        buildProjectMutationState(s, r.project, {
          windowEditModal: null,
          dirty: true,
          lastError: null,
        }),
      );
    },
    closeDoorEditModal: () => set({ doorEditModal: null }),
    applyDoorEditModal: (payload) => {
      const m = get().doorEditModal;
      if (!m) {
        return;
      }
      const r = saveDoorParams(get().currentProject, m.openingId, payload);
      if ("error" in r) {
        set({ lastError: r.error });
        return;
      }
      set((s) =>
        buildProjectMutationState(s, r.project, {
          doorEditModal: null,
          dirty: true,
          lastError: null,
        }),
      );
    },

    openWindowEditModal: (openingId, initialTab = "form") =>
      set({
        windowEditModal: { openingId, initialTab: initialTab ?? "form" },
        addWindowModalOpen: false,
        pendingWindowPlacement: null,
        lastError: null,
      }),
    openDoorEditModal: (openingId, initialTab = "form") =>
      set({
        doorEditModal: { openingId, initialTab: initialTab ?? "form" },
        addDoorModalOpen: false,
        pendingDoorPlacement: null,
        lastError: null,
      }),

    applyOpeningRepositionLeftEdge: (openingId, leftEdgeMm, opts) => {
      const p = get().currentProject;
      const op = p.openings.find((o) => o.id === openingId);
      const r =
        op?.kind === "door"
          ? repositionPlacedDoorLeftEdge(p, openingId, leftEdgeMm)
          : repositionPlacedWindowLeftEdge(p, openingId, leftEdgeMm);
      if ("error" in r) {
        return false;
      }
      const next = r.project;
      if (opts?.skipHistory) {
        set({ currentProject: next, dirty: true });
      } else {
        set((s) => buildProjectMutationState(s, next, { dirty: true }));
      }
      return true;
    },
    commitWallDetailProjectUpdate: (nextProject) =>
      set((s) => buildProjectMutationState(s, touchProjectMeta(nextProject), { dirty: true, lastError: null })),
    setOpeningMoveModeActive: (active) =>
      set((s) => ({
        openingMoveModeActive: active,
        projectOriginMoveToolActive: active ? false : s.projectOriginMoveToolActive,
        openingAlongMoveNumericModalOpen: active ? s.openingAlongMoveNumericModalOpen : false,
      })),
    toggleOpeningMoveMode: () =>
      set((s) => {
        const next = !s.openingMoveModeActive;
        return {
          openingMoveModeActive: next,
          projectOriginMoveToolActive: next ? false : s.projectOriginMoveToolActive,
          openingAlongMoveNumericModalOpen: next ? s.openingAlongMoveNumericModalOpen : false,
        };
      }),
    setOpeningAlongMoveNumericModalOpen: (open) => set({ openingAlongMoveNumericModalOpen: open }),
    openRoofPlaneEdgeOffsetModal: (input) => set({ roofPlaneEdgeOffsetModal: input, lastError: null }),
    closeRoofPlaneEdgeOffsetModal: () => set({ roofPlaneEdgeOffsetModal: null }),
    applyRoofPlaneEdgeOffsetModal: (offsetMm) => {
      const ctx = get().roofPlaneEdgeOffsetModal;
      if (!ctx) {
        return;
      }
      if (!Number.isFinite(offsetMm)) {
        set({ lastError: "Введите числовое смещение (мм).", roofPlaneEdgeOffsetModal: ctx });
        return;
      }
      const p0 = get().currentProject;
      const rp = p0.roofPlanes.find((r) => r.id === ctx.planeId);
      if (!rp) {
        set({ lastError: "Скат не найден.", roofPlaneEdgeOffsetModal: ctx });
        return;
      }
      const d = clampRoofQuadEdgeDeltaMm(ctx.baseQuad, ctx.edgeIndex, offsetMm);
      const r = tryMoveRoofQuadEdgeMm(ctx.baseQuad, ctx.edgeIndex, d);
      if (!r.ok) {
        set({
          lastError: "Такое смещение недопустимо для контура ската (геометрия или лимиты).",
          roofPlaneEdgeOffsetModal: ctx,
        });
        return;
      }
      const nextEnt = roofPlaneEntityApplyPlanQuadMm(rp, r.quad);
      const nextPlanes = p0.roofPlanes.map((x) => (x.id === ctx.planeId ? nextEnt : x));
      const nextProj = touchProjectMeta({ ...p0, roofPlanes: nextPlanes });
      set((s) => ({
        ...buildProjectMutationState(s, nextProj, { dirty: true, lastError: null }),
        roofPlaneEdgeOffsetModal: null,
      }));
    },
    applyRoofPlaneQuadLive: (planeId, quad, opts) => {
      const p0 = get().currentProject;
      const rp = p0.roofPlanes.find((r) => r.id === planeId);
      if (!rp) {
        return;
      }
      const nextEnt = roofPlaneEntityApplyPlanQuadMm(rp, quad);
      const nextPlanes = p0.roofPlanes.map((x) => (x.id === planeId ? nextEnt : x));
      const nextProj = touchProjectMeta({ ...p0, roofPlanes: nextPlanes });
      if (opts?.skipHistory) {
        set({ currentProject: nextProj, dirty: true });
      } else {
        set((s) => buildProjectMutationState(s, nextProj, { dirty: true }));
      }
    },
    toggleProjectOriginMoveTool: () =>
      set((s) => {
        const next = !s.projectOriginMoveToolActive;
        return {
          projectOriginMoveToolActive: next,
          openingMoveModeActive: next ? false : s.openingMoveModeActive,
          openingAlongMoveNumericModalOpen: next ? false : s.openingAlongMoveNumericModalOpen,
          projectOriginCoordinateModalOpen: next ? s.projectOriginCoordinateModalOpen : false,
          lastError: null,
        };
      }),
    openProjectOriginCoordinateModal: () => set({ projectOriginCoordinateModalOpen: true, lastError: null }),
    closeProjectOriginCoordinateModal: () => set({ projectOriginCoordinateModalOpen: false }),
    applyProjectOriginAtWorldMm: (pt) => {
      const p0 = get().currentProject;
      const nextOrigin = setProjectOrigin(p0, pt);
      const v3 = viewport3dWithPlanOrbitTargetMm(p0.viewState.viewport3d, pt);
      const merged = mergeViewState(nextOrigin, { viewport3d: v3 });
      set((s) => ({
        ...buildProjectMutationState(s, merged, {
          viewport3d: v3,
          dirty: true,
          lastError: null,
          projectOriginMoveToolActive: false,
          projectOriginCoordinateModalOpen: false,
        }),
      }));
    },
    applyProjectOriginCoordinateModalWorldMm: (pt) => {
      get().applyProjectOriginAtWorldMm(pt);
    },
    openWallDetail: (wallId) =>
      set((s) => {
        const wall = s.currentProject.walls.find((w) => w.id === wallId);
        if (!wall) return {};
        return {
          activeTab: "wall",
          wallDetailWallId: wallId,
          selectedEntityIds: [wallId],
          currentProject: mergeViewState(s.currentProject, { activeTab: "wall" }),
          dirty: true,
        };
      }),
    closeWallDetail: () =>
      set((s) => ({
        activeTab: "2d",
        currentProject: mergeViewState(s.currentProject, { activeTab: "2d" }),
        dirty: true,
      })),

    openWallJointParamsModal: () =>
      set({
        wallJointParamsModalOpen: true,
        wallPlacementSession: null,
        wallJointSession: null,
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        addWallModalOpen: false,
        addWindowModalOpen: false,
        lastError: null,
      }),

    closeWallJointParamsModal: () => set({ wallJointParamsModalOpen: false }),

    applyWallJointParamsModal: (kind) => {
      set({
        wallJointParamsModalOpen: false,
        wallJointSession: { kind, phase: "pickFirst" },
        wallPlacementSession: null,
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        addWallModalOpen: false,
        addWindowModalOpen: false,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    wallJointBackOrExit: () => {
      const session = get().wallJointSession;
      if (!session) {
        return;
      }
      if (session.phase === "pickSecond") {
        set({
          wallJointSession: { kind: session.kind, phase: "pickFirst" },
          lastError: null,
        });
        return;
      }
      set({ wallJointSession: null, lastError: null });
    },

    wallJointPrimaryClick: (worldMm, toleranceMm) => {
      const session = get().wallJointSession;
      if (!session) {
        return;
      }
      const p0 = get().currentProject;
      const layerSlice = narrowProjectToActiveLayer(p0);
      const walls = layerSlice.walls;

      if (session.phase === "pickFirst") {
        const hit = pickNearestWallEnd(worldMm, walls, toleranceMm);
        if (!hit) {
          set({ lastError: "Кликните ближе к торцу стены." });
          return;
        }
        set({
          wallJointSession: {
            kind: session.kind,
            phase: "pickSecond",
            first: { wallId: hit.wallId, end: hit.end },
          },
          lastError: null,
        });
        return;
      }

      const first = session.first;
      if (!first) {
        set({ wallJointSession: null });
        return;
      }

      if (session.kind === "T_ABUTMENT") {
        const candidates = walls.filter((w) => w.id !== first.wallId);
        const seg = pickWallSegmentInterior(worldMm, candidates, toleranceMm, 350);
        if (!seg) {
          set({ lastError: "Кликните по сегменту основной стены (не у торца)." });
          return;
        }
        const r = applyTeeWallJoint(p0, first.wallId, first.end, seg.wallId, seg.pointMm);
        if (!r.ok) {
          set({ lastError: r.error });
          return;
        }
        set((s) =>
          buildProjectMutationState(s, r.project, {
            wallJointSession: { kind: session.kind, phase: "pickFirst" },
            dirty: true,
            lastError: null,
          }),
        );
        return;
      }

      const hit2 = pickNearestWallEnd(worldMm, walls, toleranceMm);
      if (!hit2) {
        set({ lastError: "Кликните ближе к торцу второй стены." });
        return;
      }
      if (hit2.wallId === first.wallId) {
        set({ lastError: "Выберите другую стену." });
        return;
      }

      const r = applyCornerWallJoint(
        p0,
        session.kind,
        first.wallId,
        first.end,
        hit2.wallId,
        hit2.end,
      );
      if (!r.ok) {
        set({ lastError: r.error });
        return;
      }
      set((s) =>
        buildProjectMutationState(s, r.project, {
          wallJointSession: { kind: session.kind, phase: "pickFirst" },
          dirty: true,
          lastError: null,
        }),
      );
    },

    applyAddWallModal: (input) => {
      const p = get().currentProject;
      const profile = getProfileById(p, input.profileId);
      if (!profile) {
        set({ lastError: "Профиль не найден." });
        return;
      }
      if (profile.category !== "wall") {
        set({ lastError: "Нужен профиль категории «стена»." });
        return;
      }
      const thicknessMm = computeProfileThickness(profile);
      if (!(thicknessMm > 0)) {
        set({ lastError: "У профиля нулевая толщина — проверьте слои профиля." });
        return;
      }
      if (!(Number.isFinite(input.heightMm) && input.heightMm > 0)) {
        set({ lastError: "Высота должна быть числом больше 0." });
        return;
      }
      if (!Number.isFinite(input.baseElevationMm)) {
        set({ lastError: "Уровень должен быть числом (мм)." });
        return;
      }
      const phase = initialWallPlacementPhase(p);
      const baseline = cloneProjectSnapshot(p);
      set({
        wallPlacementHistoryBaseline: baseline,
        wallPlacementSession: {
          phase,
          draft: {
            profileId: input.profileId,
            heightMm: input.heightMm,
            baseElevationMm: input.baseElevationMm,
            thicknessMm,
          },
          firstPointMm: null,
          previewEndMm: null,
          lastSnapKind: null,
          angleSnapLockedDeg: null,
          shiftDirectionLockUnit: null,
          shiftLockReferenceMm: null,
        },
        floorBeamPlacementSession: null,
        floorBeamPlacementHistoryBaseline: null,
        floorBeamSplitSession: null,
        floorBeamSplitModalOpen: false,
        addFloorBeamModalOpen: false,
        addWallModalOpen: false,
        addWindowModalOpen: false,
        wallJointSession: null,
        wallJointParamsModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        wallAnchorCoordinateModalOpen: false,
        wallContextMenu: null,
        foundationPileContextMenu: null,
        wallMoveCopySession: null,
        foundationPileMoveCopySession: null,
        foundationPileMoveCopyHistoryBaseline: null,
        wallMoveCopyCoordinateModalOpen: false,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    cancelWallPlacement: () =>
      set({
        wallPlacementSession: null,
        wallPlacementHistoryBaseline: null,
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        addWallModalOpen: false,
        addWindowModalOpen: false,
      }),

    wallPlacementBackOrExit: () => {
      const session = get().wallPlacementSession;
      if (!session) {
        return;
      }
      if (session.phase === "waitingSecondPoint") {
        set({
          wallPlacementSession: {
            ...session,
            phase: "waitingFirstWallPoint",
            firstPointMm: null,
            previewEndMm: null,
            lastSnapKind: null,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
        });
        return;
      }
      const p = get().currentProject;
      set({
        wallPlacementSession: {
          phase: initialWallPlacementPhase(p),
          draft: session.draft,
          firstPointMm: null,
          previewEndMm: null,
          lastSnapKind: null,
          angleSnapLockedDeg: null,
          shiftDirectionLockUnit: null,
          shiftLockReferenceMm: null,
        },
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        lastError: null,
      });
    },

    wallPlacementFirstPointHoverMove: (worldMm, viewport) => {
      const s = get().wallPlacementSession;
      if (!s || s.firstPointMm != null) {
        return;
      }
      if (s.phase !== "waitingFirstWallPoint" && s.phase !== "waitingOriginAndFirst") {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      if (get().wallAnchorPlacementModeActive && get().wallPlacementAnchorMm != null) {
        return;
      }
      const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport);
      set({
        wallPlacementSession: {
          ...s,
          previewEndMm: snap.point,
          lastSnapKind: snap.kind,
        },
      });
    },

    wallPlacementPreviewMove: (worldMm, viewport, opts) => {
      const s = get().wallPlacementSession;
      if (!s || s.phase !== "waitingSecondPoint" || !s.firstPointMm) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const p0 = get().currentProject;
      const e2 = p0.settings.editor2d;
      const r = computeLinearSecondPointPreview({
        anchor: s.firstPointMm,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: get().wallCoordinateModalOpen || Boolean(opts?.altKey),
        altKey: Boolean(opts?.altKey),
        shiftLockFindHit: (args) =>
          findWallPlacementShiftLockSnapHit({
            ...args,
            linearPlacementMode: e2.linearPlacementMode,
          }),
      });
      set({
        wallPlacementSession: {
          ...s,
          previewEndMm: r.previewEnd,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    linearPlacementEngageShiftDirectionLock: (cursorWorldMm, viewport) => {
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      if (!viewport) {
        return;
      }
      const p0 = get().currentProject;
      const e2 = p0.settings.editor2d;
      const snap = editor2dSnapSettings(p0);

      const rps = get().roofPlanePlacementSession;
      if (rps?.phase === "waitingSecondPoint" && rps.p1) {
        const uRp = computeShiftDirectionLockUnit({
          anchor: rps.p1,
          previewEnd: rps.previewEndMm,
          cursorWorldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
          resolveRawSnap: (raw) =>
            resolveWallPlacementToolSnap({
              rawWorldMm: raw,
              viewport,
              project: p0,
              snapSettings: snap,
              gridStepMm: p0.settings.gridStepMm,
              linearPlacementMode: e2.linearPlacementMode,
              snapLayerBias: "preferActive",
            }).point,
        });
        if (!uRp) {
          return;
        }
        set({
          roofPlanePlacementSession: {
            ...rps,
            shiftDirectionLockUnit: uRp,
            shiftLockReferenceMm: null,
          },
        });
        return;
      }

      if (rps?.phase === "waitingDepth" && rps.p1 && rps.p2) {
        const fromCursor = roofPlaneNormalAndDepthFromCursorMm(rps.p1, rps.p2, cursorWorldMm, null);
        const nLock = rps.previewSlopeNormal ?? fromCursor?.n;
        if (!nLock) {
          return;
        }
        const len = Math.hypot(nLock.x, nLock.y);
        const nu = len > 1e-9 ? { x: nLock.x / len, y: nLock.y / len } : nLock;
        set({
          roofPlanePlacementSession: {
            ...rps,
            depthShiftLockNormal: nu,
          },
        });
        return;
      }

      const fbs = get().floorBeamPlacementSession;
      if (fbs?.phase === "waitingSecondPoint" && fbs.firstPointMm) {
        const uFb = computeShiftDirectionLockUnit({
          anchor: fbs.firstPointMm,
          previewEnd: fbs.previewEndMm,
          cursorWorldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
          resolveRawSnap: (raw) =>
            resolveWallPlacementToolSnap({
              rawWorldMm: raw,
              viewport,
              project: p0,
              snapSettings: snap,
              gridStepMm: p0.settings.gridStepMm,
              linearPlacementMode: e2.linearPlacementMode,
            }).point,
        });
        if (!uFb) {
          return;
        }
        set({
          floorBeamPlacementSession: {
            ...fbs,
            shiftDirectionLockUnit: uFb,
            shiftLockReferenceMm: null,
          },
        });
        return;
      }

      const ws = get().wallPlacementSession;
      if (ws?.phase === "waitingSecondPoint" && ws.firstPointMm && !get().wallCoordinateModalOpen) {
        const u = computeShiftDirectionLockUnit({
          anchor: ws.firstPointMm,
          previewEnd: ws.previewEndMm,
          cursorWorldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
          resolveRawSnap: (raw) =>
            resolveWallPlacementToolSnap({
              rawWorldMm: raw,
              viewport,
              project: p0,
              snapSettings: snap,
              gridStepMm: p0.settings.gridStepMm,
              linearPlacementMode: e2.linearPlacementMode,
            }).point,
        });
        if (!u) {
          return;
        }
        set({
          wallPlacementSession: {
            ...ws,
            shiftDirectionLockUnit: u,
            shiftLockReferenceMm: null,
          },
        });
        return;
      }

      const lcEng = get().lengthChange2dSession;
      if (get().activeTool === "changeLength" && lcEng && !get().lengthChangeCoordinateModalOpen) {
        const uLc =
          unitDirectionOrNull(lcEng.fixedEndMm, lcEng.previewMovingMm) ?? {
            x: lcEng.axisUx,
            y: lcEng.axisUy,
          };
        set({
          lengthChange2dSession: {
            ...lcEng,
            shiftDirectionLockUnit: uLc,
            shiftLockReferenceMm: null,
          },
        });
        return;
      }

      if (get().activeTool === "ruler") {
        const rs = get().ruler2dSession;
        if (rs?.phase === "stretching" && rs.firstMm) {
          const u = computeShiftDirectionLockUnit({
            anchor: rs.firstMm,
            previewEnd: rs.previewEndMm,
            cursorWorldMm,
            viewport,
            project: p0,
            snapSettings: snap,
            gridStepMm: p0.settings.gridStepMm,
          });
          if (!u) {
            return;
          }
          set({
            ruler2dSession: {
              ...rs,
              shiftDirectionLockUnit: u,
              shiftLockReferenceMm: null,
            },
          });
        }
        return;
      }

      if (get().activeTool === "line") {
        const ls = get().line2dSession;
        if (ls?.phase === "stretching" && ls.firstMm) {
          const u = computeShiftDirectionLockUnit({
            anchor: ls.firstMm,
            previewEnd: ls.previewEndMm,
            cursorWorldMm,
            viewport,
            project: p0,
            snapSettings: snap,
            gridStepMm: p0.settings.gridStepMm,
          });
          if (!u) {
            return;
          }
          set({
            line2dSession: {
              ...ls,
              shiftDirectionLockUnit: u,
              shiftLockReferenceMm: null,
            },
          });
        }
        return;
      }

      const ecEng = get().entityCopySession;
      if (ecEng?.phase === "pickTarget" && ecEng.worldAnchorStart) {
        const layerIdsEc = layerIdsForEntityCopy(p0);
        const structuralEc = snap.snapToVertex || snap.snapToEdge;
        const u = computeShiftDirectionLockUnit({
          anchor: ecEng.worldAnchorStart,
          previewEnd: ecEng.previewTargetWorldMm,
          cursorWorldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
          resolveRawSnap: (raw) => {
            const tagged = collectEntityCopySnapPointsForFullScene(p0, layerIdsEc);
            return resolveEntityCopySnap({
              refWorldMm: raw,
              viewport,
              project: p0,
              snapSettings: snap,
              gridStepMm: p0.settings.gridStepMm,
              altKey: false,
              structuralSnapEnabled: structuralEc,
              taggedPoints: tagged,
            }).point;
          },
        });
        if (!u) {
          return;
        }
        set({
          entityCopySession: {
            ...ecEng,
            shiftDirectionLockUnit: u,
            shiftLockReferenceMm: null,
          },
        });
        return;
      }

      const mc = get().wallMoveCopySession;
      if (mc?.phase === "pickTarget" && mc.anchorWorldMm) {
        const u = computeShiftDirectionLockUnit({
          anchor: mc.anchorWorldMm,
          previewEnd: mc.previewTargetMm,
          cursorWorldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
        });
        if (!u) {
          return;
        }
        set({
          wallMoveCopySession: {
            ...mc,
            shiftDirectionLockUnit: u,
            shiftLockReferenceMm: null,
          },
        });
        return;
      }

      const fbMv = get().floorBeamMoveCopySession;
      if (fbMv?.phase === "pickTarget" && fbMv.baseAnchorWorldMm) {
        const preview =
          fbMv.previewTargetMm ??
          (fbMv.dragDeltaMm
            ? {
                x: fbMv.baseAnchorWorldMm.x + fbMv.dragDeltaMm.x,
                y: fbMv.baseAnchorWorldMm.y + fbMv.dragDeltaMm.y,
              }
            : null);
        const uFb = computeShiftDirectionLockUnit({
          anchor: fbMv.baseAnchorWorldMm,
          previewEnd: preview,
          cursorWorldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
        });
        if (!uFb) {
          return;
        }
        set({
          floorBeamMoveCopySession: {
            ...fbMv,
            shiftDirectionLockUnit: uFb,
            shiftLockReferenceMm: null,
          },
        });
      }
    },

    linearPlacementReleaseShiftDirectionLock: () => {
      const rps = get().roofPlanePlacementSession;
      const fbs = get().floorBeamPlacementSession;
      const ws = get().wallPlacementSession;
      const rs = get().ruler2dSession;
      const ls = get().line2dSession;
      const mc = get().wallMoveCopySession;
      const ec = get().entityCopySession;
      const lc = get().lengthChange2dSession;
      const fbMv = get().floorBeamMoveCopySession;
      const rpClear =
        rps &&
        (rps.shiftDirectionLockUnit != null ||
          rps.shiftLockReferenceMm != null ||
          rps.depthShiftLockNormal != null)
          ? {
              roofPlanePlacementSession: {
                ...rps,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
                depthShiftLockNormal: null,
              },
            }
          : {};
      const fbClear =
        fbs && (fbs.shiftDirectionLockUnit != null || fbs.shiftLockReferenceMm != null)
          ? {
              floorBeamPlacementSession: {
                ...fbs,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
            }
          : {};
      const wClear =
        ws && (ws.shiftDirectionLockUnit != null || ws.shiftLockReferenceMm != null)
          ? {
              wallPlacementSession: {
                ...ws,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
            }
          : {};
      const rClear =
        rs && (rs.shiftDirectionLockUnit != null || rs.shiftLockReferenceMm != null)
          ? {
              ruler2dSession: {
                ...rs,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
            }
          : {};
      const lLineClear =
        ls && (ls.shiftDirectionLockUnit != null || ls.shiftLockReferenceMm != null)
          ? {
              line2dSession: {
                ...ls,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
            }
          : {};
      const mClear =
        mc && (mc.shiftDirectionLockUnit != null || mc.shiftLockReferenceMm != null)
          ? {
              wallMoveCopySession: {
                ...mc,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
            }
          : {};
      const ecClear =
        ec && (ec.shiftDirectionLockUnit != null || ec.shiftLockReferenceMm != null)
          ? {
              entityCopySession: {
                ...ec,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
            }
          : {};
      const lcClear =
        lc && (lc.shiftDirectionLockUnit != null || lc.shiftLockReferenceMm != null)
          ? {
              lengthChange2dSession: {
                ...lc,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
            }
          : {};
      const fbMvClear =
        fbMv && (fbMv.shiftDirectionLockUnit != null || fbMv.shiftLockReferenceMm != null)
          ? {
              floorBeamMoveCopySession: {
                ...fbMv,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
            }
          : {};
      if (
        Object.keys(rpClear).length +
          Object.keys(fbClear).length +
          Object.keys(wClear).length +
          Object.keys(rClear).length +
          Object.keys(lLineClear).length +
          Object.keys(mClear).length +
          Object.keys(ecClear).length +
          Object.keys(lcClear).length +
          Object.keys(fbMvClear).length >
        0
      ) {
        set({
          ...rpClear,
          ...fbClear,
          ...wClear,
          ...rClear,
          ...lLineClear,
          ...mClear,
          ...ecClear,
          ...lcClear,
          ...fbMvClear,
        });
      }
    },

    wallPlacementPrimaryClick: (worldMm, viewport, opts) => {
      if (get().wallAnchorCoordinateModalOpen) {
        return;
      }
      if (get().wallCoordinateModalOpen) {
        return;
      }
      const p0 = get().currentProject;
      const session = get().wallPlacementSession;
      if (!session) {
        return;
      }

      if (session.phase === "waitingSecondPoint" && session.firstPointMm) {
        const e2 = p0.settings.editor2d;
        const r = computeLinearSecondPointPreview({
          anchor: session.firstPointMm,
          rawWorldMm: worldMm,
          viewport,
          project: p0,
          snapSettings: editor2dSnapSettings(p0),
          gridStepMm: p0.settings.gridStepMm,
          shiftDirectionLockUnit: session.shiftDirectionLockUnit,
          angleSnapLockedDeg: session.angleSnapLockedDeg,
          skipAngleSnap: Boolean(opts?.altKey),
          altKey: Boolean(opts?.altKey),
          shiftLockFindHit: (args) =>
            findWallPlacementShiftLockSnapHit({
              ...args,
              linearPlacementMode: e2.linearPlacementMode,
            }),
        });
        get().wallPlacementCompleteSecondPoint(r.previewEnd);
        return;
      }

      const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport);
      let pt = snap.point;

      const anchorOn = get().wallAnchorPlacementModeActive;
      const anchorMm = get().wallPlacementAnchorMm;
      const firstPickPhase =
        session.phase === "waitingOriginAndFirst" || session.phase === "waitingFirstWallPoint";

      if (anchorOn && firstPickPhase && anchorMm == null) {
        set({
          wallPlacementAnchorMm: pt,
          wallPlacementAnchorPreviewEndMm: pt,
          wallPlacementAnchorLastSnapKind: snap.kind,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          lastError: null,
        });
        return;
      }

      const clearAfterWallStart = {
        wallPlacementAnchorMm: null as Point2D | null,
        wallPlacementAnchorPreviewEndMm: null as Point2D | null,
        wallPlacementAnchorLastSnapKind: null as SnapKind | null,
        wallPlacementAnchorAngleSnapLockedDeg: null as number | null,
        wallAnchorCoordinateModalOpen: false,
      };

      if (anchorOn && anchorMm != null && firstPickPhase && !opts?.altKey) {
        pt = applyWallDirectionAngleSnapToPoint(
          anchorMm,
          pt,
          get().wallPlacementAnchorAngleSnapLockedDeg ?? null,
          {},
        ).point;
      }

      if (session.phase === "waitingOriginAndFirst") {
        const nextOrigin = setProjectOrigin(p0, pt);
        const v3 = viewport3dWithPlanOrbitTargetMm(p0.viewState.viewport3d, pt);
        const nextProject = mergeViewState(nextOrigin, { viewport3d: v3 });
        set((s) => ({
          ...buildProjectMutationState(
            s,
            nextProject,
            {
              viewport3d: v3,
              wallPlacementSession: {
                ...session,
                phase: "waitingSecondPoint",
                firstPointMm: pt,
                previewEndMm: pt,
                lastSnapKind: snap.kind,
                angleSnapLockedDeg: null,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
              ...clearAfterWallStart,
              dirty: true,
              lastError: null,
            },
            { skipHistory: true },
          ),
        }));
        return;
      }

      if (session.phase === "waitingFirstWallPoint") {
        set({
          wallPlacementSession: {
            ...session,
            phase: "waitingSecondPoint",
            firstPointMm: pt,
            previewEndMm: pt,
            lastSnapKind: snap.kind,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          ...clearAfterWallStart,
          lastError: null,
        });
        return;
      }
    },

    wallPlacementCompleteSecondPoint: (secondSnappedMm) => {
      const session = get().wallPlacementSession;
      if (!session || session.phase !== "waitingSecondPoint") {
        return;
      }
      const p0 = get().currentProject;
      const result = commitWallPlacementSecondPoint(
        p0,
        session,
        session.draft,
        p0.settings.editor2d.wallShapeMode,
        p0.settings.editor2d.linearPlacementMode,
        secondSnappedMm,
      );
      if ("error" in result) {
        set({ lastError: result.error });
        return;
      }
      const nextProject = result.project;
      set((s) =>
        buildProjectMutationState(
          s,
          nextProject,
          {
            wallPlacementSession: {
              phase: initialWallPlacementPhase(nextProject),
              draft: session.draft,
              firstPointMm: null,
              previewEndMm: null,
              lastSnapKind: null,
              angleSnapLockedDeg: null,
              shiftDirectionLockUnit: null,
              shiftLockReferenceMm: null,
            },
            wallPlacementHistoryBaseline: null,
            wallCoordinateModalOpen: false,
            floorBeamPlacementCoordinateModalOpen: false,
            wallAnchorCoordinateModalOpen: false,
            wallPlacementAnchorMm: null,
            wallPlacementAnchorPreviewEndMm: null,
            wallPlacementAnchorLastSnapKind: null,
            wallPlacementAnchorAngleSnapLockedDeg: null,
            selectedEntityIds: [...result.createdWallIds],
            dirty: true,
            lastError: null,
          },
          s.wallPlacementHistoryBaseline != null
            ? { historyBefore: s.wallPlacementHistoryBaseline }
            : {},
        ),
      );
    },

    openAddFloorBeamModal: () =>
      set({
        addFloorBeamModalOpen: true,
        floorBeamSplitModalOpen: false,
        floorBeamSplitSession: null,
        lastError: null,
      }),

    closeAddFloorBeamModal: () => set({ addFloorBeamModalOpen: false }),

    setEditor2dPlanScope: (scope) =>
      set((s) => {
        const prev = s.currentProject.viewState.editor2dPlanScope;
        let nextProject = touchProjectMeta(mergeViewState(s.currentProject, { editor2dPlanScope: scope }));
        const matchedActive = projectWithActiveLayerMatchingPlanScope(nextProject, scope);
        if (matchedActive) {
          nextProject = matchedActive;
        }
        // Набор полей состояния собирается по шагам; без `any` мешают readonly-поля `AppStore`.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {
          dirty: true,
          lastError: null,
          layerListDisplayMode: "context",
          activeTool: "select",
          ruler2dSession: null,
          line2dSession: null,
          lengthChange2dSession: null,
          lengthChangeCoordinateModalOpen: false,
        };

        if (prev !== scope && s.addSlabModalOpen) {
          patch.addSlabModalOpen = false;
          patch.addSlabModalPurpose = null;
        }

        if (scope !== "main") {
          if (
            s.wallPlacementSession != null ||
            s.addWallModalOpen ||
            s.wallJointSession != null ||
            s.wallJointParamsModalOpen
          ) {
            patch.wallPlacementSession = null;
            patch.wallPlacementHistoryBaseline = null;
            patch.addWallModalOpen = false;
            patch.wallJointSession = null;
            patch.wallJointParamsModalOpen = false;
            patch.wallAnchorPlacementModeActive = false;
            patch.wallPlacementAnchorMm = null;
            patch.wallPlacementAnchorPreviewEndMm = null;
            patch.wallPlacementAnchorLastSnapKind = null;
            patch.wallPlacementAnchorAngleSnapLockedDeg = null;
            patch.wallCoordinateModalOpen = false;
            patch.wallAnchorCoordinateModalOpen = false;
          }
          patch.openingMoveModeActive = false;
          patch.projectOriginMoveToolActive = false;
          patch.projectOriginCoordinateModalOpen = false;
        }

        if (scope !== "floorStructure") {
          if (
            s.floorBeamPlacementSession != null ||
            s.floorBeamSplitSession != null ||
            s.floorBeamSplitModalOpen ||
            s.addFloorBeamModalOpen
          ) {
            patch.floorBeamPlacementSession = null;
            patch.floorBeamPlacementHistoryBaseline = null;
            patch.addFloorBeamModalOpen = false;
            patch.floorBeamSplitSession = null;
            patch.floorBeamSplitModalOpen = false;
            patch.floorBeamPlacementCoordinateModalOpen = false;
          }
        }

        if (scope !== "foundation") {
          if (
            s.foundationStripPlacementSession != null ||
            s.addFoundationStripModalOpen ||
            s.foundationPilePlacementSession != null ||
            s.addFoundationPileModalOpen ||
            s.foundationStripAutoPilesModal != null
          ) {
            patch.foundationStripPlacementSession = null;
            patch.foundationStripPlacementHistoryBaseline = null;
            patch.addFoundationStripModalOpen = false;
            patch.foundationPilePlacementSession = null;
            patch.foundationPilePlacementHistoryBaseline = null;
            patch.addFoundationPileModalOpen = false;
            patch.foundationStripAutoPilesModal = null;
          }
        }

        if (scope !== "roof") {
          if (
            s.roofPlanePlacementSession != null ||
            s.roofSystemPlacementSession != null ||
            s.addRoofPlaneModalOpen
          ) {
            patch.roofPlanePlacementSession = null;
            patch.roofPlanePlacementHistoryBaseline = null;
            patch.roofSystemPlacementSession = null;
            patch.roofSystemPlacementHistoryBaseline = null;
            patch.addRoofPlaneModalOpen = false;
          }
          if (s.roofSystemEditModal != null) {
            patch.roofSystemEditModal = null;
          }
          if (s.roofPlaneEditModal != null) {
            patch.roofPlaneEditModal = null;
          }
          if (s.roofContourJoinSession != null) {
            patch.roofContourJoinSession = null;
            patch.roofContourJoinHistoryBaseline = null;
          }
          patch.roofPlaneEdgeOffsetModal = null;
        }

        const slabAllowed = scope === "floorStructure" || scope === "foundation";
        if (!slabAllowed) {
          if (s.slabPlacementSession != null) {
            patch.slabPlacementSession = null;
            patch.slabPlacementHistoryBaseline = null;
            patch.slabCoordinateModalOpen = false;
          }
        } else if (s.slabPlacementSession != null) {
          const wantPurpose: SlabStructuralPurpose = scope === "foundation" ? "foundation" : "overlap";
          if (s.slabPlacementSession.draft.purpose !== wantPurpose) {
            patch.slabPlacementSession = null;
            patch.slabPlacementHistoryBaseline = null;
            patch.slabCoordinateModalOpen = false;
          }
        }

        return buildProjectMutationState(s, nextProject, patch);
      }),

    applyAddFloorBeamModal: (input) => {
      const p = get().currentProject;
      const profile = getProfileById(p, input.profileId);
      if (!profile) {
        set({ lastError: "Профиль не найден." });
        return;
      }
      if (!isProfileUsableForFloorBeam(profile)) {
        set({ lastError: "Выберите профиль для балки/доски (не категория «стена»)." });
        return;
      }
      const { planThicknessMm } = beamPlanThicknessAndVerticalMm(profile, input.sectionRolled);
      if (!(planThicknessMm > 0)) {
        set({ lastError: "Некорректные размеры сечения профиля." });
        return;
      }
      if (!Number.isFinite(input.baseElevationMm)) {
        set({ lastError: "Уровень должен быть числом (мм)." });
        return;
      }
      const phase = initialFloorBeamPlacementPhase(p);
      const baseline = cloneProjectSnapshot(p);
      set({
        floorBeamPlacementHistoryBaseline: baseline,
        floorBeamPlacementSession: {
          phase,
          draft: {
            profileId: input.profileId,
            baseElevationMm: input.baseElevationMm,
            sectionRolled: input.sectionRolled,
            planThicknessMm,
          },
          firstPointMm: null,
          previewEndMm: null,
          lastSnapKind: null,
          angleSnapLockedDeg: null,
          shiftDirectionLockUnit: null,
          shiftLockReferenceMm: null,
        },
        addFloorBeamModalOpen: false,
        floorBeamSplitModalOpen: false,
        floorBeamSplitSession: null,
        wallPlacementSession: null,
        wallPlacementHistoryBaseline: null,
        addWallModalOpen: false,
        wallJointSession: null,
        wallJointParamsModalOpen: false,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    cancelFloorBeamPlacement: () =>
      set({
        floorBeamPlacementSession: null,
        floorBeamPlacementHistoryBaseline: null,
        floorBeamPlacementCoordinateModalOpen: false,
        addFloorBeamModalOpen: false,
        lastError: null,
      }),

    openAddRoofPlaneModal: () =>
      set({
        addRoofPlaneModalOpen: true,
        roofContourJoinSession: null,
        roofContourJoinHistoryBaseline: null,
        roofSystemPlacementSession: null,
        roofSystemPlacementHistoryBaseline: null,
        roofSystemEditModal: null,
        roofPlaneEditModal: null,
        lastError: null,
      }),

    closeAddRoofPlaneModal: () => set({ addRoofPlaneModalOpen: false }),

    applyAddRoofPlaneModal: (input) => {
      const p = get().currentProject;
      if (p.viewState.editor2dPlanScope !== "roof") {
        set({ lastError: "Переключитесь в режим «Крыша»." });
        return;
      }
      const profileId = String(input.profileId ?? "").trim();
      if (!profileId) {
        set({ lastError: "Выберите профиль кровли." });
        return;
      }
      const profile = getProfileById(p, profileId);
      if (!profile || !isProfileUsableForRoofPlane(profile)) {
        set({ lastError: "Выберите профиль категории «крыша»." });
        return;
      }
      const angleDeg = Number(input.angleDeg);
      const levelMm = Number(input.levelMm);
      if (!Number.isFinite(angleDeg)) {
        set({ lastError: "Угол должен быть числом (градусы)." });
        return;
      }
      if (!Number.isFinite(levelMm)) {
        set({ lastError: "Уровень должен быть числом (мм)." });
        return;
      }
      const draft: RoofPlanePlacementDraftPersisted = { angleDeg, levelMm, profileId };
      const baseline = cloneProjectSnapshot(p);
      set({
        addRoofPlaneModalOpen: false,
        roofPlanePlacementHistoryBaseline: baseline,
        roofPlanePlacementSession: newRoofPlanePlacementSession(draft),
        lastRoofPlanePlacementParams: draft,
        roofContourJoinSession: null,
        roofContourJoinHistoryBaseline: null,
        roofSystemPlacementSession: null,
        roofSystemPlacementHistoryBaseline: null,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    applyAddRoofSystemModal: (input) => {
      const p = get().currentProject;
      if (p.viewState.editor2dPlanScope !== "roof") {
        set({ lastError: "Переключитесь в режим «Крыша»." });
        return;
      }
      const profileId = String(input.profileId ?? "").trim();
      if (!profileId) {
        set({ lastError: "Выберите профиль кровли." });
        return;
      }
      const profile = getProfileById(p, profileId);
      if (!profile || !isProfileUsableForRoofPlane(profile)) {
        set({ lastError: "Выберите профиль категории «крыша»." });
        return;
      }
      const pitchDeg = Number(input.pitchDeg);
      const baseLevelMm = Number(input.baseLevelMm);
      const eaveOverhangMm = Number(input.eaveOverhangMm);
      const sideOverhangMm = Number(input.sideOverhangMm);
      if (!Number.isFinite(pitchDeg) || !Number.isFinite(baseLevelMm)) {
        set({ lastError: "Угол и уровень должны быть числами." });
        return;
      }
      if (!Number.isFinite(eaveOverhangMm) || !Number.isFinite(sideOverhangMm) || eaveOverhangMm < 0 || sideOverhangMm < 0) {
        set({ lastError: "Свесы должны быть неотрицательными числами (мм)." });
        return;
      }
      const draft: RoofSystemPlacementDraftPersisted = {
        roofKind: input.roofKind,
        pitchDeg,
        baseLevelMm,
        profileId,
        eaveOverhangMm,
        sideOverhangMm,
        ridgeAlong: input.ridgeAlong,
        monoDrainCardinal: input.monoDrainCardinal,
      };
      const baseline = cloneProjectSnapshot(p);
      set({
        addRoofPlaneModalOpen: false,
        roofSystemPlacementHistoryBaseline: baseline,
        roofSystemPlacementSession: newRoofSystemPlacementSession(draft),
        lastRoofSystemPlacementParams: draft,
        roofPlanePlacementSession: null,
        roofPlanePlacementHistoryBaseline: null,
        roofContourJoinSession: null,
        roofContourJoinHistoryBaseline: null,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    cancelRoofSystemPlacement: () =>
      set({
        roofSystemPlacementSession: null,
        roofSystemPlacementHistoryBaseline: null,
        addRoofPlaneModalOpen: false,
        lastError: null,
      }),

    roofSystemPlacementBackOrExit: () => {
      const s = get().roofSystemPlacementSession;
      if (!s) {
        return;
      }
      if (s.phase === "waitingSecondCorner") {
        set({
          roofSystemPlacementSession: {
            ...s,
            phase: "waitingFirstCorner",
            firstPointMm: null,
            previewEndMm: null,
            lastSnapKind: null,
          },
          lastError: null,
        });
        return;
      }
      set({
        roofSystemPlacementSession: null,
        roofSystemPlacementHistoryBaseline: null,
        addRoofPlaneModalOpen: false,
        lastError: null,
      });
    },

    roofSystemPlacementPreviewMove: (worldMm, viewport) => {
      const s = get().roofSystemPlacementSession;
      if (!s || isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport, { snapLayerBias: "preferActive" });
      set({
        roofSystemPlacementSession: {
          ...s,
          previewEndMm: snap.point,
          lastSnapKind: snap.kind,
        },
      });
    },

    roofSystemPlacementPrimaryClick: (worldMm, viewport) => {
      const s0 = get().roofSystemPlacementSession;
      if (!s0) {
        return;
      }
      const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport, { snapLayerBias: "preferActive" });
      const pt = snap.point;
      const minLen = 10;
      const p0 = get().currentProject;

      if (s0.phase === "waitingFirstCorner") {
        set({
          roofSystemPlacementSession: {
            ...s0,
            phase: "waitingSecondCorner",
            firstPointMm: pt,
            previewEndMm: pt,
            lastSnapKind: snap.kind,
          },
          lastError: null,
        });
        return;
      }

      if (s0.phase === "waitingSecondCorner" && s0.firstPointMm) {
        const corners = rectangleCornersFromDiagonalMm(s0.firstPointMm, pt);
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        if (w < minLen || h < minLen) {
          set({ lastError: "Прямоугольник слишком мал." });
          return;
        }
        const beforeIds = new Set(p0.roofPlanes.map((r) => r.id));
        const d = s0.draft;
        let nextProject: Project;
        try {
          nextProject = addRectangleRoofSystemToProject(p0, {
            footprintCcWMm: corners,
            roofKind: d.roofKind,
            pitchDeg: d.pitchDeg,
            baseLevelMm: d.baseLevelMm,
            profileId: d.profileId,
            eaveOverhangMm: d.eaveOverhangMm,
            sideOverhangMm: d.sideOverhangMm,
            ridgeAlong: d.ridgeAlong,
            monoDrainCardinal: d.monoDrainCardinal,
          });
        } catch (e) {
          set({ lastError: e instanceof Error ? e.message : "Не удалось построить крышу." });
          return;
        }
        const newPlaneIds = nextProject.roofPlanes.filter((r) => !beforeIds.has(r.id)).map((r) => r.id);
        set((st) =>
          buildProjectMutationState(
            st,
            nextProject,
            {
              roofSystemPlacementSession: null,
              roofSystemPlacementHistoryBaseline: null,
              selectedEntityIds: newPlaneIds.length > 0 ? [newPlaneIds[0]!] : [],
              dirty: true,
              lastError: null,
            },
            st.roofSystemPlacementHistoryBaseline != null ? { historyBefore: st.roofSystemPlacementHistoryBaseline } : {},
          ),
        );
      }
    },

    openRoofSystemEditModal: (roofSystemId) =>
      set({
        roofSystemEditModal: { roofSystemId },
        roofPlaneEditModal: null,
        addRoofPlaneModalOpen: false,
        lastError: null,
      }),

    closeRoofSystemEditModal: () => set({ roofSystemEditModal: null }),

    openRoofPlaneEditModal: (roofPlaneId) =>
      set({
        roofPlaneEditModal: { roofPlaneId },
        roofSystemEditModal: null,
        addRoofPlaneModalOpen: false,
        lastError: null,
      }),

    closeRoofPlaneEditModal: () => set({ roofPlaneEditModal: null }),

    applyRoofPlaneEditModal: (input) => {
      const m = get().roofPlaneEditModal;
      if (!m) {
        return;
      }
      const p0 = get().currentProject;
      const r = applyManualRoofPlaneParamsInProject(p0, m.roofPlaneId, {
        angleDeg: Number(input.angleDeg),
        levelMm: Number(input.levelMm),
        profileId: String(input.profileId ?? "").trim(),
      });
      if (!r.ok) {
        set({ lastError: r.error });
        return;
      }
      set((st) =>
        buildProjectMutationState(
          st,
          r.project,
          {
            dirty: true,
            lastError: null,
            roofPlaneEditModal: null,
            selectedEntityIds: [m.roofPlaneId],
          },
          { historyBefore: st.currentProject },
        ),
      );
    },

    applyRoofSystemEditModal: (input) => {
      const m = get().roofSystemEditModal;
      if (!m) {
        return;
      }
      const p0 = get().currentProject;
      const profileId = String(input.profileId ?? "").trim();
      if (!profileId) {
        set({ lastError: "Выберите профиль кровли." });
        return;
      }
      const profile = getProfileById(p0, profileId);
      if (!profile || !isProfileUsableForRoofPlane(profile)) {
        set({ lastError: "Выберите профиль категории «крыша»." });
        return;
      }
      const pitchDeg = Number(input.pitchDeg);
      const baseLevelMm = Number(input.baseLevelMm);
      const eaveOverhangMm = Number(input.eaveOverhangMm);
      const sideOverhangMm = Number(input.sideOverhangMm);
      if (!Number.isFinite(pitchDeg) || !Number.isFinite(baseLevelMm)) {
        set({ lastError: "Угол и уровень должны быть числами." });
        return;
      }
      if (!Number.isFinite(eaveOverhangMm) || !Number.isFinite(sideOverhangMm) || eaveOverhangMm < 0 || sideOverhangMm < 0) {
        set({ lastError: "Свесы должны быть неотрицательными числами (мм)." });
        return;
      }
      let nextProject: Project;
      try {
        nextProject = replaceRectangleRoofSystemInProject(p0, m.roofSystemId, {
          roofKind: input.roofKind,
          pitchDeg,
          baseLevelMm,
          profileId,
          eaveOverhangMm,
          sideOverhangMm,
          ridgeAlong: input.ridgeAlong,
          monoDrainCardinal: input.monoDrainCardinal,
        });
      } catch (e) {
        set({ lastError: e instanceof Error ? e.message : "Не удалось перестроить крышу." });
        return;
      }
      const sys = nextProject.roofSystems.find((s) => s.id === m.roofSystemId);
      const sel = sys && sys.generatedPlaneIds.length > 0 ? [sys.generatedPlaneIds[0]!] : [];
      set((st) =>
        buildProjectMutationState(
          st,
          nextProject,
          {
            dirty: true,
            lastError: null,
            roofSystemEditModal: null,
            roofPlaneEditModal: null,
            selectedEntityIds: sel.length > 0 ? sel : st.selectedEntityIds,
          },
          { historyBefore: st.currentProject },
        ),
      );
    },

    cancelRoofPlanePlacement: () =>
      set({
        roofPlanePlacementSession: null,
        roofPlanePlacementHistoryBaseline: null,
        roofSystemPlacementSession: null,
        roofSystemPlacementHistoryBaseline: null,
        addRoofPlaneModalOpen: false,
        lastError: null,
      }),

    roofPlanePlacementBackOrExit: () => {
      const s = get().roofPlanePlacementSession;
      if (!s) {
        return;
      }
      if (s.phase === "waitingDepth") {
        set({
          roofPlanePlacementSession: {
            ...s,
            phase: "waitingSecondPoint",
            p2: null,
            previewEndMm: s.p1,
            depthShiftLockNormal: null,
            previewDepthMm: null,
            previewSlopeNormal: null,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
            lastSnapKind: null,
          },
          lastError: null,
        });
        return;
      }
      if (s.phase === "waitingSecondPoint") {
        set({
          roofPlanePlacementSession: {
            ...s,
            phase: "waitingFirstPoint",
            p1: null,
            p2: null,
            previewEndMm: null,
            lastSnapKind: null,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
            depthShiftLockNormal: null,
            previewDepthMm: null,
            previewSlopeNormal: null,
          },
          lastError: null,
        });
        return;
      }
      set({
        roofPlanePlacementSession: null,
        roofPlanePlacementHistoryBaseline: null,
        addRoofPlaneModalOpen: false,
        lastError: null,
      });
    },

    roofPlanePlacementFirstPointHoverMove: (worldMm, viewport) => {
      const s = get().roofPlanePlacementSession;
      if (!s || s.phase !== "waitingFirstPoint") {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport, {
        snapLayerBias: "preferActive",
      });
      set({
        roofPlanePlacementSession: {
          ...s,
          previewEndMm: snap.point,
          lastSnapKind: snap.kind,
        },
      });
    },

    roofPlanePlacementSecondPointPreviewMove: (worldMm, viewport, opts) => {
      const s = get().roofPlanePlacementSession;
      if (!s || s.phase !== "waitingSecondPoint" || !s.p1) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const p0 = get().currentProject;
      const e2 = p0.settings.editor2d;
      const snapSet = editor2dSnapSettings(p0);
      const resolveRoofSecondSnap = (raw: Point2D) =>
        resolveWallPlacementToolSnap({
          rawWorldMm: raw,
          viewport,
          project: p0,
          snapSettings: snapSet,
          gridStepMm: p0.settings.gridStepMm,
          linearPlacementMode: e2.linearPlacementMode,
          snapLayerBias: "preferActive",
        });
      const r = computeLinearSecondPointPreview({
        anchor: s.p1,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: snapSet,
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: Boolean(opts?.altKey),
        altKey: Boolean(opts?.altKey),
        resolvePrimarySnap: resolveRoofSecondSnap,
        shiftLockFindHit: (args) =>
          findWallPlacementShiftLockSnapHit({
            ...args,
            linearPlacementMode: e2.linearPlacementMode,
            snapLayerBias: "preferActive",
          }),
      });
      set({
        roofPlanePlacementSession: {
          ...s,
          previewEndMm: r.previewEnd,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    roofPlanePlacementDepthPreviewMove: (worldMm, viewport, opts) => {
      const s = get().roofPlanePlacementSession;
      if (!s || s.phase !== "waitingDepth" || !s.p1 || !s.p2) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const snap = opts?.altKey
        ? ({ point: worldMm, kind: "none" as SnapKind } as const)
        : resolveWallPlacementSnapFromStore(get, worldMm, viewport, { snapLayerBias: "preferActive" });
      const nd = roofPlaneNormalAndDepthFromCursorMm(s.p1, s.p2, snap.point, s.depthShiftLockNormal);
      if (!nd) {
        return;
      }
      set({
        roofPlanePlacementSession: {
          ...s,
          previewEndMm: snap.point,
          previewDepthMm: nd.depthMm,
          previewSlopeNormal: nd.n,
          lastSnapKind: snap.kind,
        },
      });
    },

    roofPlanePlacementPrimaryClick: (worldMm, viewport, opts) => {
      const s0 = get().roofPlanePlacementSession;
      if (!s0) {
        return;
      }
      const p0 = get().currentProject;
      const minLen = 10;

      if (s0.phase === "waitingFirstPoint") {
        const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport, {
          snapLayerBias: "preferActive",
        });
        set({
          roofPlanePlacementSession: {
            ...s0,
            phase: "waitingSecondPoint",
            p1: snap.point,
            previewEndMm: snap.point,
            lastSnapKind: snap.kind,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          lastError: null,
        });
        return;
      }

      if (s0.phase === "waitingSecondPoint" && s0.p1) {
        const e2 = p0.settings.editor2d;
        const snapSet2 = editor2dSnapSettings(p0);
        const resolveRoofSecondSnap2 = (raw: Point2D) =>
          resolveWallPlacementToolSnap({
            rawWorldMm: raw,
            viewport,
            project: p0,
            snapSettings: snapSet2,
            gridStepMm: p0.settings.gridStepMm,
            linearPlacementMode: e2.linearPlacementMode,
            snapLayerBias: "preferActive",
          });
        const r = computeLinearSecondPointPreview({
          anchor: s0.p1,
          rawWorldMm: worldMm,
          viewport,
          project: p0,
          snapSettings: snapSet2,
          gridStepMm: p0.settings.gridStepMm,
          shiftDirectionLockUnit: s0.shiftDirectionLockUnit,
          angleSnapLockedDeg: s0.angleSnapLockedDeg,
          skipAngleSnap: Boolean(opts?.altKey),
          altKey: Boolean(opts?.altKey),
          resolvePrimarySnap: resolveRoofSecondSnap2,
          shiftLockFindHit: (args) =>
            findWallPlacementShiftLockSnapHit({
              ...args,
              linearPlacementMode: e2.linearPlacementMode,
              snapLayerBias: "preferActive",
            }),
        });
        const p2 = r.previewEnd;
        if (Math.hypot(p2.x - s0.p1.x, p2.y - s0.p1.y) < minLen) {
          set({ lastError: "Базовая линия слишком короткая." });
          return;
        }
        set({
          roofPlanePlacementSession: {
            ...s0,
            phase: "waitingDepth",
            p2,
            previewEndMm: p2,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
            depthShiftLockNormal: null,
            previewDepthMm: 0,
            previewSlopeNormal: null,
            lastSnapKind: r.lastSnapKind,
          },
          lastError: null,
        });
        return;
      }

      if (s0.phase === "waitingDepth" && s0.p1 && s0.p2) {
        const snapD =
          opts?.altKey
            ? ({ point: worldMm, kind: "none" as SnapKind } as const)
            : resolveWallPlacementSnapFromStore(get, worldMm, viewport, { snapLayerBias: "preferActive" });
        const ndCommit = roofPlaneNormalAndDepthFromCursorMm(
          s0.p1,
          s0.p2,
          snapD.point,
          s0.depthShiftLockNormal,
        );
        if (!ndCommit) {
          return;
        }
        const depthMm = ndCommit.depthMm;
        const n = ndCommit.n;
        if (depthMm < minLen) {
          set({
            lastError:
              "Задайте глубину плоскости: отведите курсор перпендикулярно базовой линии, затем кликните.",
          });
          return;
        }
        const t = new Date().toISOString();
        const entityCore: RoofPlaneEntity = {
          id: newEntityId(),
          type: "roofPlane",
          layerId: p0.activeLayerId,
          p1: s0.p1,
          p2: s0.p2,
          depthMm,
          angleDeg: s0.draft.angleDeg,
          levelMm: s0.draft.levelMm,
          profileId: s0.draft.profileId,
          slopeDirection: { x: -n.x, y: -n.y },
          slopeIndex: nextRoofPlaneSlopeIndex(p0),
          createdAt: t,
          updatedAt: t,
        };
        const baseContour = roofPlaneImplicitQuadVerticesMm(entityCore).map((p) => ({ x: p.x, y: p.y }));
        const entity: RoofPlaneEntity = {
          ...entityCore,
          planContourMm: baseContour,
          planContourBaseMm: baseContour.map((p) => ({ x: p.x, y: p.y })),
        };
        const nextProject = touchProjectMeta({
          ...p0,
          roofPlanes: [...p0.roofPlanes, entity],
        });
        const nextSession = newRoofPlanePlacementSession(s0.draft);
        set((st) =>
          buildProjectMutationState(
            st,
            nextProject,
            {
              roofPlanePlacementSession: nextSession,
              roofPlanePlacementHistoryBaseline: null,
              selectedEntityIds: [entity.id],
              dirty: true,
              lastError: null,
            },
            st.roofPlanePlacementHistoryBaseline != null
              ? { historyBefore: st.roofPlanePlacementHistoryBaseline }
              : {},
          ),
        );
      }
    },

    startRoofContourJoinTool: () => {
      const p = get().currentProject;
      if (p.viewState.editor2dPlanScope !== "roof") {
        set({ lastError: "Переключитесь в режим «Крыша» на плане." });
        return;
      }
      const baseline = cloneProjectSnapshot(get().currentProject);
      set({
        roofContourJoinSession: initialRoofContourJoinSession(),
        roofContourJoinHistoryBaseline: baseline,
        roofPlanePlacementSession: null,
        roofPlanePlacementHistoryBaseline: null,
        roofSystemPlacementSession: null,
        roofSystemPlacementHistoryBaseline: null,
        addRoofPlaneModalOpen: false,
        selectedEntityIds: [],
        lastError: null,
      });
    },

    cancelRoofContourJoinTool: () =>
      set({
        roofContourJoinSession: null,
        roofContourJoinHistoryBaseline: null,
        lastError: null,
      }),

    roofContourJoinBackOrExit: () => {
      const s = get().roofContourJoinSession;
      if (!s) {
        return;
      }
      if (s.phase === "pickTargetEdge") {
        set({
          roofContourJoinSession: initialRoofContourJoinSession(),
          lastError: null,
        });
        return;
      }
      set({
        roofContourJoinSession: null,
        roofContourJoinHistoryBaseline: null,
        lastError: null,
      });
    },

    roofContourJoinPointerMove: (worldMm, viewport) => {
      const sess = get().roofContourJoinSession;
      if (!sess) {
        return;
      }
      const p0 = get().currentProject;
      const layerView = narrowProjectToActiveLayer(p0);
      const planes = layerView.roofPlanes;
      const tol = Math.max(14, 22 / viewport.zoomPixelsPerMm);
      const hintFirst = "Выберите первое ребро для соединения";
      const hintSecond = "Выберите второе ребро для соединения";
      const hintBadSecond =
        "Эти рёбра не образуют корректный стык — выберите другое ребро второго ската";
      if (sess.phase === "pickSourceEdge") {
        const h = pickRoofContourJoinHoverMm(
          worldMm,
          planes,
          tol,
          sess.hoverPlaneId,
          sess.hoverEdgeIndex,
        );
        set({
          roofContourJoinSession: {
            ...sess,
            hoverPlaneId: h?.planeId ?? null,
            hoverEdgeIndex: h?.edgeIndex ?? null,
            hint: hintFirst,
          },
        });
        return;
      }
      if (sess.sourcePlaneId == null || sess.sourceEdgeIndex == null) {
        return;
      }
      const source = planes.find((x) => x.id === sess.sourcePlaneId);
      if (!source) {
        return;
      }
      const polyS = roofPlanePolygonMm(source);
      const h2 = pickRoofContourJoinSecondEdgeHoverMm(
        worldMm,
        planes,
        sess.sourcePlaneId,
        tol,
        sess.targetHoverPlaneId,
        sess.targetHoverEdgeIndex,
      );
      if (!h2) {
        set({
          roofContourJoinSession: {
            ...sess,
            targetHoverPlaneId: null,
            targetHoverEdgeIndex: null,
            hint: hintSecond,
          },
        });
        return;
      }
      const target = planes.find((x) => x.id === h2.planeId);
      if (!target) {
        return;
      }
      const polyT = roofPlanePolygonMm(target);
      const parallel = roofJoinEdgeTangentsParallelMm(polyS, sess.sourceEdgeIndex, polyT, h2.edgeIndex);
      const pairOk =
        !parallel || areRoofJoinEdgePairCompatibleMm(polyS, sess.sourceEdgeIndex, polyT, h2.edgeIndex);
      set({
        roofContourJoinSession: {
          ...sess,
          targetHoverPlaneId: h2.planeId,
          targetHoverEdgeIndex: h2.edgeIndex,
          hint: pairOk ? hintSecond : hintBadSecond,
        },
      });
    },

    roofContourJoinPrimaryClick: (worldMm, viewport) => {
      const sess = get().roofContourJoinSession;
      if (!sess) {
        return;
      }
      const p0 = get().currentProject;
      const layerView = narrowProjectToActiveLayer(p0);
      const planes = layerView.roofPlanes;
      if (sess.phase === "pickSourceEdge") {
        if (sess.hoverPlaneId == null || sess.hoverEdgeIndex == null) {
          return;
        }
        set({
          roofContourJoinSession: {
            ...sess,
            phase: "pickTargetEdge",
            sourcePlaneId: sess.hoverPlaneId,
            sourceEdgeIndex: sess.hoverEdgeIndex,
            hoverPlaneId: null,
            hoverEdgeIndex: null,
            targetHoverPlaneId: null,
            targetHoverEdgeIndex: null,
            hint: "Выберите второе ребро для соединения",
          },
          lastError: null,
        });
        return;
      }
      const tol = Math.max(14, 22 / viewport.zoomPixelsPerMm);
      if (sess.sourcePlaneId == null || sess.sourceEdgeIndex == null) {
        return;
      }
      const h2 = pickRoofContourJoinSecondEdgeHoverMm(
        worldMm,
        planes,
        sess.sourcePlaneId,
        tol,
        sess.targetHoverPlaneId,
        sess.targetHoverEdgeIndex,
      );
      if (!h2) {
        set({
          lastError: "Наведите курсор на ребро второго ската и нажмите ЛКМ.",
        });
        return;
      }
      const a = planes.find((x) => x.id === sess.sourcePlaneId);
      const b = planes.find((x) => x.id === h2.planeId);
      if (!a || !b) {
        return;
      }
      const polyS = roofPlanePolygonMm(a);
      const polyT = roofPlanePolygonMm(b);
      const parallel = roofJoinEdgeTangentsParallelMm(polyS, sess.sourceEdgeIndex, polyT, h2.edgeIndex);
      if (parallel && !areRoofJoinEdgePairCompatibleMm(polyS, sess.sourceEdgeIndex, polyT, h2.edgeIndex)) {
        set({
          lastError:
            "Соединение невозможно: выбранные рёбра не образуют корректный стык. Выберите другое ребро.",
          roofContourJoinSession: { ...sess, hint: sess.hint },
        });
        return;
      }
      const beforeJoin = cloneProjectSnapshot(p0);
      const r = joinTwoRoofPlaneContoursBySelectedEdgesMm(a, sess.sourceEdgeIndex, b, h2.edgeIndex);
      if ("error" in r) {
        set({
          lastError: r.error,
          roofContourJoinSession: { ...sess, hint: r.error },
        });
        return;
      }
      const nextPlanes = p0.roofPlanes.map((rp) =>
        rp.id === r.a.id ? r.a : rp.id === r.b.id ? r.b : rp,
      );
      const touched = touchProjectMeta({ ...p0, roofPlanes: nextPlanes });
      /**
       * Если в расчёте крыши только один из двух скатов стыка, без пары обновится только он — асимметрия.
       * Сначала синхронизируем свесы по обоим id стыка, затем общий refresh по всем расчётным скатам.
       */
      let nextProject = refreshRoofOverhangForJoinPairInProject(touched, r.a.id, r.b.id);
      nextProject = refreshAllCalculatedRoofPlaneOverhangsInProject(nextProject);
      set((st) => ({
        ...buildProjectMutationState(
          st,
          nextProject,
          {
            roofContourJoinSession: initialRoofContourJoinSession(),
            roofContourJoinHistoryBaseline: st.roofContourJoinHistoryBaseline,
            selectedEntityIds: [r.a.id, r.b.id],
            dirty: true,
            lastError: null,
          },
          { historyBefore: beforeJoin },
        ),
      }));
    },

    openFloorBeamSplitModal: () =>
      set({
        floorBeamSplitModalOpen: true,
        floorBeamPlacementSession: null,
        floorBeamPlacementHistoryBaseline: null,
        addFloorBeamModalOpen: false,
        lastError: null,
      }),

    closeFloorBeamSplitModal: () => set({ floorBeamSplitModalOpen: false }),

    applyFloorBeamSplitModal: (input) => {
      const overlapRaw = input.overlapMm;
      const overlapMm =
        !Number.isFinite(overlapRaw) || overlapRaw < 0 ? 0 : Math.round(overlapRaw * 1000) / 1000;
      const s = get();
      const p0 = s.currentProject;
      const selected = s.selectedEntityIds;
      const beamIdSet = new Set(p0.floorBeams.map((b) => b.id));
      const beamIds = selected.filter((id) => beamIdSet.has(id));
      const skippedNonBeam = selected.length - beamIds.length;

      if (input.mode === "atPoint" && beamIds.length > 1) {
        set({
          lastError:
            "Режим «по указанному месту» нельзя применить сразу к нескольким балкам. Оставьте в выборке одну балку или снимите выделение и укажите место кликом.",
        });
        return;
      }

      const useHoverPick = beamIds.length === 0 || input.mode === "atPoint";
      if (useHoverPick) {
        const hoverMsg =
          beamIds.length === 0 && selected.length > 0
            ? `В выборке нет балок перекрытия (${selected.length} объектов). Укажите балку кликом на плане.`
            : null;
        set({
          floorBeamSplitModalOpen: false,
          floorBeamSplitSession: { mode: input.mode, overlapMm },
          lastError: hoverMsg,
        });
        return;
      }

      if (p0.viewState.editor2dPlanScope !== "floorStructure") {
        set({ lastError: "Переключитесь в режим «Перекрытие» на плане." });
        return;
      }

      const before = cloneProjectSnapshot(p0);
      let next = p0;
      let applied = 0;
      let noop = 0;
      let errCount = 0;
      const allNewIds: string[] = [];
      const errSamples: string[] = [];
      for (const id of beamIds) {
        const r = applyFloorBeamSplitInProject(next, id, input.mode, overlapMm, null);
        if (r.kind === "applied") {
          next = r.project;
          applied += 1;
          allNewIds.push(...r.newBeamIds);
        } else if (r.kind === "noop") {
          noop += 1;
        } else {
          errCount += 1;
          if (errSamples.length < 2) {
            errSamples.push(r.error);
          }
        }
      }

      const parts: string[] = [];
      if (applied > 0) {
        parts.push(`Разделено балок: ${applied}`);
      }
      if (noop > 0) {
        parts.push(`без изменений (короче лимита): ${noop}`);
      }
      if (skippedNonBeam > 0) {
        parts.push(`не балки перекрытия в выборке: ${skippedNonBeam}`);
      }
      if (errCount > 0) {
        parts.push(`ошибок: ${errCount}${errSamples.length ? ` (${errSamples.join("; ")})` : ""}`);
      }
      const summary = parts.join(" · ");

      if (applied === 0) {
        set({
          floorBeamSplitModalOpen: false,
          floorBeamSplitSession: null,
          lastError: summary || "Ни одна балка не была разделена.",
        });
        return;
      }

      set((st) =>
        buildProjectMutationState(
          st,
          next,
          {
            floorBeamSplitModalOpen: false,
            floorBeamSplitSession: null,
            selectedEntityIds: allNewIds,
            dirty: true,
            lastError: summary || null,
          },
          { historyBefore: before },
        ),
      );
    },

    cancelFloorBeamSplitTool: () => set({ floorBeamSplitSession: null, lastError: null }),

    floorBeamSplitCommitOnBeamClick: (input) => {
      const sess = get().floorBeamSplitSession;
      if (!sess) {
        return;
      }
      if (get().currentProject.viewState.editor2dPlanScope !== "floorStructure") {
        set({ lastError: "Переключитесь в режим «Перекрытие» на плане." });
        return;
      }
      const p0 = get().currentProject;
      const beam = p0.floorBeams.find((b) => b.id === input.beamId);
      if (!beam) {
        set({ lastError: "Балка не найдена." });
        return;
      }
      const snap = resolvePlacementSnap(get, input.rawWorldMm, input.viewport, undefined, beam.id);
      const worldPick = sess.mode === "atPoint" ? snap.point : null;
      const before = cloneProjectSnapshot(p0);
      const r = applyFloorBeamSplitInProject(p0, beam.id, sess.mode, sess.overlapMm, worldPick);
      if (r.kind === "applied") {
        set((st) =>
          buildProjectMutationState(
            st,
            r.project,
            {
              selectedEntityIds: [...r.newBeamIds],
              dirty: true,
              lastError: null,
            },
            { historyBefore: before },
          ),
        );
        return;
      }
      if (r.kind === "noop") {
        set({ lastError: r.message });
        return;
      }
      set({ lastError: r.error });
    },

    floorBeamPlacementBackOrExit: () => {
      const session = get().floorBeamPlacementSession;
      if (!session) {
        return;
      }
      if (session.phase === "waitingSecondPoint") {
        set({
          floorBeamPlacementSession: {
            ...session,
            phase: "waitingFirstPoint",
            firstPointMm: null,
            previewEndMm: null,
            lastSnapKind: null,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          floorBeamPlacementCoordinateModalOpen: false,
          lastError: null,
        });
        return;
      }
      const p = get().currentProject;
      set({
        floorBeamPlacementSession: {
          phase: initialFloorBeamPlacementPhase(p),
          draft: session.draft,
          firstPointMm: null,
          previewEndMm: null,
          lastSnapKind: null,
          angleSnapLockedDeg: null,
          shiftDirectionLockUnit: null,
          shiftLockReferenceMm: null,
        },
        floorBeamPlacementCoordinateModalOpen: false,
        lastError: null,
      });
    },

    floorBeamPlacementFirstPointHoverMove: (worldMm, viewport) => {
      const s = get().floorBeamPlacementSession;
      if (!s || s.firstPointMm != null) {
        return;
      }
      if (s.phase !== "waitingFirstPoint" && s.phase !== "waitingOriginAndFirst") {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport);
      set({
        floorBeamPlacementSession: {
          ...s,
          previewEndMm: snap.point,
          lastSnapKind: snap.kind,
        },
      });
    },

    floorBeamPlacementPreviewMove: (worldMm, viewport, opts) => {
      const s = get().floorBeamPlacementSession;
      if (!s || s.phase !== "waitingSecondPoint" || !s.firstPointMm) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const p0 = get().currentProject;
      const e2 = p0.settings.editor2d;
      const r = computeLinearSecondPointPreview({
        anchor: s.firstPointMm,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: Boolean(opts?.altKey),
        altKey: Boolean(opts?.altKey),
        shiftLockFindHit: (args) =>
          findWallPlacementShiftLockSnapHit({
            ...args,
            linearPlacementMode: e2.linearPlacementMode,
          }),
      });
      set({
        floorBeamPlacementSession: {
          ...s,
          previewEndMm: r.previewEnd,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    floorBeamPlacementPrimaryClick: (worldMm, viewport, opts) => {
      const p0 = get().currentProject;
      const session = get().floorBeamPlacementSession;
      if (!session) {
        return;
      }

      if (session.phase === "waitingSecondPoint" && session.firstPointMm) {
        const e2 = p0.settings.editor2d;
        const r = computeLinearSecondPointPreview({
          anchor: session.firstPointMm,
          rawWorldMm: worldMm,
          viewport,
          project: p0,
          snapSettings: editor2dSnapSettings(p0),
          gridStepMm: p0.settings.gridStepMm,
          shiftDirectionLockUnit: session.shiftDirectionLockUnit,
          angleSnapLockedDeg: session.angleSnapLockedDeg,
          skipAngleSnap: Boolean(opts?.altKey),
          altKey: Boolean(opts?.altKey),
          shiftLockFindHit: (args) =>
            findWallPlacementShiftLockSnapHit({
              ...args,
              linearPlacementMode: e2.linearPlacementMode,
            }),
        });
        get().floorBeamPlacementCompleteSecondPoint(r.previewEnd);
        return;
      }

      const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport);
      const pt = snap.point;

      if (session.phase === "waitingOriginAndFirst") {
        const nextOrigin = setProjectOrigin(p0, pt);
        const v3 = viewport3dWithPlanOrbitTargetMm(p0.viewState.viewport3d, pt);
        const nextProject = mergeViewState(nextOrigin, { viewport3d: v3 });
        set((s) => ({
          ...buildProjectMutationState(
            s,
            nextProject,
            {
              viewport3d: v3,
              floorBeamPlacementSession: {
                ...session,
                phase: "waitingSecondPoint",
                firstPointMm: pt,
                previewEndMm: pt,
                lastSnapKind: snap.kind,
                angleSnapLockedDeg: null,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
              dirty: true,
              lastError: null,
            },
            { skipHistory: true },
          ),
        }));
        return;
      }

      if (session.phase === "waitingFirstPoint") {
        set({
          floorBeamPlacementSession: {
            ...session,
            phase: "waitingSecondPoint",
            firstPointMm: pt,
            previewEndMm: pt,
            lastSnapKind: snap.kind,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          lastError: null,
        });
      }
    },

    floorBeamPlacementCompleteSecondPoint: (secondSnappedMm) => {
      const session = get().floorBeamPlacementSession;
      if (!session || session.phase !== "waitingSecondPoint") {
        return false;
      }
      const p0 = get().currentProject;
      const placementMode = p0.settings.editor2d.linearPlacementMode;
      const result = commitFloorBeamPlacementSecondPoint(
        p0,
        session,
        session.draft,
        placementMode,
        secondSnappedMm,
      );
      if ("error" in result) {
        set({ lastError: result.error });
        return false;
      }
      const nextProject = result.project;
      set((s) =>
        buildProjectMutationState(
          s,
          nextProject,
          {
            floorBeamPlacementSession: {
              phase: initialFloorBeamPlacementPhase(nextProject),
              draft: session.draft,
              firstPointMm: null,
              previewEndMm: null,
              lastSnapKind: null,
              angleSnapLockedDeg: null,
              shiftDirectionLockUnit: null,
              shiftLockReferenceMm: null,
            },
            floorBeamPlacementHistoryBaseline: null,
            floorBeamPlacementCoordinateModalOpen: false,
            selectedEntityIds: [...result.createdFloorBeamIds],
            dirty: true,
            lastError: null,
          },
          s.floorBeamPlacementHistoryBaseline != null
            ? { historyBefore: s.floorBeamPlacementHistoryBaseline }
            : {},
        ),
      );
      return true;
    },

    toggleWallAnchorPlacementMode: () => {
      if (!get().wallPlacementSession) {
        return;
      }
      const next = !get().wallAnchorPlacementModeActive;
      set({
        wallAnchorPlacementModeActive: next,
        ...(next
          ? {}
          : {
              wallPlacementAnchorMm: null,
              wallPlacementAnchorPreviewEndMm: null,
              wallPlacementAnchorLastSnapKind: null,
              wallPlacementAnchorAngleSnapLockedDeg: null,
              wallAnchorCoordinateModalOpen: false,
            }),
        lastError: null,
      });
    },

    clearWallPlacementAnchor: () =>
      set({
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        wallAnchorCoordinateModalOpen: false,
        lastError: null,
      }),

    wallPlacementAnchorPreviewMove: (worldMm, viewport, opts) => {
      if (get().wallAnchorCoordinateModalOpen) {
        return;
      }
      const s = get().wallPlacementSession;
      const anchor = get().wallPlacementAnchorMm;
      if (!get().wallAnchorPlacementModeActive || !anchor || !s) {
        return;
      }
      if (s.phase !== "waitingFirstWallPoint" && s.phase !== "waitingOriginAndFirst") {
        return;
      }
      const snap = resolveWallPlacementSnapFromStore(get, worldMm, viewport);
      let previewEnd = snap.point;
      let angleLocked = get().wallPlacementAnchorAngleSnapLockedDeg ?? null;
      if (!opts?.altKey) {
        const r = applyWallDirectionAngleSnapToPoint(anchor, previewEnd, angleLocked, opts);
        previewEnd = r.point;
        angleLocked = r.nextLockedDeg;
      } else {
        angleLocked = null;
      }
      set({
        wallPlacementAnchorPreviewEndMm: previewEnd,
        wallPlacementAnchorLastSnapKind: snap.kind,
        wallPlacementAnchorAngleSnapLockedDeg: angleLocked,
      });
    },

    openWallAnchorCoordinateModal: () => {
      const s = get().wallPlacementSession;
      const anchor = get().wallPlacementAnchorMm;
      if (!get().wallAnchorPlacementModeActive || !anchor || !s) {
        return;
      }
      if (s.phase !== "waitingFirstWallPoint" && s.phase !== "waitingOriginAndFirst") {
        return;
      }
      set({ wallAnchorCoordinateModalOpen: true, lastError: null });
    },

    closeWallAnchorCoordinateModal: () => set({ wallAnchorCoordinateModalOpen: false }),

    applyWallAnchorCoordinateModal: (input) => {
      const session = get().wallPlacementSession;
      const anchor = get().wallPlacementAnchorMm;
      if (!session || !anchor || !get().wallAnchorPlacementModeActive) {
        set({ wallAnchorCoordinateModalOpen: false });
        return;
      }
      if (session.phase !== "waitingFirstWallPoint" && session.phase !== "waitingOriginAndFirst") {
        set({ wallAnchorCoordinateModalOpen: false });
        return;
      }
      if (!Number.isFinite(input.dxMm) || !Number.isFinite(input.dyMm)) {
        set({ lastError: "Введите числовые X и Y (мм)." });
        return;
      }
      /** Ручной ввод из модалки: точка в мировых мм без grid/vertex/edge snap. */
      const pt = { x: anchor.x + input.dxMm, y: anchor.y + input.dyMm };
      const p0 = get().currentProject;
      const clearAfterStart = {
        wallPlacementAnchorMm: null as Point2D | null,
        wallPlacementAnchorPreviewEndMm: null as Point2D | null,
        wallPlacementAnchorLastSnapKind: null as SnapKind | null,
        wallPlacementAnchorAngleSnapLockedDeg: null as number | null,
        wallAnchorCoordinateModalOpen: false,
      };
      if (session.phase === "waitingOriginAndFirst") {
        const nextOrigin = setProjectOrigin(p0, pt);
        const v3 = viewport3dWithPlanOrbitTargetMm(p0.viewState.viewport3d, pt);
        const nextProject = mergeViewState(nextOrigin, { viewport3d: v3 });
        set((s) => ({
          ...buildProjectMutationState(
            s,
            nextProject,
            {
              viewport3d: v3,
              wallPlacementSession: {
                ...session,
                phase: "waitingSecondPoint",
                firstPointMm: pt,
                previewEndMm: pt,
                lastSnapKind: "none",
                angleSnapLockedDeg: null,
                shiftDirectionLockUnit: null,
                shiftLockReferenceMm: null,
              },
              ...clearAfterStart,
              dirty: true,
              lastError: null,
            },
            { skipHistory: true },
          ),
        }));
        return;
      }
      set({
        wallPlacementSession: {
          ...session,
          phase: "waitingSecondPoint",
          firstPointMm: pt,
          previewEndMm: pt,
          lastSnapKind: "none",
          angleSnapLockedDeg: null,
          shiftDirectionLockUnit: null,
          shiftLockReferenceMm: null,
        },
        ...clearAfterStart,
        lastError: null,
      });
    },

    openWallContextMenu: (input) =>
      set({
        wallContextMenu: { wallId: input.wallId, clientX: input.clientX, clientY: input.clientY },
        foundationPileContextMenu: null,
        floorBeamContextMenu: null,
        editor2dSecondaryContextMenu: null,
        lastError: null,
      }),

    closeWallContextMenu: () => set({ wallContextMenu: null }),

    deleteWallFromContextMenu: (wallId) => {
      const { currentProject, selectedEntityIds, wallDetailWallId } = get();
      const next = deleteEntitiesFromProject(currentProject, new Set([wallId]));
      set((s) =>
        buildProjectMutationState(s, next, {
          wallContextMenu: null,
          foundationPileContextMenu: null,
          floorBeamContextMenu: null,
          editor2dSecondaryContextMenu: null,
          wallMoveCopySession: null,
          foundationPileMoveCopySession: null,
          foundationPileMoveCopyHistoryBaseline: null,
          floorBeamMoveCopySession: null,
          floorBeamMoveCopyHistoryBaseline: null,
          wallMoveCopyCoordinateModalOpen: false,
          wallMoveCopyHistoryBaseline: null,
          entityCopySession: null,
          entityCopyParamsModal: null,
          entityCopyHistoryBaseline: null,
          entityCopyCoordinateModalOpen: false,
          sceneCoordModalDesiredFocus: null,
          selectedEntityIds: selectedEntityIds.filter((id) => id !== wallId),
          wallDetailWallId: wallDetailWallId === wallId ? null : wallDetailWallId,
          dirty: true,
          lastError: null,
        }),
      );
    },

    openFoundationPileContextMenu: (input) =>
      set({
        foundationPileContextMenu: {
          pileId: input.pileId,
          clientX: input.clientX,
          clientY: input.clientY,
        },
        wallContextMenu: null,
        floorBeamContextMenu: null,
        editor2dSecondaryContextMenu: null,
        lastError: null,
      }),

    closeFoundationPileContextMenu: () => set({ foundationPileContextMenu: null }),

    openFloorBeamContextMenu: (input) =>
      set({
        floorBeamContextMenu: {
          beamId: input.beamId,
          clientX: input.clientX,
          clientY: input.clientY,
        },
        wallContextMenu: null,
        foundationPileContextMenu: null,
        editor2dSecondaryContextMenu: null,
        lastError: null,
      }),

    closeFloorBeamContextMenu: () => set({ floorBeamContextMenu: null }),

    openEditor2dSecondaryContextMenu: (input) =>
      set({
        editor2dSecondaryContextMenu: input,
        wallContextMenu: null,
        foundationPileContextMenu: null,
        floorBeamContextMenu: null,
        lastError: null,
      }),

    closeEditor2dSecondaryContextMenu: () => set({ editor2dSecondaryContextMenu: null }),

    deleteFoundationPileFromContextMenu: (pileId) => {
      const { currentProject, selectedEntityIds } = get();
      const next = deleteEntitiesFromProject(currentProject, new Set([pileId]));
      set((s) =>
        buildProjectMutationState(s, next, {
          foundationPileContextMenu: null,
          editor2dSecondaryContextMenu: null,
          foundationPileMoveCopySession: null,
          foundationPileMoveCopyHistoryBaseline: null,
          selectedEntityIds: selectedEntityIds.filter((id) => id !== pileId),
          dirty: true,
          lastError: null,
        }),
      );
    },

    deleteFloorBeamFromContextMenu: (beamId) => {
      const { currentProject, selectedEntityIds } = get();
      const next = deleteEntitiesFromProject(currentProject, new Set([beamId]));
      set((s) =>
        buildProjectMutationState(s, next, {
          floorBeamContextMenu: null,
          editor2dSecondaryContextMenu: null,
          floorBeamMoveCopySession: null,
          floorBeamMoveCopyHistoryBaseline: null,
          floorBeamMoveCopyCoordinateModalOpen: false,
          sceneCoordModalDesiredFocus: null,
          selectedEntityIds: selectedEntityIds.filter((id) => id !== beamId),
          dirty: true,
          lastError: null,
        }),
      );
    },

    startFoundationPileMoveFromContextMenu: (pileId) => {
      const pile = get().currentProject.foundationPiles.find((p) => p.id === pileId);
      if (!pile) {
        set({ lastError: "Свая не найдена.", foundationPileContextMenu: null });
        return;
      }
      const baseline = cloneProjectSnapshot(get().currentProject);
      set({
        foundationPileMoveCopyHistoryBaseline: baseline,
        foundationPileContextMenu: null,
        floorBeamContextMenu: null,
        editor2dSecondaryContextMenu: null,
        wallContextMenu: null,
        wallMoveCopySession: null,
        wallMoveCopyCoordinateModalOpen: false,
        wallMoveCopyHistoryBaseline: null,
        entityCopySession: null,
        entityCopyParamsModal: null,
        entityCopyHistoryBaseline: null,
        entityCopyCoordinateModalOpen: false,
        floorBeamMoveCopySession: null,
        floorBeamMoveCopyHistoryBaseline: null,
        floorBeamMoveCopyCoordinateModalOpen: false,
        sceneCoordModalDesiredFocus: null,
        foundationPileMoveCopySession: {
          mode: "move",
          sourcePileId: pileId,
          workingPileId: pileId,
          phase: "pickBase",
          baseOffsetFromCenterMm: null,
          previewCenterMm: null,
          lastSnapKind: null,
        },
        selectedEntityIds: [pileId],
        lastError: null,
      });
    },

    startFoundationPileCopyFromContextMenu: (pileId) => {
      get().startEntityCopyMode({ kind: "foundationPile", id: pileId });
    },

    cancelFoundationPileMoveCopy: () => {
      const s = get().foundationPileMoveCopySession;
      if (!s) {
        return;
      }
      runWithoutProjectHistory(() => {
        let proj = get().currentProject;
        if (s.mode === "copy") {
          proj = deleteEntitiesFromProject(proj, new Set([s.workingPileId]));
        }
        set({
          currentProject: touchProjectMeta(proj),
          foundationPileMoveCopySession: null,
          foundationPileMoveCopyHistoryBaseline: null,
          selectedEntityIds: proj.foundationPiles.some((p) => p.id === s.sourcePileId) ? [s.sourcePileId] : [],
          dirty: true,
          lastError: null,
        });
      });
    },

    foundationPileMoveCopyPreviewMove: (worldMm, viewport) => {
      const s = get().foundationPileMoveCopySession;
      if (!s || s.phase !== "pickTarget" || !s.baseOffsetFromCenterMm) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport, s.workingPileId);
      const off = s.baseOffsetFromCenterMm;
      const previewCenterMm = { x: snap.point.x - off.x, y: snap.point.y - off.y };
      set({
        foundationPileMoveCopySession: {
          ...s,
          previewCenterMm,
          lastSnapKind: snap.kind,
        },
      });
    },

    foundationPileMoveCopyPrimaryClick: (worldMm, viewport) => {
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const s = get().foundationPileMoveCopySession;
      if (!s) {
        return;
      }
      const pile = get().currentProject.foundationPiles.find((p) => p.id === s.workingPileId);
      if (!pile) {
        get().cancelFoundationPileMoveCopy();
        return;
      }
      if (s.phase === "pickBase") {
        const tolPx = 18;
        const hit = pickClosestFoundationPileHandle(worldMm, pile, viewport, tolPx);
        if (!hit) {
          set({ lastError: "Выберите центр или угол сваи (ближайшая ручка)." });
          return;
        }
        const baseOffsetFromCenterMm = {
          x: hit.pointMm.x - pile.centerX,
          y: hit.pointMm.y - pile.centerY,
        };
        set({
          foundationPileMoveCopySession: {
            ...s,
            phase: "pickTarget",
            baseOffsetFromCenterMm,
            previewCenterMm: { x: pile.centerX, y: pile.centerY },
            lastSnapKind: null,
          },
          lastError: null,
        });
        return;
      }
      const off = s.baseOffsetFromCenterMm;
      if (!off) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport, s.workingPileId);
      const T = snap.point;
      const finalCenter = { x: T.x - off.x, y: T.y - off.y };
      const dx = finalCenter.x - pile.centerX;
      const dy = finalCenter.y - pile.centerY;
      if (Math.hypot(dx, dy) < MIN_WALL_SEGMENT_LENGTH_MM) {
        set({ lastError: "Смещение слишком мало." });
        return;
      }
      const proj = translateFoundationPilesInProject(get().currentProject, new Set([s.workingPileId]), dx, dy);
      set((st) =>
        buildProjectMutationState(
          st,
          touchProjectMeta(proj),
          {
            foundationPileMoveCopySession: null,
            foundationPileMoveCopyHistoryBaseline: null,
            selectedEntityIds: [s.workingPileId],
            dirty: true,
            lastError: null,
          },
          {
            historyBefore: st.foundationPileMoveCopyHistoryBaseline ?? st.currentProject,
          },
        ),
      );
    },

    startFloorBeamMoveFromContextMenu: (beamId) => {
      const beam = get().currentProject.floorBeams.find((b) => b.id === beamId);
      if (!beam) {
        set({ lastError: "Балка не найдена.", floorBeamContextMenu: null });
        return;
      }
      const baseline = cloneProjectSnapshot(get().currentProject);
      set({
        floorBeamMoveCopyHistoryBaseline: baseline,
        floorBeamContextMenu: null,
        foundationPileContextMenu: null,
        editor2dSecondaryContextMenu: null,
        wallContextMenu: null,
        wallMoveCopySession: null,
        wallMoveCopyCoordinateModalOpen: false,
        wallMoveCopyHistoryBaseline: null,
        foundationPileMoveCopySession: null,
        foundationPileMoveCopyHistoryBaseline: null,
        entityCopySession: null,
        entityCopyParamsModal: null,
        entityCopyHistoryBaseline: null,
        entityCopyCoordinateModalOpen: false,
        addFloorBeamModalOpen: false,
        floorBeamPlacementSession: null,
        floorBeamPlacementHistoryBaseline: null,
        floorBeamSplitModalOpen: false,
        floorBeamSplitSession: null,
        floorBeamMoveCopyCoordinateModalOpen: false,
        sceneCoordModalDesiredFocus: null,
        floorBeamMoveCopySession: {
          sourceBeamId: beamId,
          workingBeamId: beamId,
          phase: "pickBase",
          baseAnchorWorldMm: null,
          dragDeltaMm: null,
          lastSnapKind: null,
          previewTargetMm: null,
          angleSnapLockedDeg: null,
          shiftDirectionLockUnit: null,
          shiftLockReferenceMm: null,
          pickBaseHoverWorldMm: null,
          pickBaseHoverSnapKind: null,
        },
        selectedEntityIds: [beamId],
        lastError: null,
      });
    },

    startFloorBeamCopyFromContextMenu: (beamId) => {
      get().startEntityCopyMode({ kind: "floorBeam", id: beamId });
    },

    cancelFloorBeamMoveCopy: () => {
      const s = get().floorBeamMoveCopySession;
      if (!s) {
        return;
      }
      set({
        floorBeamMoveCopySession: null,
        floorBeamMoveCopyHistoryBaseline: null,
        floorBeamMoveCopyCoordinateModalOpen: false,
        sceneCoordModalDesiredFocus: null,
        selectedEntityIds: get().currentProject.floorBeams.some((b) => b.id === s.sourceBeamId)
          ? [s.sourceBeamId]
          : [],
        lastError: null,
      });
    },

    floorBeamMoveCopyPreviewMove: (worldMm, viewport, opts) => {
      const s = get().floorBeamMoveCopySession;
      if (!s || !viewport) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const p0 = get().currentProject;
      const beam = p0.floorBeams.find((b) => b.id === s.workingBeamId);
      if (!beam) {
        return;
      }
      const snapS = editor2dSnapSettings(p0);
      const gridMm = p0.settings.gridStepMm;
      const altKey = Boolean(opts?.altKey);

      if (s.phase === "pickBase") {
        const r = snapFloorBeamMoveBasePoint(p0, beam, worldMm, viewport, snapS, gridMm);
        set({
          floorBeamMoveCopySession: {
            ...s,
            pickBaseHoverWorldMm: r.point,
            pickBaseHoverSnapKind: r.kind,
          },
        });
        return;
      }

      if (s.phase !== "pickTarget" || !s.baseAnchorWorldMm) {
        return;
      }
      const anchor = s.baseAnchorWorldMm;
      const r = computeLinearSecondPointPreview({
        anchor,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: snapS,
        gridStepMm: gridMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: get().floorBeamMoveCopyCoordinateModalOpen || altKey,
        altKey,
      });
      const dragDeltaMm = { x: r.previewEnd.x - anchor.x, y: r.previewEnd.y - anchor.y };
      set({
        floorBeamMoveCopySession: {
          ...s,
          previewTargetMm: r.previewEnd,
          dragDeltaMm,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    floorBeamMoveCopyPrimaryClick: (worldMm, viewport, opts) => {
      if (get().floorBeamMoveCopyCoordinateModalOpen) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const s = get().floorBeamMoveCopySession;
      if (!s) {
        return;
      }
      const p0 = get().currentProject;
      const beam = p0.floorBeams.find((b) => b.id === s.workingBeamId);
      if (!beam) {
        get().cancelFloorBeamMoveCopy();
        return;
      }
      if (s.phase === "pickBase") {
        if (!viewport) {
          return;
        }
        const snapS = editor2dSnapSettings(p0);
        const hit = snapFloorBeamMoveBasePoint(p0, beam, worldMm, viewport, snapS, p0.settings.gridStepMm);
        set({
          floorBeamMoveCopySession: {
            ...s,
            phase: "pickTarget",
            baseAnchorWorldMm: { x: hit.point.x, y: hit.point.y },
            dragDeltaMm: { x: 0, y: 0 },
            lastSnapKind: hit.kind,
            previewTargetMm: { x: hit.point.x, y: hit.point.y },
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
            pickBaseHoverWorldMm: null,
            pickBaseHoverSnapKind: null,
          },
          lastError: null,
        });
        return;
      }
      const anchor = s.baseAnchorWorldMm;
      if (!anchor) {
        return;
      }
      if (!viewport) {
        return;
      }
      const snapS = editor2dSnapSettings(p0);
      const altKey = Boolean(opts?.altKey);
      const rEnd = computeLinearSecondPointPreview({
        anchor,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: snapS,
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: altKey,
        altKey,
      });
      const dx = rEnd.previewEnd.x - anchor.x;
      const dy = rEnd.previewEnd.y - anchor.y;
      if (Math.hypot(dx, dy) < MIN_WALL_SEGMENT_LENGTH_MM) {
        set({ lastError: "Смещение слишком мало." });
        return;
      }
      const proj = translateFloorBeamsInProject(get().currentProject, new Set([s.workingBeamId]), dx, dy);
      set((st) =>
        buildProjectMutationState(
          st,
          touchProjectMeta(proj),
          {
            floorBeamMoveCopySession: null,
            floorBeamMoveCopyHistoryBaseline: null,
            floorBeamMoveCopyCoordinateModalOpen: false,
            sceneCoordModalDesiredFocus: null,
            selectedEntityIds: [s.workingBeamId],
            dirty: true,
            lastError: null,
          },
          {
            historyBefore: st.floorBeamMoveCopyHistoryBaseline ?? st.currentProject,
          },
        ),
      );
    },

    openFloorBeamMoveCopyCoordinateModal: (opts) => {
      const s = get().floorBeamMoveCopySession;
      if (!s || s.phase !== "pickTarget" || !s.baseAnchorWorldMm) {
        return;
      }
      set({
        floorBeamMoveCopyCoordinateModalOpen: true,
        lastError: null,
        sceneCoordModalDesiredFocus: opts?.focus ?? "x",
      });
    },

    closeFloorBeamMoveCopyCoordinateModal: () => set({ floorBeamMoveCopyCoordinateModalOpen: false }),

    applyFloorBeamMoveCopyCoordinateModal: (input) => {
      const s = get().floorBeamMoveCopySession;
      if (!s?.baseAnchorWorldMm || s.phase !== "pickTarget") {
        set({ floorBeamMoveCopyCoordinateModalOpen: false });
        return;
      }
      if (!Number.isFinite(input.dxMm) || !Number.isFinite(input.dyMm)) {
        set({ lastError: "Введите числовые X и Y (мм)." });
        return;
      }
      if (Math.hypot(input.dxMm, input.dyMm) < MIN_WALL_SEGMENT_LENGTH_MM) {
        set({ lastError: "Смещение слишком мало.", floorBeamMoveCopyCoordinateModalOpen: false });
        return;
      }
      const proj = translateFloorBeamsInProject(get().currentProject, new Set([s.workingBeamId]), input.dxMm, input.dyMm);
      set((st) =>
        buildProjectMutationState(
          st,
          touchProjectMeta(proj),
          {
            floorBeamMoveCopySession: null,
            floorBeamMoveCopyHistoryBaseline: null,
            floorBeamMoveCopyCoordinateModalOpen: false,
            sceneCoordModalDesiredFocus: null,
            selectedEntityIds: [s.workingBeamId],
            dirty: true,
            lastError: null,
          },
          {
            historyBefore: st.floorBeamMoveCopyHistoryBaseline ?? st.currentProject,
          },
        ),
      );
    },

    setSceneCoordModalDesiredFocus: (focus) => set({ sceneCoordModalDesiredFocus: focus }),

    startWallMoveFromContextMenu: (wallId) => {
      const w = get().currentProject.walls.find((x) => x.id === wallId);
      if (!w) {
        set({ lastError: "Стена не найдена.", wallContextMenu: null });
        return;
      }
      const baseline = cloneProjectSnapshot(get().currentProject);
      set({
        wallMoveCopyHistoryBaseline: baseline,
        wallContextMenu: null,
        foundationPileContextMenu: null,
        floorBeamContextMenu: null,
        editor2dSecondaryContextMenu: null,
        foundationPileMoveCopySession: null,
        foundationPileMoveCopyHistoryBaseline: null,
        floorBeamMoveCopySession: null,
        floorBeamMoveCopyHistoryBaseline: null,
        entityCopySession: null,
        entityCopyParamsModal: null,
        entityCopyHistoryBaseline: null,
        entityCopyCoordinateModalOpen: false,
        wallPlacementSession: null,
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        wallJointSession: null,
        pendingWindowPlacement: null,
        pendingDoorPlacement: null,
        wallMoveCopyCoordinateModalOpen: false,
        floorBeamMoveCopyCoordinateModalOpen: false,
        sceneCoordModalDesiredFocus: null,
        wallMoveCopySession: {
          mode: "move",
          sourceWallId: wallId,
          workingWallId: wallId,
          phase: "pickAnchor",
          anchorWorldMm: null,
          previewTargetMm: null,
          lastSnapKind: null,
          angleSnapLockedDeg: null,
          shiftDirectionLockUnit: null,
          shiftLockReferenceMm: null,
        },
        selectedEntityIds: [wallId],
        lastError: null,
      });
    },

    startWallCopyFromContextMenu: (wallId) => {
      get().startEntityCopyMode({ kind: "wall", id: wallId });
    },

    cancelWallMoveCopy: () => {
      const s = get().wallMoveCopySession;
      if (!s) {
        return;
      }
      runWithoutProjectHistory(() => {
        let proj = get().currentProject;
        if (s.mode === "copy") {
          proj = deleteEntitiesFromProject(proj, new Set([s.workingWallId]));
        }
        set({
          currentProject: proj,
          wallMoveCopySession: null,
          wallMoveCopyHistoryBaseline: null,
          wallMoveCopyCoordinateModalOpen: false,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          selectedEntityIds: proj.walls.some((w) => w.id === s.sourceWallId) ? [s.sourceWallId] : [],
          dirty: true,
          lastError: null,
        });
      });
    },

    wallMoveCopyPreviewMove: (worldMm, viewport, opts) => {
      const s = get().wallMoveCopySession;
      if (!s || s.phase !== "pickTarget" || !s.anchorWorldMm) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const p0 = get().currentProject;
      const r = computeLinearSecondPointPreview({
        anchor: s.anchorWorldMm,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: get().wallMoveCopyCoordinateModalOpen || Boolean(opts?.altKey),
        altKey: Boolean(opts?.altKey),
      });
      set({
        wallMoveCopySession: {
          ...s,
          previewTargetMm: r.previewEnd,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    wallMoveCopyPrimaryClick: (worldMm, viewport, opts) => {
      if (get().wallMoveCopyCoordinateModalOpen) {
        return;
      }
      const s = get().wallMoveCopySession;
      if (!s) {
        return;
      }
      const wall = get().currentProject.walls.find((w) => w.id === s.workingWallId);
      if (!wall) {
        get().cancelWallMoveCopy();
        return;
      }
      if (s.phase === "pickAnchor") {
        const snap = resolvePlacementSnap(get, worldMm, viewport);
        const { point } = closestPointOnSegment(wall.start, wall.end, snap.point);
        set({
          wallMoveCopySession: {
            ...s,
            phase: "pickTarget",
            anchorWorldMm: point,
            previewTargetMm: point,
            lastSnapKind: snap.kind,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          lastError: null,
        });
        return;
      }
      if (!s.anchorWorldMm) {
        return;
      }
      const p0 = get().currentProject;
      const r = computeLinearSecondPointPreview({
        anchor: s.anchorWorldMm,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: Boolean(opts?.altKey),
        altKey: Boolean(opts?.altKey),
      });
      get().wallMoveCopyCommitTarget(r.previewEnd);
    },

    wallMoveCopyCommitTarget: (finalMm) => {
      const s = get().wallMoveCopySession;
      if (!s?.anchorWorldMm || s.phase !== "pickTarget") {
        set({ wallMoveCopyCoordinateModalOpen: false });
        return;
      }
      const dx = finalMm.x - s.anchorWorldMm.x;
      const dy = finalMm.y - s.anchorWorldMm.y;
      if (Math.hypot(dx, dy) < MIN_WALL_SEGMENT_LENGTH_MM) {
        set({ lastError: "Смещение слишком мало.", wallMoveCopyCoordinateModalOpen: false });
        return;
      }
      const proj = translateWallInProject(get().currentProject, s.workingWallId, dx, dy);
      set((st) =>
        buildProjectMutationState(
          st,
          touchProjectMeta(proj),
          {
            wallMoveCopySession: null,
            wallMoveCopyHistoryBaseline: null,
            wallMoveCopyCoordinateModalOpen: false,
            wallCoordinateModalOpen: false,
            floorBeamPlacementCoordinateModalOpen: false,
            selectedEntityIds: [s.workingWallId],
            dirty: true,
            lastError: null,
          },
          {
            historyBefore: st.wallMoveCopyHistoryBaseline ?? st.currentProject,
          },
        ),
      );
    },

    openWallMoveCopyCoordinateModal: (opts) => {
      const s = get().wallMoveCopySession;
      if (!s || s.phase !== "pickTarget" || !s.anchorWorldMm) {
        return;
      }
      set({
        wallMoveCopyCoordinateModalOpen: true,
        lastError: null,
        sceneCoordModalDesiredFocus: opts?.focus ?? "x",
      });
    },

    closeWallMoveCopyCoordinateModal: () => set({ wallMoveCopyCoordinateModalOpen: false }),

    applyWallMoveCopyCoordinateModal: (input) => {
      const s = get().wallMoveCopySession;
      if (!s?.anchorWorldMm || s.phase !== "pickTarget") {
        set({ wallMoveCopyCoordinateModalOpen: false });
        return;
      }
      if (!Number.isFinite(input.dxMm) || !Number.isFinite(input.dyMm)) {
        set({ lastError: "Введите числовые X и Y (мм)." });
        return;
      }
      /** Ручной ввод: целевая точка строго по ΔX/ΔY, без snap и без угловой привязки направления. */
      const finalPt = { x: s.anchorWorldMm.x + input.dxMm, y: s.anchorWorldMm.y + input.dyMm };
      get().wallMoveCopyCommitTarget(finalPt);
    },

    startEntityCopyMode: (target) => {
      const p0 = get().currentProject;
      const layer = narrowProjectToActiveLayer(p0);
      let ok = false;
      if (target.kind === "wall") {
        ok = layer.walls.some((w) => w.id === target.id);
      } else if (target.kind === "foundationPile") {
        ok = layer.foundationPiles.some((x) => x.id === target.id);
      } else if (target.kind === "planLine") {
        ok = layer.planLines.some((x) => x.id === target.id);
      } else if (target.kind === "foundationStrip") {
        ok = layer.foundationStrips.some((x) => x.id === target.id);
      } else if (target.kind === "slab") {
        ok = layer.slabs.some((x) => x.id === target.id);
      } else if (target.kind === "opening") {
        const o = p0.openings.find((x) => x.id === target.id);
        ok = Boolean(
          o?.wallId &&
            o.offsetFromStartMm != null &&
            (o.kind === "window" || o.kind === "door"),
        );
      } else if (target.kind === "floorBeam") {
        ok = layer.floorBeams.some((x) => x.id === target.id);
      }
      if (!ok) {
        set({
          lastError: "Объект не найден на активном слое или для него копирование недоступно.",
          wallContextMenu: null,
          foundationPileContextMenu: null,
          floorBeamContextMenu: null,
        });
        return;
      }
      const baseline = cloneProjectSnapshot(p0);
      set({
        entityCopyHistoryBaseline: baseline,
        entityCopySession: {
          target,
          phase: "pickAnchor",
          worldAnchorStart: null,
          openingAnchorAlongWallMm: null,
          previewTargetWorldMm: null,
          resolvedCursorWorldMm: null,
          snapMarkers: [],
          activeSnapVisual: "none",
          lastSnapKind: null,
          shiftDirectionLockUnit: null,
          angleSnapLockedDeg: null,
          shiftLockReferenceMm: null,
        },
        entityCopyParamsModal: null,
        wallContextMenu: null,
        foundationPileContextMenu: null,
        floorBeamContextMenu: null,
        editor2dSecondaryContextMenu: null,
        wallMoveCopySession: null,
        wallMoveCopyCoordinateModalOpen: false,
        wallMoveCopyHistoryBaseline: null,
        foundationPileMoveCopySession: null,
        foundationPileMoveCopyHistoryBaseline: null,
        floorBeamMoveCopySession: null,
        floorBeamMoveCopyHistoryBaseline: null,
        floorBeamMoveCopyCoordinateModalOpen: false,
        entityCopyCoordinateModalOpen: false,
        sceneCoordModalDesiredFocus: null,
        floorBeamPlacementSession: null,
        floorBeamPlacementHistoryBaseline: null,
        addFloorBeamModalOpen: false,
        floorBeamSplitModalOpen: false,
        floorBeamSplitSession: null,
        selectedEntityIds: [target.id],
        lastError: null,
      });
    },

    cancelEntityCopyFlow: () =>
      set({
        entityCopySession: null,
        entityCopyParamsModal: null,
        entityCopyHistoryBaseline: null,
        entityCopyCoordinateModalOpen: false,
        sceneCoordModalDesiredFocus: null,
        lastError: null,
      }),

    entityCopyPreviewMove: (worldMm, viewport, opts) => {
      const s = get().entityCopySession;
      if (!s || !viewport) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const p0 = get().currentProject;
      const snap = editor2dSnapSettings(p0);
      const layerIds = layerIdsForEntityCopy(p0);
      const structural = snap.snapToVertex || snap.snapToEdge;
      const altKey = Boolean(opts?.altKey);

      if (s.phase === "pickAnchor") {
        const tagged = collectEntityCopySnapPointsForSourceTarget(p0, layerIds, s.target);
        const r = resolveEntityCopySnap({
          refWorldMm: worldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
          altKey,
          structuralSnapEnabled: structural,
          taggedPoints: tagged,
        });
        const markers = buildEntityCopySnapMarkers(
          worldMm,
          viewport,
          tagged,
          altKey ? null : r.point,
          structural && !altKey,
        );
        set({
          entityCopySession: {
            ...s,
            resolvedCursorWorldMm: r.point,
            snapMarkers: markers,
            activeSnapVisual: r.visual === "none" ? "none" : r.visual,
            lastSnapKind: r.snapKind,
          },
        });
        return;
      }

      if (s.phase === "pickTarget" && s.worldAnchorStart) {
        const { refWorldMm, nextAngleSnapLockedDeg } = computeEntityCopyPickTargetRefWorldMm({
          anchorWorldMm: s.worldAnchorStart,
          rawWorldMm: worldMm,
          shiftDirectionLockUnit: s.shiftDirectionLockUnit,
          angleSnapLockedDeg: s.angleSnapLockedDeg,
          altKey,
        });
        const tagged = collectEntityCopySnapPointsForFullScene(p0, layerIds);
        const r = resolveEntityCopySnap({
          refWorldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
          altKey,
          structuralSnapEnabled: structural,
          taggedPoints: tagged,
        });
        const markers = buildEntityCopySnapMarkers(
          worldMm,
          viewport,
          tagged,
          altKey ? null : r.point,
          structural && !altKey,
        );
        set({
          entityCopySession: {
            ...s,
            resolvedCursorWorldMm: r.point,
            previewTargetWorldMm: r.point,
            snapMarkers: markers,
            activeSnapVisual: r.visual === "none" ? "none" : r.visual,
            lastSnapKind: r.snapKind,
            angleSnapLockedDeg: nextAngleSnapLockedDeg,
            shiftLockReferenceMm: null,
          },
        });
      }
    },

    entityCopyPrimaryClick: (worldMm, viewport, opts) => {
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      if (get().entityCopyCoordinateModalOpen) {
        return;
      }
      const s = get().entityCopySession;
      if (!s) {
        return;
      }
      if (!viewport) {
        return;
      }
      const p0 = get().currentProject;
      const layer = narrowProjectToActiveLayer(p0);
      const t = s.target;

      if (s.phase === "pickAnchor") {
        const snap = editor2dSnapSettings(p0);
        const layerIds = layerIdsForEntityCopy(p0);
        const structural = snap.snapToVertex || snap.snapToEdge;
        const tagged = collectEntityCopySnapPointsForSourceTarget(p0, layerIds, t);
        if (tagged.length === 0) {
          get().cancelEntityCopyFlow();
          return;
        }
        const r = resolveEntityCopySnap({
          refWorldMm: worldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
          altKey: Boolean(opts?.altKey),
          structuralSnapEnabled: structural,
          taggedPoints: tagged,
        });
        const anchorMm = r.point;

        let openingAlong: number | null = null;
        if (t.kind === "wall") {
          if (!layer.walls.some((x) => x.id === t.id)) {
            get().cancelEntityCopyFlow();
            return;
          }
        } else if (t.kind === "foundationPile") {
          if (!layer.foundationPiles.some((x) => x.id === t.id)) {
            get().cancelEntityCopyFlow();
            return;
          }
        } else if (t.kind === "planLine") {
          if (!layer.planLines.some((x) => x.id === t.id)) {
            get().cancelEntityCopyFlow();
            return;
          }
        } else if (t.kind === "foundationStrip") {
          if (!layer.foundationStrips.some((x) => x.id === t.id)) {
            get().cancelEntityCopyFlow();
            return;
          }
        } else if (t.kind === "slab") {
          if (!layer.slabs.some((x) => x.id === t.id)) {
            get().cancelEntityCopyFlow();
            return;
          }
        } else if (t.kind === "opening") {
          const o = p0.openings.find((x) => x.id === t.id);
          const wall = o?.wallId ? p0.walls.find((w) => w.id === o.wallId) : undefined;
          if (!o || !wall) {
            get().cancelEntityCopyFlow();
            return;
          }
          openingAlong = distanceAlongWallAxisFromStartUnclampedMm(wall, anchorMm);
        } else if (t.kind === "floorBeam") {
          if (!layer.floorBeams.some((x) => x.id === t.id)) {
            get().cancelEntityCopyFlow();
            return;
          }
        } else {
          return;
        }

        set({
          entityCopySession: {
            ...s,
            phase: "pickTarget",
            worldAnchorStart: anchorMm,
            openingAnchorAlongWallMm: openingAlong,
            previewTargetWorldMm: anchorMm,
            resolvedCursorWorldMm: anchorMm,
            snapMarkers: [],
            activeSnapVisual: "none",
            lastSnapKind: r.snapKind,
            shiftDirectionLockUnit: null,
            angleSnapLockedDeg: null,
            shiftLockReferenceMm: null,
          },
          lastError: null,
        });
        return;
      }

      if (s.phase === "pickTarget" && s.worldAnchorStart) {
        const snap = editor2dSnapSettings(p0);
        const layerIds = layerIdsForEntityCopy(p0);
        const structural = snap.snapToVertex || snap.snapToEdge;
        const altKey = Boolean(opts?.altKey);
        const { refWorldMm } = computeEntityCopyPickTargetRefWorldMm({
          anchorWorldMm: s.worldAnchorStart,
          rawWorldMm: worldMm,
          shiftDirectionLockUnit: s.shiftDirectionLockUnit,
          angleSnapLockedDeg: s.angleSnapLockedDeg,
          altKey,
        });
        const tagged = collectEntityCopySnapPointsForFullScene(p0, layerIds);
        const r = resolveEntityCopySnap({
          refWorldMm,
          viewport,
          project: p0,
          snapSettings: snap,
          gridStepMm: p0.settings.gridStepMm,
          altKey,
          structuralSnapEnabled: structural,
          taggedPoints: tagged,
        });
        const finalMm = r.point;
        const dx = finalMm.x - s.worldAnchorStart.x;
        const dy = finalMm.y - s.worldAnchorStart.y;
        if (Math.hypot(dx, dy) < MIN_WALL_SEGMENT_LENGTH_MM) {
          set({
            lastError: "Конечная точка совпадает с точкой привязки — укажите другую точку.",
          });
          return;
        }
        set({
          entityCopyParamsModal: {
            target: s.target,
            worldAnchorStart: s.worldAnchorStart,
            worldTargetEnd: finalMm,
            openingAnchorAlongWallMm: s.openingAnchorAlongWallMm,
          },
          entityCopySession: null,
          entityCopyCoordinateModalOpen: false,
          sceneCoordModalDesiredFocus: null,
          lastError: null,
        });
      }
    },

    openEntityCopyCoordinateModal: (opts) => {
      const sess = get().entityCopySession;
      if (!sess || sess.phase !== "pickTarget" || !sess.worldAnchorStart) {
        return;
      }
      set({
        entityCopyCoordinateModalOpen: true,
        sceneCoordModalDesiredFocus: opts?.focus ?? "x",
        lastError: null,
      });
    },

    closeEntityCopyCoordinateModal: () => set({ entityCopyCoordinateModalOpen: false }),

    applyEntityCopyCoordinateModal: (input) => {
      if (!Number.isFinite(input.dxMm) || !Number.isFinite(input.dyMm)) {
        set({ lastError: "Введите числовые X и Y (мм)." });
        return;
      }
      const sess = get().entityCopySession;
      if (!sess?.worldAnchorStart || sess.phase !== "pickTarget") {
        set({ entityCopyCoordinateModalOpen: false, sceneCoordModalDesiredFocus: null });
        return;
      }
      const finalMm = {
        x: sess.worldAnchorStart.x + input.dxMm,
        y: sess.worldAnchorStart.y + input.dyMm,
      };
      const dx = finalMm.x - sess.worldAnchorStart.x;
      const dy = finalMm.y - sess.worldAnchorStart.y;
      if (Math.hypot(dx, dy) < MIN_WALL_SEGMENT_LENGTH_MM) {
        set({
          lastError: "Смещение слишком мало.",
          entityCopyCoordinateModalOpen: false,
          sceneCoordModalDesiredFocus: null,
        });
        return;
      }
      set({
        entityCopyParamsModal: {
          target: sess.target,
          worldAnchorStart: sess.worldAnchorStart,
          worldTargetEnd: finalMm,
          openingAnchorAlongWallMm: sess.openingAnchorAlongWallMm,
        },
        entityCopySession: null,
        entityCopyCoordinateModalOpen: false,
        sceneCoordModalDesiredFocus: null,
        lastError: null,
      });
    },

    closeEntityCopyParamsModal: () => {
      get().cancelEntityCopyFlow();
    },

    applyEntityCopyParamsModal: (input) => {
      const modal = get().entityCopyParamsModal;
      if (!modal) {
        return;
      }
      const n = Math.trunc(input.count);
      if (!Number.isFinite(n) || n < 1) {
        set({ lastError: "Укажите целое количество копий не меньше 1." });
        return;
      }
      const targets = computeEntityCopyAnchorWorldTargets(
        input.strategy,
        modal.worldAnchorStart,
        modal.worldTargetEnd,
        n,
      );
      if (targets.length === 0) {
        set({
          lastError: "Не удалось разместить копии: отрезок между точками слишком короткий.",
        });
        return;
      }
      const r = applyEntityCopyWithAnchorTargets(
        get().currentProject,
        modal.target,
        modal.worldAnchorStart,
        targets,
        modal.openingAnchorAlongWallMm,
      );
      if ("error" in r) {
        set({ lastError: r.error });
        return;
      }
      set((st) =>
        buildProjectMutationState(
          st,
          touchProjectMeta(r.project),
          {
            entityCopyParamsModal: null,
            entityCopySession: null,
            entityCopyHistoryBaseline: null,
            entityCopyCoordinateModalOpen: false,
            selectedEntityIds: [...r.newEntityIds],
            dirty: true,
            lastError: null,
          },
          {
            historyBefore: st.entityCopyHistoryBaseline ?? st.currentProject,
          },
        ),
      );
    },

    toggleTextureApply3dTool: () => {
      const s = get();
      if (s.activeTab !== "3d") {
        set({
          lastError: 'Инструмент «Применить текстуру» доступен только в 3D-виде.',
        });
        return;
      }
      const next = !s.textureApply3dToolActive;
      set({
        textureApply3dToolActive: next,
        textureApply3dParamsModal: next ? s.textureApply3dParamsModal : null,
        editor3dContextMenu: next ? null : s.editor3dContextMenu,
        lastError: null,
      });
    },

    cancelTextureApply3dTool: () =>
      set({
        textureApply3dToolActive: false,
        textureApply3dParamsModal: null,
        editor3dContextMenu: null,
        lastError: null,
      }),

    openTextureApply3dParamsModal: (pick) =>
      set({ textureApply3dParamsModal: { pick }, lastError: null }),

    closeTextureApply3dParamsModal: () => set({ textureApply3dParamsModal: null, lastError: null }),

    applyTextureApply3dParamsModal: (input) => {
      const modal = get().textureApply3dParamsModal;
      if (!modal) {
        return;
      }
      const meshKey = meshKeyFromEditorPick(modal.pick);
      const layerId = pickLayerIdForSurfaceTexture(get().currentProject, modal.pick) ?? "";
      if (input.mode === "layer" && !layerId) {
        set({ lastError: "Не удалось определить слой объекта." });
        return;
      }
      if (input.mode === "object" && !layerId) {
        set({ lastError: "Не удалось определить слой для выбранного объекта." });
        return;
      }
      const scalePercent = Math.min(500, Math.max(5, Number(input.scalePercent)));
      if (!Number.isFinite(scalePercent)) {
        set({ lastError: "Некорректный масштаб текстуры." });
        return;
      }
      let binding: { readonly textureId: string; readonly scalePercent: number } | null = null;
      if (!input.reset) {
        const entry = getTextureCatalogEntry(input.textureId);
        if (!entry) {
          set({ lastError: "Выберите текстуру из каталога." });
          return;
        }
        binding = { textureId: input.textureId, scalePercent };
      }
      const next = applySurfaceTextureToProject(get().currentProject, {
        mode: input.mode,
        reset: input.reset,
        binding,
        meshKey,
        layerId,
      });
      set((st) =>
        buildProjectMutationState(st, next, {
          textureApply3dParamsModal: null,
          lastError: null,
          dirty: true,
        }),
      );
    },

    ruler2dPreviewMove: (worldMm, viewport, opts) => {
      if (get().activeTool !== "ruler") {
        return;
      }
      const rs = get().ruler2dSession;
      if (!rs || rs.phase !== "stretching" || !rs.firstMm) {
        return;
      }
      const p0 = get().currentProject;
      const r = computeLinearSecondPointPreview({
        anchor: rs.firstMm,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: rs.shiftDirectionLockUnit,
        angleSnapLockedDeg: rs.angleSnapLockedDeg,
        skipAngleSnap: Boolean(opts?.altKey),
        altKey: Boolean(opts?.altKey),
      });
      set({
        ruler2dSession: {
          ...rs,
          previewEndMm: r.previewEnd,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    ruler2dPrimaryClick: (worldMm, viewport, opts) => {
      if (get().activeTool !== "ruler") {
        return;
      }
      const rs = get().ruler2dSession;
      if (!rs) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      const pt = snap.point;

      if (rs.phase === "pickFirst") {
        set({
          ruler2dSession: {
            phase: "stretching",
            firstMm: pt,
            secondMm: null,
            previewEndMm: pt,
            lastSnapKind: snap.kind,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          lastError: null,
        });
        return;
      }

      if (rs.phase === "stretching" && rs.firstMm) {
        const p0 = get().currentProject;
        const r = computeLinearSecondPointPreview({
          anchor: rs.firstMm,
          rawWorldMm: worldMm,
          viewport,
          project: p0,
          snapSettings: editor2dSnapSettings(p0),
          gridStepMm: p0.settings.gridStepMm,
          shiftDirectionLockUnit: rs.shiftDirectionLockUnit,
          angleSnapLockedDeg: rs.angleSnapLockedDeg,
          skipAngleSnap: Boolean(opts?.altKey),
          altKey: Boolean(opts?.altKey),
        });
        set({
          ruler2dSession: {
            phase: "done",
            firstMm: rs.firstMm,
            secondMm: r.previewEnd,
            previewEndMm: r.previewEnd,
            lastSnapKind: r.lastSnapKind,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          lastError: null,
        });
        return;
      }

      if (rs.phase === "done") {
        set({
          ruler2dSession: {
            phase: "stretching",
            firstMm: pt,
            secondMm: null,
            previewEndMm: pt,
            lastSnapKind: snap.kind,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          lastError: null,
        });
      }
    },

    ruler2dCancel: () => {
      if (get().activeTool !== "ruler") {
        return;
      }
      const rs = get().ruler2dSession;
      if (!rs) {
        set({ ruler2dSession: initialRuler2dSession(), lastError: null });
        return;
      }
      if (rs.phase === "pickFirst") {
        set({ ruler2dSession: initialRuler2dSession(), lastError: null });
        return;
      }
      set({ ruler2dSession: initialRuler2dSession(), lastError: null });
    },

    line2dPreviewMove: (worldMm, viewport, opts) => {
      if (get().activeTool !== "line") {
        return;
      }
      const ls = get().line2dSession;
      if (!ls || ls.phase !== "stretching" || !ls.firstMm) {
        return;
      }
      const p0 = get().currentProject;
      const r = computeLinearSecondPointPreview({
        anchor: ls.firstMm,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: ls.shiftDirectionLockUnit,
        angleSnapLockedDeg: ls.angleSnapLockedDeg,
        skipAngleSnap: Boolean(opts?.altKey),
        altKey: Boolean(opts?.altKey),
      });
      set({
        line2dSession: {
          ...ls,
          previewEndMm: r.previewEnd,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    line2dPrimaryClick: (worldMm, viewport, opts) => {
      if (get().activeTool !== "line") {
        return;
      }
      const ls = get().line2dSession;
      if (!ls) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      const pt = snap.point;

      if (ls.phase === "pickFirst") {
        set({
          line2dSession: {
            phase: "stretching",
            firstMm: pt,
            previewEndMm: pt,
            lastSnapKind: snap.kind,
            angleSnapLockedDeg: null,
            shiftDirectionLockUnit: null,
            shiftLockReferenceMm: null,
          },
          lastError: null,
        });
        return;
      }

      if (ls.phase === "stretching" && ls.firstMm) {
        const p0 = get().currentProject;
        const r = computeLinearSecondPointPreview({
          anchor: ls.firstMm,
          rawWorldMm: worldMm,
          viewport,
          project: p0,
          snapSettings: editor2dSnapSettings(p0),
          gridStepMm: p0.settings.gridStepMm,
          shiftDirectionLockUnit: ls.shiftDirectionLockUnit,
          angleSnapLockedDeg: ls.angleSnapLockedDeg,
          skipAngleSnap: Boolean(opts?.altKey),
          altKey: Boolean(opts?.altKey),
        });
        const end = r.previewEnd;
        const dx = end.x - ls.firstMm.x;
        const dy = end.y - ls.firstMm.y;
        if (Math.hypot(dx, dy) < MIN_PLAN_LINE_LENGTH_MM) {
          set({ lastError: "Сегмент слишком короткий." });
          return;
        }
        const id = newEntityId();
        const layerId = get().getActiveLayerIdForNewEntities();
        const line: PlanLine = { id, layerId, start: { x: ls.firstMm.x, y: ls.firstMm.y }, end: { x: end.x, y: end.y } };
        const nextProject = touchProjectMeta({
          ...p0,
          planLines: [...p0.planLines, line],
        });
        set((s) =>
          buildProjectMutationState(s, nextProject, {
            line2dSession: initialLine2dSession(),
            selectedEntityIds: [],
            dirty: true,
            lastError: null,
          }),
        );
      }
    },

    line2dCancel: () => {
      if (get().activeTool !== "line") {
        return;
      }
      const ls = get().line2dSession;
      if (!ls) {
        set({ line2dSession: initialLine2dSession(), lastError: null });
        return;
      }
      if (ls.phase === "pickFirst") {
        set({ line2dSession: initialLine2dSession(), lastError: null });
        return;
      }
      set({ line2dSession: initialLine2dSession(), lastError: null });
    },

    startLengthChange2dSession: (target, movingEnd, worldMm, viewport) => {
      if (get().activeTool !== "changeLength") {
        return;
      }
      const cp = get().currentProject;
      const layerView = narrowProjectToActiveLayer(cp);
      let fixed: Point2D;
      let ux: number;
      let uy: number;
      let initialLengthMm: number;
      if (target.kind === "wall") {
        const wall = layerView.walls.find((w) => w.id === target.wallId);
        if (!wall) {
          return;
        }
        fixed = fixedEndpointForLengthChange(wall, movingEnd);
        const ax = axisFromFixedTowardMoving(wall, movingEnd);
        ux = ax.ux;
        uy = ax.uy;
        initialLengthMm = wallLengthMm(wall);
      } else {
        const beam = layerView.floorBeams.find((b) => b.id === target.beamId);
        if (!beam) {
          return;
        }
        fixed = fixedRefEndpointForFloorBeamLengthChange(beam, movingEnd);
        const ax = axisFromFixedTowardMovingFloorBeam(beam, movingEnd);
        ux = ax.ux;
        uy = ax.uy;
        initialLengthMm = floorBeamRefLengthMm(beam);
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      const L = lengthFromSnappedPointForWallLengthEdit(
        fixed,
        ux,
        uy,
        snap.point,
        MIN_WALL_SEGMENT_LENGTH_MM,
      );
      const pm = movingEndpointForLengthMm(fixed, ux, uy, L);
      const baseline = cloneProjectSnapshot(cp);
      set({
        lengthChangeHistoryBaseline: baseline,
        lengthChange2dSession: {
          target,
          movingEnd,
          fixedEndMm: { x: fixed.x, y: fixed.y },
          axisUx: ux,
          axisUy: uy,
          initialLengthMm,
          previewMovingMm: { x: pm.x, y: pm.y },
          lastSnapKind: snap.kind,
          shiftDirectionLockUnit: null,
          shiftLockReferenceMm: null,
        },
        lastError: null,
      });
    },

    lengthChange2dPreviewMove: (worldMm, viewport, opts) => {
      if (get().activeTool !== "changeLength") {
        return;
      }
      const sess = get().lengthChange2dSession;
      if (!sess) {
        return;
      }
      if (isSceneCoordinateModalBlocking(get())) {
        return;
      }
      const p0 = get().currentProject;
      const r = computeLengthChangePreviewAlongAxis({
        fixedEndMm: sess.fixedEndMm,
        axisUx: sess.axisUx,
        axisUy: sess.axisUy,
        rawWorldMm: worldMm,
        viewport,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: sess.shiftDirectionLockUnit,
        minLenMm: MIN_WALL_SEGMENT_LENGTH_MM,
        altKey: Boolean(opts?.altKey),
      });
      set({
        lengthChange2dSession: {
          ...sess,
          previewMovingMm: r.previewMovingMm,
          lastSnapKind: r.lastSnapKind,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
        lastError: null,
      });
    },

    lengthChange2dCommit: () => {
      if (get().lengthChangeCoordinateModalOpen) {
        return;
      }
      if (get().activeTool !== "changeLength") {
        return;
      }
      const sess = get().lengthChange2dSession;
      if (!sess) {
        return;
      }
      const dx = sess.previewMovingMm.x - sess.fixedEndMm.x;
      const dy = sess.previewMovingMm.y - sess.fixedEndMm.y;
      const Lnew = dx * sess.axisUx + dy * sess.axisUy;
      const r = applyLinearLengthChangeInProject(get().currentProject, sess.target, sess.movingEnd, Lnew);
      if ("error" in r) {
        set({ lastError: r.error });
        return;
      }
      set((s) =>
        buildProjectMutationState(
          s,
          r.project,
          {
            dirty: true,
            lengthChange2dSession: null,
            lengthChangeHistoryBaseline: null,
            lengthChangeCoordinateModalOpen: false,
            lastError: null,
          },
          { historyBefore: s.lengthChangeHistoryBaseline ?? s.currentProject },
        ),
      );
    },

    lengthChange2dEsc: () => {
      if (get().lengthChangeCoordinateModalOpen) {
        set({ lengthChangeCoordinateModalOpen: false });
        return;
      }
      if (get().lengthChange2dSession) {
        set({ lengthChange2dSession: null, lengthChangeHistoryBaseline: null, lastError: null });
        return;
      }
      if (get().activeTool === "changeLength") {
        set({ activeTool: "select", lastError: null });
      }
    },

    openLengthChangeCoordinateModal: () => {
      if (get().activeTool !== "changeLength" || !get().lengthChange2dSession) {
        return;
      }
      set({ lengthChangeCoordinateModalOpen: true, lastError: null });
    },

    closeLengthChangeCoordinateModal: () => set({ lengthChangeCoordinateModalOpen: false }),

    applyLengthChangeCoordinateModal: (input) => {
      if (get().activeTool !== "changeLength") {
        return;
      }
      const sess = get().lengthChange2dSession;
      if (!sess) {
        return;
      }
      const d = input.deltaMm;
      if (!Number.isFinite(d)) {
        set({ lastError: "Введите числовое значение Δ (мм)." });
        return;
      }
      const Lnew = sess.initialLengthMm + d;
      if (Lnew < MIN_WALL_SEGMENT_LENGTH_MM) {
        set({
          lastError: `Минимальная длина сегмента ${MIN_WALL_SEGMENT_LENGTH_MM} мм.`,
          lengthChangeCoordinateModalOpen: false,
        });
        return;
      }
      const r = applyLinearLengthChangeInProject(get().currentProject, sess.target, sess.movingEnd, Lnew);
      if ("error" in r) {
        set({ lastError: r.error, lengthChangeCoordinateModalOpen: false });
        return;
      }
      set((s) =>
        buildProjectMutationState(
          s,
          r.project,
          {
            dirty: true,
            lengthChange2dSession: null,
            lengthChangeHistoryBaseline: null,
            lengthChangeCoordinateModalOpen: false,
            lastError: null,
          },
          { historyBefore: s.lengthChangeHistoryBaseline ?? s.currentProject },
        ),
      );
    },

    openWallCoordinateModal: (opts) => {
      const s = get().wallPlacementSession;
      if (!s || s.phase !== "waitingSecondPoint" || !s.firstPointMm) {
        return;
      }
      set({
        wallCoordinateModalOpen: true,
        lastError: null,
        sceneCoordModalDesiredFocus: opts?.focus ?? "x",
      });
    },

    closeWallCoordinateModal: () => set({ wallCoordinateModalOpen: false }),

    applyWallCoordinateModal: (input) => {
      const session = get().wallPlacementSession;
      if (!session?.firstPointMm) {
        set({ wallCoordinateModalOpen: false });
        return;
      }
      if (!Number.isFinite(input.dxMm) || !Number.isFinite(input.dyMm)) {
        set({ lastError: "Введите числовые X и Y (мм)." });
        return;
      }
      const first = session.firstPointMm;
      /** Ручной ввод: вторая точка строго first + (dx,dy), без snap и без угловой привязки. */
      const exactSecond = { x: first.x + input.dxMm, y: first.y + input.dyMm };
      get().wallPlacementCompleteSecondPoint(exactSecond);
    },

    openFloorBeamPlacementCoordinateModal: (opts) => {
      const s = get().floorBeamPlacementSession;
      if (!s || s.phase !== "waitingSecondPoint" || !s.firstPointMm) {
        return;
      }
      set({
        floorBeamPlacementCoordinateModalOpen: true,
        lastError: null,
        sceneCoordModalDesiredFocus: opts?.focus ?? "x",
      });
    },

    closeFloorBeamPlacementCoordinateModal: () => set({ floorBeamPlacementCoordinateModalOpen: false }),

    applyFloorBeamPlacementCoordinateModal: (input) => {
      const session = get().floorBeamPlacementSession;
      if (!session?.firstPointMm) {
        set({ floorBeamPlacementCoordinateModalOpen: false });
        return;
      }
      if (session.phase !== "waitingSecondPoint") {
        set({ floorBeamPlacementCoordinateModalOpen: false });
        return;
      }
      if (!Number.isFinite(input.dxMm) || !Number.isFinite(input.dyMm)) {
        set({ lastError: "Введите числовые X и Y (мм)." });
        return;
      }
      const first = session.firstPointMm;
      const rawWorldMm = { x: first.x + input.dxMm, y: first.y + input.dyMm };
      const patch = mergeFloorBeamPlacementPreviewFromRawWorldMm({
        session,
        project: get().currentProject,
        canvasPx: get().viewportCanvas2dPx,
        rawWorldMm,
        altKey: false,
        editor2dSnapSettings: editor2dSnapSettings,
      });
      const secondMm = patch.previewEndMm;
      if (secondMm == null) {
        set({ lastError: "Не удалось вычислить вторую точку." });
        return;
      }
      /** Как второй клик мышью: та же цепочка snap/preview, затем доменный commit в проект. */
      get().floorBeamPlacementCompleteSecondPoint(secondMm);
    },

    floorBeamPlacementCommitNumericField: (input) => {
      const session = get().floorBeamPlacementSession;
      if (!session?.firstPointMm || !session.previewEndMm) {
        return false;
      }
      if (!Number.isFinite(input.valueMm)) {
        return false;
      }
      const rawWorldMm = floorBeamPlacementSecondPointFromNumericInput(
        session,
        input.field,
        input.valueMm,
      );
      if (!rawWorldMm) {
        return false;
      }
      const patch = mergeFloorBeamPlacementPreviewFromRawWorldMm({
        session,
        project: get().currentProject,
        canvasPx: get().viewportCanvas2dPx,
        rawWorldMm,
        altKey: false,
        editor2dSnapSettings: editor2dSnapSettings,
      });
      const secondMm = patch.previewEndMm;
      if (secondMm == null) {
        return false;
      }
      return get().floorBeamPlacementCompleteSecondPoint(secondMm);
    },

    wallMoveCopyApplyNumericPreviewField: (input) => {
      const s = get().wallMoveCopySession;
      if (!s || s.phase !== "pickTarget" || !s.anchorWorldMm || !s.previewTargetMm) {
        return;
      }
      if (!Number.isFinite(input.valueMm)) {
        return;
      }
      const rawWorldMm = linearSecondPointFromNumericInput(
        {
          anchorMm: s.anchorWorldMm,
          previewEndMm: s.previewTargetMm,
          shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        },
        input.field,
        input.valueMm,
      );
      if (!rawWorldMm) {
        return;
      }
      const p0 = get().currentProject;
      const vp = get().viewportCanvas2dPx;
      if (!vp) {
        return;
      }
      const vp2 = p0.viewState.viewport2d;
      const t = buildViewportTransform(vp.width, vp.height, vp2.panXMm, vp2.panYMm, vp2.zoomPixelsPerMm);
      const r = computeLinearSecondPointPreview({
        anchor: s.anchorWorldMm,
        rawWorldMm,
        viewport: t,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: get().wallMoveCopyCoordinateModalOpen,
        altKey: false,
      });
      set({
        wallMoveCopySession: {
          ...s,
          previewTargetMm: r.previewEnd,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    floorBeamMoveCopyApplyNumericPreviewField: (input) => {
      const s = get().floorBeamMoveCopySession;
      if (!s || s.phase !== "pickTarget" || !s.baseAnchorWorldMm || !s.previewTargetMm) {
        return;
      }
      if (!Number.isFinite(input.valueMm)) {
        return;
      }
      const rawWorldMm = linearSecondPointFromNumericInput(
        {
          anchorMm: s.baseAnchorWorldMm,
          previewEndMm: s.previewTargetMm,
          shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        },
        input.field,
        input.valueMm,
      );
      if (!rawWorldMm) {
        return;
      }
      const p0 = get().currentProject;
      const vp = get().viewportCanvas2dPx;
      if (!vp) {
        return;
      }
      const vp2 = p0.viewState.viewport2d;
      const t = buildViewportTransform(vp.width, vp.height, vp2.panXMm, vp2.panYMm, vp2.zoomPixelsPerMm);
      const r = computeLinearSecondPointPreview({
        anchor: s.baseAnchorWorldMm,
        rawWorldMm,
        viewport: t,
        project: p0,
        snapSettings: editor2dSnapSettings(p0),
        gridStepMm: p0.settings.gridStepMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        skipAngleSnap: get().floorBeamMoveCopyCoordinateModalOpen,
        altKey: false,
      });
      const anchor = s.baseAnchorWorldMm;
      const dragDeltaMm = { x: r.previewEnd.x - anchor.x, y: r.previewEnd.y - anchor.y };
      set({
        floorBeamMoveCopySession: {
          ...s,
          previewTargetMm: r.previewEnd,
          dragDeltaMm,
          lastSnapKind: r.lastSnapKind,
          angleSnapLockedDeg: r.angleSnapLockedDeg,
          shiftLockReferenceMm: r.shiftLockReferenceMm,
        },
      });
    },

    entityCopyApplyNumericPreviewField: (input) => {
      const s = get().entityCopySession;
      const vp = get().viewportCanvas2dPx;
      if (!s || s.phase !== "pickTarget" || !s.worldAnchorStart || !s.previewTargetWorldMm || !vp) {
        return;
      }
      if (!Number.isFinite(input.valueMm)) {
        return;
      }
      const rawWorldMm = linearSecondPointFromNumericInput(
        {
          anchorMm: s.worldAnchorStart,
          previewEndMm: s.previewTargetWorldMm,
          shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        },
        input.field,
        input.valueMm,
      );
      if (!rawWorldMm) {
        return;
      }
      const p0 = get().currentProject;
      const snap = editor2dSnapSettings(p0);
      const layerIds = layerIdsForEntityCopy(p0);
      const structural = snap.snapToVertex || snap.snapToEdge;
      const altKey = false;
      const vp2 = p0.viewState.viewport2d;
      const t = buildViewportTransform(vp.width, vp.height, vp2.panXMm, vp2.panYMm, vp2.zoomPixelsPerMm);
      const { refWorldMm, nextAngleSnapLockedDeg } = computeEntityCopyPickTargetRefWorldMm({
        anchorWorldMm: s.worldAnchorStart,
        rawWorldMm,
        shiftDirectionLockUnit: s.shiftDirectionLockUnit,
        angleSnapLockedDeg: s.angleSnapLockedDeg,
        altKey,
      });
      const tagged = collectEntityCopySnapPointsForFullScene(p0, layerIds);
      const r = resolveEntityCopySnap({
        refWorldMm,
        viewport: t,
        project: p0,
        snapSettings: snap,
        gridStepMm: p0.settings.gridStepMm,
        altKey,
        structuralSnapEnabled: structural,
        taggedPoints: tagged,
      });
      const markers = buildEntityCopySnapMarkers(
        rawWorldMm,
        t,
        tagged,
        altKey ? null : r.point,
        structural && !altKey,
      );
      set({
        entityCopySession: {
          ...s,
          resolvedCursorWorldMm: r.point,
          previewTargetWorldMm: r.point,
          snapMarkers: markers,
          activeSnapVisual: r.visual === "none" ? "none" : r.visual,
          lastSnapKind: r.snapKind,
          angleSnapLockedDeg: nextAngleSnapLockedDeg,
          shiftLockReferenceMm: null,
        },
      });
    },

    openWallCalculationModal: () => {
      const { selectedEntityIds, currentProject } = get();
      const sel = new Set(selectedEntityIds);
      if (!currentProject.walls.some((w) => sel.has(w.id))) {
        return;
      }
      set({ wallCalculationModalOpen: true, lastError: null });
    },

    closeWallCalculationModal: () => set({ wallCalculationModalOpen: false }),

    applyWallCalculationModal: (input) => {
      const { selectedEntityIds, currentProject } = get();
      const sel = new Set(selectedEntityIds);
      const wallIds = currentProject.walls.filter((w) => sel.has(w.id)).map((w) => w.id);
      if (wallIds.length === 0) {
        set({ wallCalculationModalOpen: false, lastError: "Выберите хотя бы одну стену." });
        return;
      }
      const target = new Set(wallIds);
      let proj = currentProject;
      if (input.clearWallFirst) {
        proj = {
          ...proj,
          wallCalculations: proj.wallCalculations.filter((c) => !target.has(c.wallId)),
        };
      }
      const kept = proj.wallCalculations.filter((c) => !target.has(c.wallId));
      const newCalcs: WallCalculationResult[] = [];
      const errors: string[] = [];
      for (const wid of wallIds) {
        const wall = proj.walls.find((w) => w.id === wid);
        if (!wall) {
          continue;
        }
        if (!wall.profileId) {
          errors.push("Есть стена без профиля — укажите профиль или исключите её из выделения.");
          continue;
        }
        const prof = getProfileById(proj, wall.profileId);
        if (!prof) {
          errors.push("Профиль стены не найден в проекте.");
          continue;
        }
        try {
          newCalcs.push(
            buildWallCalculationForWall(wall, prof, {
              openings: proj.openings,
              wallJoints: proj.wallJoints,
              skipAutoOpeningFramingForOpeningIds: new Set(proj.openingFramingPieces.map((p) => p.openingId)),
              options: {
                ...DEFAULT_WALL_CALC_STAGE3_OPTIONS,
                ...input.stage3Options,
              },
            }),
          );
        } catch (e) {
          const msg = e instanceof SipWallLayoutError ? e.message : "Ошибка расчёта стены.";
          errors.push(msg);
        }
      }
      if (newCalcs.length === 0) {
        set({ lastError: errors.length ? errors.join(" ") : "Не удалось выполнить расчёт." });
        return;
      }
      const nextProj = touchProjectMeta({
        ...proj,
        wallCalculations: [...kept, ...newCalcs],
      });
      set((s) =>
        buildProjectMutationState(s, nextProj, {
          wallCalculationModalOpen: false,
          dirty: true,
          lastError: errors.length ? errors.join(" ") : null,
        }),
      );
    },

    openRoofCalculationModal: () => {
      const { selectedEntityIds, currentProject } = get();
      const sel = new Set(selectedEntityIds);
      if (!currentProject.roofPlanes.some((r) => sel.has(r.id))) {
        return;
      }
      set({ roofCalculationModalOpen: true, lastError: null });
    },

    closeRoofCalculationModal: () => set({ roofCalculationModalOpen: false }),

    applyRoofCalculationModal: () => {
      const { selectedEntityIds, currentProject } = get();
      const sel = new Set(selectedEntityIds);
      const roofIds = currentProject.roofPlanes.filter((r) => sel.has(r.id)).map((r) => r.id);
      if (roofIds.length === 0) {
        set({ roofCalculationModalOpen: false, lastError: "Выберите скаты для расчёта." });
        return;
      }
      const r = applyRoofCalculationToProject({ project: currentProject, roofPlaneIds: roofIds });
      if (!r.ok) {
        set({ lastError: r.errors.join(" ") });
        return;
      }
      set((s) =>
        buildProjectMutationState(s, r.project, {
          roofCalculationModalOpen: false,
          dirty: true,
          lastError: null,
        }),
      );
    },

    setSnapToVertex: (value) =>
      set((s) =>
        buildProjectMutationState(
          s,
          touchProjectMeta({
            ...s.currentProject,
            settings: {
              ...s.currentProject.settings,
              editor2d: { ...s.currentProject.settings.editor2d, snapToVertex: value },
            },
          }),
          { dirty: true },
        ),
      ),

    setSnapToEdge: (value) =>
      set((s) =>
        buildProjectMutationState(
          s,
          touchProjectMeta({
            ...s.currentProject,
            settings: {
              ...s.currentProject.settings,
              editor2d: { ...s.currentProject.settings.editor2d, snapToEdge: value },
            },
          }),
          { dirty: true },
        ),
      ),

    setSnapToGrid: (value) =>
      set((s) =>
        buildProjectMutationState(
          s,
          touchProjectMeta({
            ...s.currentProject,
            settings: {
              ...s.currentProject.settings,
              editor2d: { ...s.currentProject.settings.editor2d, snapToGrid: value },
            },
          }),
          { dirty: true },
        ),
      ),

    setShow2dGrid: (value) =>
      set((s) =>
        buildProjectMutationState(
          s,
          touchProjectMeta({
            ...s.currentProject,
            settings: { ...s.currentProject.settings, show2dGrid: value },
          }),
          { dirty: true },
        ),
      ),

    setWallShapeMode: (mode) =>
      set((s) =>
        buildProjectMutationState(
          s,
          touchProjectMeta({
            ...s.currentProject,
            settings: {
              ...s.currentProject.settings,
              editor2d: { ...s.currentProject.settings.editor2d, wallShapeMode: mode },
            },
          }),
          { dirty: true },
        ),
      ),

    setSlabBuildMode: (mode) =>
      set((s) => {
        const nextProject = touchProjectMeta({
          ...s.currentProject,
          settings: {
            ...s.currentProject.settings,
            editor2d: { ...s.currentProject.settings.editor2d, slabBuildMode: mode },
          },
        });
        const sess = s.slabPlacementSession;
        if (sess != null) {
          return buildProjectMutationState(s, nextProject, {
            dirty: true,
            lastError: null,
            slabPlacementSession: {
              ...sess,
              buildMode: mode,
              phase: "waitingFirstPoint",
              firstPointMm: null,
              polylineVerticesMm: [],
              previewEndMm: null,
              lastSnapKind: null,
            },
          });
        }
        return buildProjectMutationState(s, nextProject, { dirty: true, lastError: null });
      }),

    setLinearPlacementMode: (mode) =>
      set((s) =>
        buildProjectMutationState(
          s,
          touchProjectMeta({
            ...s.currentProject,
            settings: {
              ...s.currentProject.settings,
              editor2d: { ...s.currentProject.settings.editor2d, linearPlacementMode: mode },
            },
          }),
          { dirty: true },
        ),
      ),

    bootstrapDemo: () => {
      void (async () => {
        const p = createDemoProject();
        const db = tryGetFirestoreDb();
        if (get().firestoreEnabled && db) {
          try {
            await createProjectInDb(db, p);
            setLastOpenedProjectId(p.meta.id);
          } catch (e) {
            console.error(e);
            set({
              lastError: e instanceof Error ? `Firestore: ${e.message}` : "Не удалось сохранить демо в Firestore",
              persistenceStatus: "error",
            });
            return;
          }
        }
        set({
          currentProject: p,
          viewport2d: p.viewState.viewport2d,
          viewport3d: p.viewState.viewport3d,
          activeTab: p.viewState.activeTab,
          dirty: false,
          lastError: null,
          selectedEntityIds: [],
          history: initialProjectHistory,
          wallPlacementHistoryBaseline: null,
          pendingOpeningPlacementHistoryBaseline: null,
          wallMoveCopyHistoryBaseline: null,
          lengthChangeHistoryBaseline: null,
          layerManagerOpen: false,
          layerParamsModalOpen: false,
          profilesModalOpen: false,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          addDoorModalOpen: false,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          lastWindowPlacementParams: null,
          lastDoorPlacementParams: null,
          windowEditModal: null,
          doorEditModal: null,
          wallJointParamsModalOpen: false,
          wallJointSession: null,
          wallPlacementSession: null,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          addFoundationStripModalOpen: false,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          addFoundationPileModalOpen: false,
          foundationPilePlacementSession: null,
          foundationPilePlacementHistoryBaseline: null,
          addRoofPlaneModalOpen: false,
          roofPlanePlacementSession: null,
          roofPlanePlacementHistoryBaseline: null,
          roofContourJoinSession: null,
          roofContourJoinHistoryBaseline: null,
          textureApply3dToolActive: false,
          textureApply3dParamsModal: null,
          editor3dContextMenu: null,
          editor3dContextDeleteEpoch: 0,
        });
      })();
    },

    createNewProject: () => {
      void (async () => {
        const p = createEmptyProject();
        const db = tryGetFirestoreDb();
        if (get().firestoreEnabled && db) {
          try {
            await createProjectInDb(db, p);
            setLastOpenedProjectId(p.meta.id);
          } catch (e) {
            console.error(e);
            set({
              lastError: e instanceof Error ? `Firestore: ${e.message}` : "Не удалось создать проект в Firestore",
              persistenceStatus: "error",
            });
            return;
          }
        }
        set({
          currentProject: p,
          viewport2d: p.viewState.viewport2d,
          viewport3d: p.viewState.viewport3d,
          activeTab: p.viewState.activeTab,
          dirty: false,
          lastError: null,
          selectedEntityIds: [],
          history: initialProjectHistory,
          wallPlacementHistoryBaseline: null,
          pendingOpeningPlacementHistoryBaseline: null,
          wallMoveCopyHistoryBaseline: null,
          foundationPileMoveCopyHistoryBaseline: null,
          lengthChangeHistoryBaseline: null,
          layerManagerOpen: false,
          layerParamsModalOpen: false,
          profilesModalOpen: false,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          addDoorModalOpen: false,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          lastWindowPlacementParams: null,
          lastDoorPlacementParams: null,
          windowEditModal: null,
          doorEditModal: null,
          wallJointParamsModalOpen: false,
          wallJointSession: null,
          wallPlacementSession: null,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          wallContextMenu: null,
          foundationPileContextMenu: null,
          editor2dSecondaryContextMenu: null,
          wallMoveCopySession: null,
          foundationPileMoveCopySession: null,
          entityCopySession: null,
          entityCopyParamsModal: null,
          entityCopyHistoryBaseline: null,
          entityCopyCoordinateModalOpen: false,
          addFoundationStripModalOpen: false,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          addFoundationPileModalOpen: false,
          foundationPilePlacementSession: null,
          foundationPilePlacementHistoryBaseline: null,
          addRoofPlaneModalOpen: false,
          roofPlanePlacementSession: null,
          roofPlanePlacementHistoryBaseline: null,
          roofContourJoinSession: null,
          roofContourJoinHistoryBaseline: null,
          textureApply3dToolActive: false,
          textureApply3dParamsModal: null,
          editor3dContextMenu: null,
          editor3dContextDeleteEpoch: 0,
        });
      })();
    },

    openProject: async () => {
      const loaded = await pickAndLoadProject();
      if (!loaded) {
        return;
      }
      const { ok, errors } = validateProjectSchema(loaded);
      if (!ok) {
        set({
          lastError: errors?.map((e) => e.message ?? "schema").join("; ") ?? "Ошибка схемы",
        });
        return;
      }
      set({
        currentProject: loaded,
        viewport2d: loaded.viewState.viewport2d,
        viewport3d: loaded.viewState.viewport3d,
        activeTab: loaded.viewState.activeTab,
        dirty: false,
        lastError: null,
        selectedEntityIds: [],
        history: initialProjectHistory,
        wallPlacementHistoryBaseline: null,
        pendingOpeningPlacementHistoryBaseline: null,
        wallMoveCopyHistoryBaseline: null,
        foundationPileMoveCopyHistoryBaseline: null,
        lengthChangeHistoryBaseline: null,
        layerManagerOpen: false,
        layerParamsModalOpen: false,
        profilesModalOpen: false,
        addWallModalOpen: false,
        addWindowModalOpen: false,
        addDoorModalOpen: false,
        pendingWindowPlacement: null,
        pendingDoorPlacement: null,
        lastWindowPlacementParams: null,
        lastDoorPlacementParams: null,
        windowEditModal: null,
        doorEditModal: null,
        wallJointParamsModalOpen: false,
        wallJointSession: null,
        wallPlacementSession: null,
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        wallContextMenu: null,
        foundationPileContextMenu: null,
        editor2dSecondaryContextMenu: null,
        wallMoveCopySession: null,
        foundationPileMoveCopySession: null,
        entityCopySession: null,
        entityCopyParamsModal: null,
        entityCopyHistoryBaseline: null,
        entityCopyCoordinateModalOpen: false,
        addFoundationStripModalOpen: false,
        foundationStripPlacementSession: null,
        foundationStripPlacementHistoryBaseline: null,
        addFoundationPileModalOpen: false,
        foundationPilePlacementSession: null,
        foundationPilePlacementHistoryBaseline: null,
        addRoofPlaneModalOpen: false,
        roofPlanePlacementSession: null,
        roofPlanePlacementHistoryBaseline: null,
        roofContourJoinSession: null,
        roofContourJoinHistoryBaseline: null,
        textureApply3dToolActive: false,
        textureApply3dParamsModal: null,
        editor3dContextMenu: null,
        editor3dContextDeleteEpoch: 0,
      });
      try {
        await syncProjectToFirestore(loaded);
      } catch (e) {
        console.error(e);
        set({
          lastError: e instanceof Error ? `Firestore: ${e.message}` : "Не удалось синхронизировать с Firestore",
          persistenceStatus: "error",
        });
      }
    },

    saveProject: async () => {
      const { currentProject } = get();
      const { ok, errors } = validateProjectSchema(currentProject);
      if (!ok) {
        set({
          lastError: errors?.map((e) => e.message ?? "schema").join("; ") ?? "Ошибка схемы",
        });
        return;
      }
      await saveProjectWithFallback(currentProject);
      set({ dirty: false, lastError: null });
      const db = tryGetFirestoreDb();
      if (get().firestoreEnabled && db) {
        try {
          await updateProjectSnapshot(db, currentProject);
          setLastOpenedProjectId(currentProject.meta.id);
          set({ persistenceStatus: "saved" });
        } catch (e) {
          console.error(e);
          set({
            lastError: e instanceof Error ? `Firestore: ${e.message}` : "Ошибка записи в Firestore",
            persistenceStatus: "error",
          });
        }
      }
    },

    importProjectJson: (json) => {
      try {
        const loaded = deserializeProject(json);
        const { ok, errors } = validateProjectSchema(loaded);
        if (!ok) {
          set({
            lastError: errors?.map((e) => e.message ?? "schema").join("; ") ?? "Ошибка схемы",
          });
          return;
        }
        set({
          currentProject: loaded,
          viewport2d: loaded.viewState.viewport2d,
          viewport3d: loaded.viewState.viewport3d,
          activeTab: loaded.viewState.activeTab,
          dirty: false,
          lastError: null,
          selectedEntityIds: [],
          history: initialProjectHistory,
          wallPlacementHistoryBaseline: null,
          pendingOpeningPlacementHistoryBaseline: null,
          wallMoveCopyHistoryBaseline: null,
          foundationPileMoveCopyHistoryBaseline: null,
          lengthChangeHistoryBaseline: null,
          layerManagerOpen: false,
          layerParamsModalOpen: false,
          profilesModalOpen: false,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          addDoorModalOpen: false,
          pendingWindowPlacement: null,
          pendingDoorPlacement: null,
          lastWindowPlacementParams: null,
          lastDoorPlacementParams: null,
          windowEditModal: null,
          doorEditModal: null,
          wallJointParamsModalOpen: false,
          wallJointSession: null,
          wallPlacementSession: null,
          wallCoordinateModalOpen: false,
          floorBeamPlacementCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          wallContextMenu: null,
          foundationPileContextMenu: null,
          editor2dSecondaryContextMenu: null,
          wallMoveCopySession: null,
          foundationPileMoveCopySession: null,
          entityCopySession: null,
          entityCopyParamsModal: null,
          entityCopyHistoryBaseline: null,
          entityCopyCoordinateModalOpen: false,
          addFoundationStripModalOpen: false,
          foundationStripPlacementSession: null,
          foundationStripPlacementHistoryBaseline: null,
          addFoundationPileModalOpen: false,
          foundationPilePlacementSession: null,
          foundationPilePlacementHistoryBaseline: null,
          addRoofPlaneModalOpen: false,
          roofPlanePlacementSession: null,
          roofPlanePlacementHistoryBaseline: null,
          roofContourJoinSession: null,
          roofContourJoinHistoryBaseline: null,
          textureApply3dToolActive: false,
          textureApply3dParamsModal: null,
          editor3dContextMenu: null,
          editor3dContextDeleteEpoch: 0,
        });
        void (async () => {
          try {
            await syncProjectToFirestore(loaded);
          } catch (e) {
            console.error(e);
            set({
              lastError: e instanceof Error ? `Firestore: ${e.message}` : "Не удалось синхронизировать с Firestore",
              persistenceStatus: "error",
            });
          }
        })();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка импорта";
        set({ lastError: msg });
      }
    },
  };
});

export function selectCanUndo(): boolean {
  return useAppStore.getState().history.past.length > 0;
}

export function selectCanRedo(): boolean {
  return useAppStore.getState().history.future.length > 0;
}

export function selectCanDeleteCurrentLayer(): boolean {
  return canDeleteLayer(useAppStore.getState().currentProject);
}
