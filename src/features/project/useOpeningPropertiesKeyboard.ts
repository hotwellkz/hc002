import { useEffect } from "react";

import { isEditableKeyboardTarget } from "@/shared/editableKeyboardTarget";
import { useAppStore } from "@/store/useAppStore";

import { projectCommands } from "./commands";

/**
 * Enter → открыть модалку параметров, если выбрано одно окно на стене (как двойной клик).
 */
export function useOpeningPropertiesKeyboard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Enter") {
        return;
      }
      if (isEditableKeyboardTarget(e.target)) {
        return;
      }
      const { selectedEntityIds, currentProject, windowEditModal, addWindowModalOpen, activeTab } =
        useAppStore.getState();
      if (activeTab !== "2d") {
        return;
      }
      if (windowEditModal != null || addWindowModalOpen) {
        return;
      }
      if (selectedEntityIds.length !== 1) {
        return;
      }
      const id = selectedEntityIds[0]!;
      const o = currentProject.openings.find((x) => x.id === id);
      if (!o || o.kind !== "window" || o.wallId == null || o.offsetFromStartMm == null) {
        return;
      }
      e.preventDefault();
      projectCommands.openSelectedWindowProperties();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
