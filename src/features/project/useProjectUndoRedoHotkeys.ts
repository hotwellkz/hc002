import { useEffect } from "react";

import { isEditableKeyboardTarget } from "@/shared/editableKeyboardTarget";
import { useAppStore } from "@/store/useAppStore";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || navigator.userAgent.includes("Mac");
}

/**
 * Глобальные Cmd/Ctrl+Z и повтор: не перехватываем в полях ввода и в окне настройки хоткеев.
 */
export function useProjectUndoRedoHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) {
        return;
      }
      const ui = useEditorShortcutsStore.getState();
      if (ui.shortcutsSettingsModalOpen || ui.shortcutRebindCaptureActive) {
        return;
      }
      if (isEditableKeyboardTarget(e.target)) {
        return;
      }
      if (e.altKey) {
        return;
      }
      const apple = isApplePlatform();
      const primaryMod = apple ? e.metaKey : e.ctrlKey;
      if (!primaryMod) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        useAppStore.getState().undo();
        return;
      }
      const redo = (key === "z" && e.shiftKey) || (!apple && key === "y" && !e.shiftKey);
      if (redo) {
        e.preventDefault();
        useAppStore.getState().redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
