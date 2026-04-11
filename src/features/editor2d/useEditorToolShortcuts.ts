import { useEffect } from "react";

import { executeEditorShortcut } from "@/shared/editorToolShortcuts/executeEditorShortcut";
import type { EditorShortcutActionId } from "@/shared/editorToolShortcuts/editorShortcutActions";
import { buildShortcutCodeIndex } from "@/shared/editorToolShortcuts/resolveEditorShortcutCodes";
import { shouldIgnoreEditorToolHotkeys } from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { useAppStore } from "@/store/useAppStore";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";

function appSnapshotFromStore(): Parameters<typeof shouldIgnoreEditorToolHotkeys>[1] {
  const s = useAppStore.getState();
  return {
    activeTab: s.activeTab,
    layerManagerOpen: s.layerManagerOpen,
    layerParamsModalOpen: s.layerParamsModalOpen,
    profilesModalOpen: s.profilesModalOpen,
    addWallModalOpen: s.addWallModalOpen,
    addWindowModalOpen: s.addWindowModalOpen,
    addDoorModalOpen: s.addDoorModalOpen,
    windowEditModal: s.windowEditModal,
    doorEditModal: s.doorEditModal,
    wallJointParamsModalOpen: s.wallJointParamsModalOpen,
    wallCalculationModalOpen: s.wallCalculationModalOpen,
    wallCoordinateModalOpen: s.wallCoordinateModalOpen,
    wallAnchorCoordinateModalOpen: s.wallAnchorCoordinateModalOpen,
    wallMoveCopyCoordinateModalOpen: s.wallMoveCopyCoordinateModalOpen,
    lengthChangeCoordinateModalOpen: s.lengthChangeCoordinateModalOpen,
    projectOriginCoordinateModalOpen: s.projectOriginCoordinateModalOpen,
    openingAlongMoveNumericModalOpen: s.openingAlongMoveNumericModalOpen,
  };
}

/**
 * Единый обработчик хоткеев инструментов 2D (физические коды клавиш, стабильно при смене раскладки).
 */
export function useEditorToolShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (e.shiftKey) {
        return;
      }

      const ui = useEditorShortcutsStore.getState();
      const app = appSnapshotFromStore();
      if (
        shouldIgnoreEditorToolHotkeys(e.target, app, {
          shortcutsSettingsModalOpen: ui.shortcutsSettingsModalOpen,
          shortcutRebindCaptureActive: ui.shortcutRebindCaptureActive,
        })
      ) {
        return;
      }

      const index = buildShortcutCodeIndex(ui.customCodes);
      const actions = index.get(e.code) as EditorShortcutActionId[] | undefined;
      if (!actions?.length) {
        return;
      }

      const actionId = actions[0]!;
      if (actionId === "editorReset") {
        return;
      }

      e.preventDefault();
      executeEditorShortcut(actionId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
