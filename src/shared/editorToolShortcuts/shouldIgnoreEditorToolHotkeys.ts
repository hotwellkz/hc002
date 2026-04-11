import { isEditableKeyboardTarget } from "@/shared/editableKeyboardTarget";
import { isSceneCoordinateModalBlocking } from "@/shared/sceneCoordinateModalLock";

/** Срез состояния приложения для фильтрации хоткеев (без циклических импортов store). */
export interface EditorToolHotkeyAppSnapshot {
  readonly activeTab: string;
  readonly layerManagerOpen: boolean;
  readonly layerParamsModalOpen: boolean;
  readonly profilesModalOpen: boolean;
  readonly addWallModalOpen: boolean;
  readonly addWindowModalOpen: boolean;
  readonly addDoorModalOpen: boolean;
  readonly windowEditModal: unknown;
  readonly doorEditModal: unknown;
  readonly wallJointParamsModalOpen: boolean;
  readonly wallCalculationModalOpen: boolean;
  readonly wallCoordinateModalOpen: boolean;
  readonly wallAnchorCoordinateModalOpen: boolean;
  readonly wallMoveCopyCoordinateModalOpen: boolean;
  readonly lengthChangeCoordinateModalOpen: boolean;
  readonly projectOriginCoordinateModalOpen: boolean;
  readonly openingAlongMoveNumericModalOpen: boolean;
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
    app.addWindowModalOpen ||
    app.addDoorModalOpen ||
    app.windowEditModal != null ||
    app.doorEditModal != null ||
    app.wallJointParamsModalOpen ||
    app.wallCalculationModalOpen ||
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
