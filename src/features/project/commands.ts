import { useAppStore } from "@/store/useAppStore";

/** Тонкий фасад над Zustand: UI и хоткеи вызывают команды, а не размазывают логику по компонентам. */
export const projectCommands = {
  createNew: (): void => {
    useAppStore.getState().createNewProject();
  },
  open: async (): Promise<void> => {
    await useAppStore.getState().openProject();
  },
  save: async (): Promise<void> => {
    await useAppStore.getState().saveProject();
  },
  bootstrapDemo: (): void => {
    useAppStore.getState().bootstrapDemo();
  },
  deleteSelected: (): void => {
    useAppStore.getState().deleteSelectedEntities();
  },
  /** Параметры окна: одно выделенное размещённое окно. */
  openSelectedWindowProperties: (): void => {
    const { selectedEntityIds, currentProject } = useAppStore.getState();
    if (selectedEntityIds.length !== 1) {
      return;
    }
    const id = selectedEntityIds[0]!;
    const o = currentProject.openings.find((x) => x.id === id);
    if (!o || o.kind !== "window" || o.wallId == null || o.offsetFromStartMm == null) {
      return;
    }
    useAppStore.getState().openWindowEditModal(id, "form");
  },
};
