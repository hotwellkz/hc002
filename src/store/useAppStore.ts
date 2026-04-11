import { create } from "zustand";

import {
  canDeleteLayer,
  createLayerInProject,
  deleteLayerAndEntities,
  getNextLayerId,
  getPreviousLayerId,
  reorderLayerRelative,
  setActiveLayerId,
  updateLayerInProject,
} from "@/core/domain/layerOps";
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
import { deleteEntitiesFromProject } from "@/core/domain/projectMutations";
import { type ViewportTransform } from "@/core/geometry/viewportTransform";
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
} from "@/core/geometry/wallPlacementSnap2d";
import {
  computeLengthChangePreviewAlongAxis,
  computeLinearSecondPointPreview,
  computeShiftDirectionLockUnit,
  unitDirectionOrNull,
} from "@/core/geometry/shiftDirectionLock2d";
import { computeProfileThickness, MIN_WALL_SEGMENT_LENGTH_MM, setProjectOrigin } from "@/core/domain/wallOps";
import { duplicateWallWithDependents } from "@/core/domain/wallDuplicate";
import { translateWallInProject } from "@/core/domain/wallTranslate";
import type { WallMoveCopySession } from "@/core/domain/wallMoveCopySession";
import { initialLine2dSession, type Line2dSession } from "@/core/domain/line2dSession";
import { initialRuler2dSession, type Ruler2dSession } from "@/core/domain/ruler2dSession";
import type { LengthChange2dSession } from "@/core/domain/lengthChange2dSession";
import { applyWallLengthChangeInProject } from "@/core/domain/wallLengthChangeApply";
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
import { applyCornerWallJoint, applyTeeWallJoint } from "@/core/domain/wallJointApply";
import type { WallEndSide, WallJointKind } from "@/core/domain/wallJoint";
import type { WallJointSession } from "@/core/domain/wallJointSession";
import { pickNearestWallEnd, pickWallSegmentInterior } from "@/core/domain/wallJointPick";
import { narrowProjectToActiveLayer } from "@/core/domain/projectLayerSlice";
import { buildWallCalculationForWall, SipWallLayoutError } from "@/core/domain/sipWallLayout";
import type { WallShapeMode } from "@/core/domain/wallShapeMode";
import { type EditorTab, viewport3dWithPlanOrbitTargetMm } from "@/core/domain/viewState";
import { setLastOpenedProjectId } from "@/data/lastOpenedProjectId";
import { createProjectInDb, updateProjectSnapshot } from "@/data/projectFirestoreRepository";
import { syncProjectToFirestore } from "@/data/projectFirestoreSync";
import { tryGetFirestoreDb } from "@/firebase/app";
import { deserializeProject } from "@/core/io/serialization";
import { pickAndLoadProject, saveProjectWithFallback } from "@/core/io/projectFile";
import { validateProjectSchema } from "@/core/validation/validateProjectSchema";
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

export interface UiPanelsState {
  readonly rightPropertiesOpen: boolean;
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
  readonly layerParamsModalOpen: boolean;
  readonly profilesModalOpen: boolean;
  readonly addWallModalOpen: boolean;
  readonly addWindowModalOpen: boolean;
  readonly addDoorModalOpen: boolean;
  readonly pendingWindowPlacement: PendingWindowPlacement | null;
  readonly pendingDoorPlacement: PendingDoorPlacement | null;
  readonly windowEditModal: WindowEditModalState | null;
  readonly doorEditModal: DoorEditModalState | null;
  readonly wallJointParamsModalOpen: boolean;
  /** Ручной инструмент «Угловое соединение» после выбора типа в модалке. */
  readonly wallJointSession: WallJointSession | null;
  /** Режим постановки стены на 2D (после модалки «Добавить стену»). */
  readonly wallPlacementSession: WallPlacementSession | null;
  readonly wallCoordinateModalOpen: boolean;
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
  /** Перенос или копия стены двумя точками (как постановка стены). */
  readonly wallMoveCopySession: WallMoveCopySession | null;
  /** Пробел: смещение второй точки переноса/копии. */
  readonly wallMoveCopyCoordinateModalOpen: boolean;
  readonly wallCalculationModalOpen: boolean;
  readonly dirty: boolean;
  readonly lastError: string | null;
  readonly history: UndoRedoSkeleton;
  /** Снимок до начала постановки стены (модалка «Добавить стену») — один undo на завершённую стену. */
  readonly wallPlacementHistoryBaseline: Project | null;
  /** Снимок до добавления черновика окна/двери — один undo на полную установку. */
  readonly pendingOpeningPlacementHistoryBaseline: Project | null;
  /** Снимок до переноса/копии стены. */
  readonly wallMoveCopyHistoryBaseline: Project | null;
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
}

interface AppActions {
  setSelectedEntityIds: (ids: readonly string[]) => void;
  clearSelection: () => void;
  deleteSelectedEntities: () => void;
  setActiveTool: (tool: ActiveTool) => void;
  setViewport2d: (v: Project["viewState"]["viewport2d"]) => void;
  setViewport3d: (v: Project["viewState"]["viewport3d"]) => void;
  setActiveTab: (tab: EditorTab) => void;
  toggleRightPanel: () => void;
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
  createLayer: (input: { readonly name: string; readonly elevationMm: number }) => void;
  goToPreviousLayer: () => void;
  goToNextLayer: () => void;
  deleteCurrentLayer: () => void;
  setActiveLayer: (layerId: string) => void;
  updateLayer: (layerId: string, patch: { readonly name?: string; readonly elevationMm?: number }) => void;
  reorderLayerUp: (layerId: string) => void;
  reorderLayerDown: (layerId: string) => void;
  deleteLayerById: (layerId: string) => void;
  openLayerManager: () => void;
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
   * иначе полностью выйти из инструмента стены.
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
  setLinearPlacementMode: (mode: LinearProfilePlacementMode) => void;
  setWallShapeMode: (mode: WallShapeMode) => void;
  setSnapToVertex: (value: boolean) => void;
  setSnapToEdge: (value: boolean) => void;
  setSnapToGrid: (value: boolean) => void;
  openWallCoordinateModal: () => void;
  closeWallCoordinateModal: () => void;
  applyWallCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
  openWallContextMenu: (input: { readonly wallId: string; readonly clientX: number; readonly clientY: number }) => void;
  closeWallContextMenu: () => void;
  deleteWallFromContextMenu: (wallId: string) => void;
  startWallMoveFromContextMenu: (wallId: string) => void;
  startWallCopyFromContextMenu: (wallId: string) => void;
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
  openWallMoveCopyCoordinateModal: () => void;
  closeWallMoveCopyCoordinateModal: () => void;
  applyWallMoveCopyCoordinateModal: (input: { readonly dxMm: number; readonly dyMm: number }) => void;
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
    wallId: string,
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

function historyJumpClearTransientUi(s: AppStore, restored: Project): Partial<AppStore> {
  const wd =
    s.wallDetailWallId && restored.walls.some((w) => w.id === s.wallDetailWallId) ? s.wallDetailWallId : null;
  return {
    wallPlacementSession: null,
    wallJointSession: null,
    pendingWindowPlacement: null,
    pendingDoorPlacement: null,
    windowEditModal: null,
    doorEditModal: null,
    wallMoveCopySession: null,
    wallMoveCopyCoordinateModalOpen: false,
    wallCalculationModalOpen: false,
    wallCoordinateModalOpen: false,
    wallAnchorCoordinateModalOpen: false,
    wallAnchorPlacementModeActive: false,
    wallPlacementAnchorMm: null,
    wallPlacementAnchorPreviewEndMm: null,
    wallPlacementAnchorLastSnapKind: null,
    wallPlacementAnchorAngleSnapLockedDeg: null,
    wallContextMenu: null,
    openingMoveModeActive: false,
    ruler2dSession: null,
    line2dSession: null,
    lengthChange2dSession: null,
    lengthChangeCoordinateModalOpen: false,
    projectOriginMoveToolActive: false,
    projectOriginCoordinateModalOpen: false,
    openingAlongMoveNumericModalOpen: false,
    wallPlacementHistoryBaseline: null,
    pendingOpeningPlacementHistoryBaseline: null,
    wallMoveCopyHistoryBaseline: null,
    lengthChangeHistoryBaseline: null,
    addWallModalOpen: false,
    addWindowModalOpen: false,
    addDoorModalOpen: false,
    wallJointParamsModalOpen: false,
    activeTool: "select",
    wallDetailWallId: wd,
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
  });
}

function resolveWallPlacementSnapFromStore(
  get: () => AppStore,
  rawWorldMm: { readonly x: number; readonly y: number },
  viewport: ViewportTransform | null,
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

export const useAppStore = create<AppStore>((set, get) => {
  const empty = createEmptyProject();
  return {
    currentProject: empty,
    selectedEntityIds: [],
    activeTool: "select",
    viewport2d: empty.viewState.viewport2d,
    viewport3d: empty.viewState.viewport3d,
    activeTab: empty.viewState.activeTab,
    uiPanels: { rightPropertiesOpen: true },
    layerManagerOpen: false,
    layerParamsModalOpen: false,
    profilesModalOpen: false,
    addWallModalOpen: false,
    addWindowModalOpen: false,
    addDoorModalOpen: false,
    pendingWindowPlacement: null,
    pendingDoorPlacement: null,
    windowEditModal: null,
    doorEditModal: null,
    wallJointParamsModalOpen: false,
    wallJointSession: null,
    wallPlacementSession: null,
    wallCoordinateModalOpen: false,
    wallAnchorCoordinateModalOpen: false,
    wallAnchorPlacementModeActive: false,
    wallPlacementAnchorMm: null,
    wallPlacementAnchorPreviewEndMm: null,
    wallPlacementAnchorLastSnapKind: null,
    wallPlacementAnchorAngleSnapLockedDeg: null,
    wallContextMenu: null,
    wallMoveCopySession: null,
    wallMoveCopyCoordinateModalOpen: false,
    wallCalculationModalOpen: false,
    dirty: false,
    lastError: null,
    history: initialProjectHistory,
    wallPlacementHistoryBaseline: null,
    pendingOpeningPlacementHistoryBaseline: null,
    wallMoveCopyHistoryBaseline: null,
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

    setViewportCanvas2dPx: (width, height) =>
      set({
        viewportCanvas2dPx:
          Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
            ? { width, height }
            : null,
      }),

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

    setActiveTool: (tool) =>
      set((s) => {
        let proj = s.currentProject;
        let dirty = s.dirty;
        let projectMutated = false;
        if (tool !== "select" && s.wallMoveCopySession?.mode === "copy") {
          proj = touchProjectMeta(deleteEntitiesFromProject(s.currentProject, new Set([s.wallMoveCopySession.workingWallId])));
          dirty = true;
          projectMutated = true;
        }
        const wallMoveCopySession = tool === "select" ? s.wallMoveCopySession : null;
        const wallMoveCopyCoordinateModalOpen = tool === "select" ? s.wallMoveCopyCoordinateModalOpen : false;
        const wallContextMenu = tool === "select" ? s.wallContextMenu : null;
        const commonClear = {
          currentProject: proj,
          dirty,
          wallMoveCopyHistoryBaseline: projectMutated ? null : s.wallMoveCopyHistoryBaseline,
          wallMoveCopySession,
          wallMoveCopyCoordinateModalOpen,
          wallContextMenu,
          wallJointSession: null,
          wallJointParamsModalOpen: false,
          wallPlacementSession: null,
          wallCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          projectOriginMoveToolActive: false,
          projectOriginCoordinateModalOpen: false,
          openingAlongMoveNumericModalOpen: false,
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
        const modelTouched =
          tab !== "2d" &&
          Boolean(s.pendingWindowPlacement || s.pendingDoorPlacement || s.wallMoveCopySession?.mode === "copy");
        const projectForView = modelTouched ? proj : s.currentProject;
        const nextProject = mergeViewState(projectForView, { activeTab: tab });
        const baselinePatch: Partial<AppStore> = {
          pendingOpeningPlacementHistoryBaseline:
            tab !== "2d" && (s.pendingWindowPlacement != null || s.pendingDoorPlacement != null)
              ? null
              : s.pendingOpeningPlacementHistoryBaseline,
          wallMoveCopyHistoryBaseline:
            tab !== "2d" && s.wallMoveCopySession?.mode === "copy" ? null : s.wallMoveCopyHistoryBaseline,
        };
        const staticPart: Partial<AppStore> = {
          activeTab: tab,
          activeTool:
            tab === "2d"
              ? s.activeTool
              : s.activeTool === "ruler" || s.activeTool === "changeLength" || s.activeTool === "line"
                ? "select"
                : s.activeTool,
          wallPlacementSession: tab === "2d" ? s.wallPlacementSession : null,
          wallJointSession: tab === "2d" ? s.wallJointSession : null,
          wallJointParamsModalOpen: tab === "2d" ? s.wallJointParamsModalOpen : false,
          addWallModalOpen: tab === "2d" ? s.addWallModalOpen : false,
          addWindowModalOpen: tab === "2d" ? s.addWindowModalOpen : false,
          pendingWindowPlacement: tab === "2d" ? s.pendingWindowPlacement : null,
          pendingDoorPlacement: tab === "2d" ? s.pendingDoorPlacement : null,
          windowEditModal: tab === "2d" ? s.windowEditModal : null,
          wallCoordinateModalOpen: tab === "2d" ? s.wallCoordinateModalOpen : false,
          wallAnchorCoordinateModalOpen: tab === "2d" ? s.wallAnchorCoordinateModalOpen : false,
          wallAnchorPlacementModeActive: tab === "2d" ? s.wallAnchorPlacementModeActive : false,
          wallPlacementAnchorMm: tab === "2d" ? s.wallPlacementAnchorMm : null,
          wallPlacementAnchorPreviewEndMm: tab === "2d" ? s.wallPlacementAnchorPreviewEndMm : null,
          wallPlacementAnchorLastSnapKind: tab === "2d" ? s.wallPlacementAnchorLastSnapKind : null,
          wallPlacementAnchorAngleSnapLockedDeg: tab === "2d" ? s.wallPlacementAnchorAngleSnapLockedDeg : null,
          wallContextMenu: tab === "2d" ? s.wallContextMenu : null,
          wallMoveCopySession: tab === "2d" ? s.wallMoveCopySession : null,
          wallMoveCopyCoordinateModalOpen: tab === "2d" ? s.wallMoveCopyCoordinateModalOpen : false,
          ruler2dSession: tab === "2d" ? s.ruler2dSession : null,
          line2dSession: tab === "2d" ? s.line2dSession : null,
          lengthChange2dSession: tab === "2d" ? s.lengthChange2dSession : null,
          lengthChangeCoordinateModalOpen: tab === "2d" ? s.lengthChangeCoordinateModalOpen : false,
          openingMoveModeActive: tab === "2d" ? s.openingMoveModeActive : false,
          projectOriginMoveToolActive: tab === "2d" ? s.projectOriginMoveToolActive : false,
          projectOriginCoordinateModalOpen: tab === "2d" ? s.projectOriginCoordinateModalOpen : false,
          openingAlongMoveNumericModalOpen: tab === "2d" ? s.openingAlongMoveNumericModalOpen : false,
          wallDetailWallId:
            tab === "wall"
              ? s.wallDetailWallId ?? s.currentProject.walls.find((w) => s.selectedEntityIds.includes(w.id))?.id ?? null
              : s.wallDetailWallId,
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

    getActiveLayerIdForNewEntities: () => get().currentProject.activeLayerId,

    createLayer: (input) => {
      const next = createLayerInProject(get().currentProject, input);
      set((s) => buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true, lastError: null }));
    },

    goToPreviousLayer: () => {
      const id = getPreviousLayerId(get().currentProject);
      if (!id) {
        return;
      }
      const next = setActiveLayerId(get().currentProject, id);
      if (next) {
        set((s) => buildProjectMutationState(s, next, { selectedEntityIds: [], dirty: true }));
      }
    },

    goToNextLayer: () => {
      const id = getNextLayerId(get().currentProject);
      if (!id) {
        return;
      }
      const next = setActiveLayerId(get().currentProject, id);
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
      const next = reorderLayerRelative(get().currentProject, layerId, "up");
      set((s) => buildProjectMutationState(s, next, { dirty: true }));
    },

    reorderLayerDown: (layerId) => {
      const next = reorderLayerRelative(get().currentProject, layerId, "down");
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

    openLayerManager: () => set({ layerManagerOpen: true }),
    closeLayerManager: () => set({ layerManagerOpen: false }),

    openLayerParamsModal: () => set({ layerParamsModalOpen: true }),
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
      set({
        addWallModalOpen: true,
        addWindowModalOpen: false,
        wallJointSession: null,
        wallJointParamsModalOpen: false,
      }),

    closeAddWallModal: () => set({ addWallModalOpen: false }),

    openAddWindowModal: () =>
      set({
        addWindowModalOpen: true,
        addDoorModalOpen: false,
        addWallModalOpen: false,
        wallPlacementSession: null,
        wallJointSession: null,
        wallJointParamsModalOpen: false,
        wallCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        windowEditModal: null,
        lastError: null,
      }),
    openAddDoorModal: () =>
      set({
        addDoorModalOpen: true,
        addWindowModalOpen: false,
        wallPlacementSession: null,
        wallJointSession: null,
        wallJointParamsModalOpen: false,
        wallCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        doorEditModal: null,
        lastError: null,
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
      set((s) =>
        buildProjectMutationState(
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
        ),
      );
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
      set((s) =>
        buildProjectMutationState(
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
        ),
      );
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
        wallMoveCopySession: null,
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
          wallAnchorCoordinateModalOpen: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
        });
        return;
      }
      set({
        wallPlacementSession: null,
        wallPlacementHistoryBaseline: null,
        wallCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
        addWallModalOpen: false,
        addWindowModalOpen: false,
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
      const p0 = get().currentProject;
      const e2 = p0.settings.editor2d;
      const snap = editor2dSnapSettings(p0);

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
      }
    },

    linearPlacementReleaseShiftDirectionLock: () => {
      const ws = get().wallPlacementSession;
      const rs = get().ruler2dSession;
      const ls = get().line2dSession;
      const mc = get().wallMoveCopySession;
      const lc = get().lengthChange2dSession;
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
      if (
        Object.keys(wClear).length +
          Object.keys(rClear).length +
          Object.keys(lLineClear).length +
          Object.keys(mClear).length +
          Object.keys(lcClear).length >
        0
      ) {
        set({ ...wClear, ...rClear, ...lLineClear, ...mClear, ...lcClear });
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
        lastError: null,
      }),

    closeWallContextMenu: () => set({ wallContextMenu: null }),

    deleteWallFromContextMenu: (wallId) => {
      const { currentProject, selectedEntityIds, wallDetailWallId } = get();
      const next = deleteEntitiesFromProject(currentProject, new Set([wallId]));
      set((s) =>
        buildProjectMutationState(s, next, {
          wallContextMenu: null,
          wallMoveCopySession: null,
          wallMoveCopyCoordinateModalOpen: false,
          wallMoveCopyHistoryBaseline: null,
          selectedEntityIds: selectedEntityIds.filter((id) => id !== wallId),
          wallDetailWallId: wallDetailWallId === wallId ? null : wallDetailWallId,
          dirty: true,
          lastError: null,
        }),
      );
    },

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
        wallPlacementSession: null,
        wallCoordinateModalOpen: false,
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
      const p0 = get().currentProject;
      const baseline = cloneProjectSnapshot(p0);
      const r = duplicateWallWithDependents(p0, wallId);
      if ("error" in r) {
        set({ lastError: r.error, wallContextMenu: null });
        return;
      }
      set((s) =>
        buildProjectMutationState(
          s,
          r.project,
          {
            wallMoveCopyHistoryBaseline: baseline,
            wallContextMenu: null,
            wallPlacementSession: null,
            wallCoordinateModalOpen: false,
            wallJointSession: null,
            pendingWindowPlacement: null,
            pendingDoorPlacement: null,
            wallMoveCopyCoordinateModalOpen: false,
            wallMoveCopySession: {
              mode: "copy",
              sourceWallId: wallId,
              workingWallId: r.newWallId,
              phase: "pickAnchor",
              anchorWorldMm: null,
              previewTargetMm: null,
              lastSnapKind: null,
              angleSnapLockedDeg: null,
              shiftDirectionLockUnit: null,
              shiftLockReferenceMm: null,
            },
            selectedEntityIds: [r.newWallId],
            dirty: true,
            lastError: null,
          },
          { skipHistory: true },
        ),
      );
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

    openWallMoveCopyCoordinateModal: () => {
      const s = get().wallMoveCopySession;
      if (!s || s.phase !== "pickTarget" || !s.anchorWorldMm) {
        return;
      }
      set({ wallMoveCopyCoordinateModalOpen: true, lastError: null });
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
        set({ activeTool: "select", ruler2dSession: null, lastError: null });
        return;
      }
      if (rs.phase === "pickFirst") {
        set({ activeTool: "select", ruler2dSession: null, lastError: null });
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
            selectedEntityIds: [id],
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
        set({ activeTool: "select", line2dSession: null, lastError: null });
        return;
      }
      if (ls.phase === "pickFirst") {
        set({ activeTool: "select", line2dSession: null, lastError: null });
        return;
      }
      set({ line2dSession: initialLine2dSession(), lastError: null });
    },

    startLengthChange2dSession: (wallId, movingEnd, worldMm, viewport) => {
      if (get().activeTool !== "changeLength") {
        return;
      }
      const cp = get().currentProject;
      const layerView = narrowProjectToActiveLayer(cp);
      const wall = layerView.walls.find((w) => w.id === wallId);
      if (!wall) {
        return;
      }
      const snap = resolvePlacementSnap(get, worldMm, viewport);
      const fixed = fixedEndpointForLengthChange(wall, movingEnd);
      const { ux, uy } = axisFromFixedTowardMoving(wall, movingEnd);
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
          wallId,
          movingEnd,
          fixedEndMm: { x: fixed.x, y: fixed.y },
          axisUx: ux,
          axisUy: uy,
          initialLengthMm: wallLengthMm(wall),
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
      const r = applyWallLengthChangeInProject(get().currentProject, sess.wallId, sess.movingEnd, Lnew);
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
      const r = applyWallLengthChangeInProject(get().currentProject, sess.wallId, sess.movingEnd, Lnew);
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

    openWallCoordinateModal: () => {
      const s = get().wallPlacementSession;
      if (!s || s.phase !== "waitingSecondPoint" || !s.firstPointMm) {
        return;
      }
      set({ wallCoordinateModalOpen: true, lastError: null });
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
          pendingWindowPlacement: null,
          windowEditModal: null,
          wallJointParamsModalOpen: false,
          wallJointSession: null,
          wallPlacementSession: null,
          wallCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
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
          lengthChangeHistoryBaseline: null,
          layerManagerOpen: false,
          layerParamsModalOpen: false,
          profilesModalOpen: false,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          pendingWindowPlacement: null,
          windowEditModal: null,
          wallJointParamsModalOpen: false,
          wallJointSession: null,
          wallPlacementSession: null,
          wallCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
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
        lengthChangeHistoryBaseline: null,
        layerManagerOpen: false,
        layerParamsModalOpen: false,
        profilesModalOpen: false,
        addWallModalOpen: false,
        addWindowModalOpen: false,
        pendingWindowPlacement: null,
        windowEditModal: null,
        wallJointParamsModalOpen: false,
        wallJointSession: null,
        wallPlacementSession: null,
        wallCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallAnchorPlacementModeActive: false,
        wallPlacementAnchorMm: null,
        wallPlacementAnchorPreviewEndMm: null,
        wallPlacementAnchorLastSnapKind: null,
        wallPlacementAnchorAngleSnapLockedDeg: null,
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
          lengthChangeHistoryBaseline: null,
          layerManagerOpen: false,
          layerParamsModalOpen: false,
          profilesModalOpen: false,
          addWallModalOpen: false,
          addWindowModalOpen: false,
          pendingWindowPlacement: null,
          windowEditModal: null,
          wallJointParamsModalOpen: false,
          wallJointSession: null,
          wallPlacementSession: null,
          wallCoordinateModalOpen: false,
          wallAnchorCoordinateModalOpen: false,
          wallAnchorPlacementModeActive: false,
          wallPlacementAnchorMm: null,
          wallPlacementAnchorPreviewEndMm: null,
          wallPlacementAnchorLastSnapKind: null,
          wallPlacementAnchorAngleSnapLockedDeg: null,
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
