import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { EditorShortcutActionId } from "@/shared/editorToolShortcuts/editorShortcutActions";
import type { EditorShortcutCustomMap } from "@/shared/editorToolShortcuts/resolveEditorShortcutCodes";

const STORAGE_KEY = "sip-hd-editor-shortcuts-v1";

interface EditorShortcutsState {
  readonly customCodes: EditorShortcutCustomMap;
  readonly shortcutsSettingsModalOpen: boolean;
  readonly shortcutRebindCaptureActive: boolean;
  openShortcutsSettings: () => void;
  closeShortcutsSettings: () => void;
  setShortcutRebindCaptureActive: (active: boolean) => void;
  setCustomShortcutCode: (actionId: EditorShortcutActionId, code: string | null) => void;
  clearCustomShortcut: (actionId: EditorShortcutActionId) => void;
  resetShortcutsToDefaults: () => void;
}

export const useEditorShortcutsStore = create<EditorShortcutsState>()(
  persist(
    (set) => ({
      customCodes: {},
      shortcutsSettingsModalOpen: false,
      shortcutRebindCaptureActive: false,
      openShortcutsSettings: () => set({ shortcutsSettingsModalOpen: true }),
      closeShortcutsSettings: () =>
        set({ shortcutsSettingsModalOpen: false, shortcutRebindCaptureActive: false }),
      setShortcutRebindCaptureActive: (active) => set({ shortcutRebindCaptureActive: active }),
      setCustomShortcutCode: (actionId, code) =>
        set((s) => ({
          customCodes: { ...s.customCodes, [actionId]: code },
        })),
      clearCustomShortcut: (actionId) =>
        set((s) => {
          const next = { ...s.customCodes };
          delete next[actionId];
          return { customCodes: next };
        }),
      resetShortcutsToDefaults: () => set({ customCodes: {} }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ customCodes: s.customCodes }),
    },
  ),
);
