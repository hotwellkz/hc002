import { isEditableKeyboardTarget } from "@/shared/editableKeyboardTarget";
import { isSceneCoordinateModalBlocking } from "@/shared/sceneCoordinateModalLock";

/** Срез состояния приложения для фильтрации хоткеев (без циклических импортов store). */
export interface EditorToolHotkeyAppSnapshot {
  readonly activeTab: string;
  readonly layerManagerOpen: boolean;
  readonly layerParamsModalOpen: boolean;
  readonly profilesModalOpen: boolean;
  readonly addWallModalOpen: boolean;
  readonly addFloorBeamModalOpen: boolean;
  readonly floorBeamSplitModalOpen: boolean;
  readonly addFoundationStripModalOpen: boolean;
  readonly addFoundationPileModalOpen: boolean;
  readonly addSlabModalOpen: boolean;
  readonly addRoofPlaneModalOpen: boolean;
  readonly addWindowModalOpen: boolean;
  readonly addDoorModalOpen: boolean;
  readonly windowEditModal: unknown;
  readonly doorEditModal: unknown;
  /** Редактирование параметров плиты (двойной клик). */
  readonly slabEditModal: unknown | null;
  readonly wallJointParamsModalOpen: boolean;
  readonly wallCalculationModalOpen: boolean;
  readonly roofCalculationModalOpen: boolean;
  readonly wallCoordinateModalOpen: boolean;
  readonly floorBeamPlacementCoordinateModalOpen: boolean;
  readonly slabCoordinateModalOpen: boolean;
  readonly wallAnchorCoordinateModalOpen: boolean;
  readonly wallMoveCopyCoordinateModalOpen: boolean;
  readonly floorBeamMoveCopyCoordinateModalOpen: boolean;
  readonly lengthChangeCoordinateModalOpen: boolean;
  readonly projectOriginCoordinateModalOpen: boolean;
  readonly openingAlongMoveNumericModalOpen: boolean;
  /** Точное смещение ребра контура плоскости крыши (мм). */
  readonly roofPlaneEdgeOffsetModal: unknown | null;
  /** Ручной ввод смещения при универсальном копировании (вторая точка). */
  readonly entityCopyCoordinateModalOpen: boolean;
  /** Модалка «Авто-сваи» для ленты фундамента. */
  readonly foundationStripAutoPilesModal: unknown;
  /** Параметры универсального копирования по двум точкам. */
  readonly entityCopyParamsModal: unknown | null;
  /** Параметры текстуры 3D. */
  readonly textureApply3dParamsModal: unknown | null;
  /** Контекстное меню объекта в 3D (ПКМ). */
  readonly editor3dContextMenu: unknown | null;
}

export interface EditorToolHotkeyIgnoreOptions {
  /** Открыто окно настройки горячих клавиш. */
  readonly shortcutsSettingsModalOpen: boolean;
  /** Идёт захват новой клавиши в этом окне. */
  readonly shortcutRebindCaptureActive: boolean;
}

export function hasBlockingEditorOverlayModal(app: EditorToolHotkeyAppSnapshot): boolean {
  return (
    app.layerManagerOpen ||
    app.layerParamsModalOpen ||
    app.profilesModalOpen ||
    app.addWallModalOpen ||
    app.addFloorBeamModalOpen ||
    app.floorBeamSplitModalOpen ||
    app.addFoundationStripModalOpen ||
    app.addFoundationPileModalOpen ||
    app.addSlabModalOpen ||
    app.addRoofPlaneModalOpen ||
    app.addWindowModalOpen ||
    app.addDoorModalOpen ||
    app.windowEditModal != null ||
    app.doorEditModal != null ||
    app.slabEditModal != null ||
    app.wallJointParamsModalOpen ||
    app.wallCalculationModalOpen ||
    app.roofCalculationModalOpen ||
    app.foundationStripAutoPilesModal != null ||
    app.textureApply3dParamsModal != null ||
    app.editor3dContextMenu != null ||
    isSceneCoordinateModalBlocking(app)
  );
}

/**
 * true — не обрабатывать хоткеи инструментов (ввод текста, модалки, настройки).
 */
export function shouldIgnoreEditorToolHotkeys(
  target: EventTarget | null,
  app: EditorToolHotkeyAppSnapshot,
  opts: EditorToolHotkeyIgnoreOptions,
): boolean {
  if (opts.shortcutsSettingsModalOpen || opts.shortcutRebindCaptureActive) {
    return true;
  }
  if (app.activeTab !== "2d") {
    return true;
  }
  if (isEditableKeyboardTarget(target)) {
    return true;
  }
  if (hasBlockingEditorOverlayModal(app)) {
    return true;
  }
  return false;
}

/** Esc / переназначенный сброс: не перехватывать, если открыт диалог или фокус в поле ввода. */
export function shouldIgnoreWorkspaceEscape(
  target: EventTarget | null,
  app: EditorToolHotkeyAppSnapshot,
): boolean {
  if (app.activeTab !== "2d") {
    return true;
  }
  if (isEditableKeyboardTarget(target)) {
    return true;
  }
  if (hasBlockingEditorOverlayModal(app)) {
    return true;
  }
  return false;
}
