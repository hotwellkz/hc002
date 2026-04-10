import { projectCommands } from "@/features/project/commands";
import { useAppStore } from "@/store/useAppStore";

import type { EditorShortcutActionId } from "./editorShortcutActions";

/**
 * Выполняет действие по id. Вызывать только если `shouldIgnoreEditorToolHotkeys` уже вернул false.
 * `editorReset` сюда не передаётся — обрабатывается в `Editor2DWorkspace`.
 */
export function executeEditorShortcut(actionId: EditorShortcutActionId): void {
  const store = useAppStore.getState();
  switch (actionId) {
    case "toolSelect":
      store.setActiveTool("select");
      return;
    case "toolPan":
      store.setActiveTool("pan");
      return;
    case "toolChangeLengthToggle":
      store.setActiveTool(store.activeTool === "changeLength" ? "select" : "changeLength");
      return;
    case "toolRuler":
      store.setActiveTool("ruler");
      return;
    case "editSelectedObject":
      projectCommands.openSelectedObjectEditor();
      return;
    case "deleteSelected":
      if (store.selectedEntityIds.length === 0) {
        return;
      }
      projectCommands.deleteSelected();
      return;
    case "editorReset":
      return;
  }
}
