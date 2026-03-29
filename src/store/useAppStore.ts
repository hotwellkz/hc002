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
import { createEmptyProject } from "@/core/domain/projectFactory";
import type { Project } from "@/core/domain/project";
import { deleteEntitiesFromProject } from "@/core/domain/projectMutations";
import type { EditorTab } from "@/core/domain/viewState";
import { deserializeProject } from "@/core/io/serialization";
import { pickAndLoadProject, saveProjectWithFallback } from "@/core/io/projectFile";
import { validateProjectSchema } from "@/core/validation/validateProjectSchema";

export type ActiveTool = "select" | "pan";

export interface UiPanelsState {
  readonly rightPropertiesOpen: boolean;
}

export interface UndoRedoSkeleton {
  readonly past: readonly Project[];
  readonly future: readonly Project[];
}

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
  readonly dirty: boolean;
  readonly lastError: string | null;
  readonly history: UndoRedoSkeleton;
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
}

export type AppStore = AppState & AppActions;

const initialHistory: UndoRedoSkeleton = { past: [], future: [] };

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
  const demo = createDemoProject();
  return {
    currentProject: demo,
    selectedEntityIds: [],
    activeTool: "select",
    viewport2d: demo.viewState.viewport2d,
    viewport3d: demo.viewState.viewport3d,
    activeTab: demo.viewState.activeTab,
    uiPanels: { rightPropertiesOpen: true },
    layerManagerOpen: false,
    layerParamsModalOpen: false,
    dirty: false,
    lastError: null,
    history: initialHistory,

    setSelectedEntityIds: (ids) => set({ selectedEntityIds: ids }),

    clearSelection: () => set({ selectedEntityIds: [] }),

    deleteSelectedEntities: () => {
      const { currentProject, selectedEntityIds } = get();
      if (selectedEntityIds.length === 0) {
        return;
      }
      const next = deleteEntitiesFromProject(currentProject, new Set(selectedEntityIds));
      set({
        currentProject: next,
        selectedEntityIds: [],
        dirty: true,
      });
    },

    setActiveTool: (tool) => set({ activeTool: tool }),

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
      set((s) => ({
        activeTab: tab,
        activeTool: tab === "2d" ? "select" : s.activeTool,
        currentProject: mergeViewState(s.currentProject, { activeTab: tab }),
        dirty: true,
      })),

    toggleRightPanel: () =>
      set((s) => ({
        uiPanels: { ...s.uiPanels, rightPropertiesOpen: !s.uiPanels.rightPropertiesOpen },
      })),

    markClean: () => set({ dirty: false }),

    undo: () => {
      /* skeleton */
    },
    redo: () => {
      /* skeleton */
    },

    getActiveLayerIdForNewEntities: () => get().currentProject.activeLayerId,

    createLayer: (input) => {
      const next = createLayerInProject(get().currentProject, input);
      set({ currentProject: next, selectedEntityIds: [], dirty: true, lastError: null });
    },

    goToPreviousLayer: () => {
      const id = getPreviousLayerId(get().currentProject);
      if (!id) {
        return;
      }
      const next = setActiveLayerId(get().currentProject, id);
      if (next) {
        set({ currentProject: next, selectedEntityIds: [], dirty: true });
      }
    },

    goToNextLayer: () => {
      const id = getNextLayerId(get().currentProject);
      if (!id) {
        return;
      }
      const next = setActiveLayerId(get().currentProject, id);
      if (next) {
        set({ currentProject: next, selectedEntityIds: [], dirty: true });
      }
    },

    deleteCurrentLayer: () => {
      const id = get().currentProject.activeLayerId;
      const next = deleteLayerAndEntities(get().currentProject, id);
      if (!next) {
        set({ lastError: "Нельзя удалить последний слой." });
        return;
      }
      set({ currentProject: next, selectedEntityIds: [], dirty: true, lastError: null });
    },

    setActiveLayer: (layerId) => {
      const next = setActiveLayerId(get().currentProject, layerId);
      if (next) {
        set({ currentProject: next, selectedEntityIds: [], dirty: true });
      }
    },

    updateLayer: (layerId, patch) => {
      const next = updateLayerInProject(get().currentProject, layerId, patch);
      set({ currentProject: next, dirty: true });
    },

    reorderLayerUp: (layerId) => {
      const next = reorderLayerRelative(get().currentProject, layerId, "up");
      set({ currentProject: next, dirty: true });
    },

    reorderLayerDown: (layerId) => {
      const next = reorderLayerRelative(get().currentProject, layerId, "down");
      set({ currentProject: next, dirty: true });
    },

    deleteLayerById: (layerId) => {
      const next = deleteLayerAndEntities(get().currentProject, layerId);
      if (!next) {
        set({ lastError: "Нельзя удалить последний слой." });
        return;
      }
      set({ currentProject: next, selectedEntityIds: [], dirty: true, lastError: null });
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
      set({ currentProject: next, dirty: true });
    },

    bootstrapDemo: () => {
      const p = createDemoProject();
      set({
        currentProject: p,
        viewport2d: p.viewState.viewport2d,
        viewport3d: p.viewState.viewport3d,
        activeTab: p.viewState.activeTab,
        dirty: false,
        lastError: null,
        selectedEntityIds: [],
        history: initialHistory,
        layerManagerOpen: false,
        layerParamsModalOpen: false,
      });
    },

    createNewProject: () => {
      const p = createEmptyProject();
      set({
        currentProject: p,
        viewport2d: p.viewState.viewport2d,
        viewport3d: p.viewState.viewport3d,
        activeTab: p.viewState.activeTab,
        dirty: false,
        lastError: null,
        selectedEntityIds: [],
        history: initialHistory,
        layerManagerOpen: false,
        layerParamsModalOpen: false,
      });
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
        history: initialHistory,
        layerManagerOpen: false,
        layerParamsModalOpen: false,
      });
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
          history: initialHistory,
          layerManagerOpen: false,
          layerParamsModalOpen: false,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка импорта";
        set({ lastError: msg });
      }
    },
  };
});

export function selectCanUndo(): boolean {
  return false;
}

export function selectCanRedo(): boolean {
  return false;
}

export function selectCanDeleteCurrentLayer(): boolean {
  return canDeleteLayer(useAppStore.getState().currentProject);
}
