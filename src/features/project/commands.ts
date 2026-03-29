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
};
