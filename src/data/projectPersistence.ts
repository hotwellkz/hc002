import type { Project } from "@/core/domain/project";
import { createEmptyProject } from "@/core/domain/projectFactory";
import { projectToWire } from "@/core/io/projectWire";
import { tryGetFirestoreDb } from "@/firebase/app";
import { isFirebaseConfigured } from "@/firebase/config";
import { useAppStore } from "@/store/useAppStore";
import { initialProjectHistory } from "@/store/projectHistory";

import {
  createProjectInDb,
  getMostRecentProjectId,
  loadProjectById,
  updateProjectSnapshot,
} from "./projectFirestoreRepository";
import { getLastOpenedProjectId, setLastOpenedProjectId } from "./lastOpenedProjectId";

const DEBOUNCE_MS = 800;

let initStarted = false;
let autosaveSubscribed = false;
/** Пропуск автосохранения при первичной гидрации из Firestore. */
let isPersistenceHydrating = false;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushAutosave();
  }, DEBOUNCE_MS);
}

async function flushAutosave(): Promise<void> {
  if (isPersistenceHydrating) {
    return;
  }
  const db = tryGetFirestoreDb();
  const { persistenceReady, firestoreEnabled, currentProject } = useAppStore.getState();
  if (!db || !persistenceReady || !firestoreEnabled) {
    return;
  }
  const savedWire = projectToWire(currentProject);
  try {
    useAppStore.setState({ persistenceStatus: "saving" });
    await updateProjectSnapshot(db, currentProject);
    const now = useAppStore.getState().currentProject;
    const same = JSON.stringify(projectToWire(now)) === JSON.stringify(savedWire);
    useAppStore.setState({
      persistenceStatus: "saved",
      ...(same ? { dirty: false } : {}),
      lastError: null,
    });
  } catch (e) {
    console.error("[Firestore autosave]", e);
    useAppStore.setState({
      persistenceStatus: "error",
      lastError: e instanceof Error ? `Firestore: ${e.message}` : "Ошибка сохранения в Firestore",
    });
  }
}

function subscribeAutosave(): void {
  if (autosaveSubscribed) {
    return;
  }
  autosaveSubscribed = true;
  useAppStore.subscribe((state, prev) => {
    if (isPersistenceHydrating) {
      return;
    }
    if (!state.persistenceReady || !state.firestoreEnabled) {
      return;
    }
    if (state.currentProject === prev.currentProject) {
      return;
    }
    scheduleAutosave();
  });
}

/**
 * Стартовая загрузка: lastOpened → последний документ → новый проект в Firestore.
 */
export async function initProjectPersistence(): Promise<void> {
  if (initStarted) {
    return;
  }
  initStarted = true;

  if (!isFirebaseConfigured()) {
    console.warn("[SIP] Firebase не настроен: задайте VITE_FIREBASE_* в .env — проект только в памяти до обновления страницы.");
    useAppStore.setState({
      persistenceReady: true,
      firestoreEnabled: false,
      persistenceStatus: "idle",
      lastError: null,
    });
    subscribeAutosave();
    return;
  }

  const db = tryGetFirestoreDb();
  if (!db) {
    useAppStore.setState({
      persistenceReady: true,
      firestoreEnabled: false,
      persistenceStatus: "error",
      lastError: "Не удалось инициализировать Firestore.",
    });
    subscribeAutosave();
    return;
  }

  try {
    useAppStore.setState({ persistenceStatus: "loading" });
    isPersistenceHydrating = true;

    let project: Project | null = null;
    const lastId = getLastOpenedProjectId();
    if (lastId) {
      try {
        project = await loadProjectById(db, lastId);
      } catch (e) {
        console.warn("[Firestore] Не удалось загрузить lastOpenedProjectId:", e);
      }
    }
    if (!project) {
      const recentId = await getMostRecentProjectId(db);
      if (recentId) {
        try {
          project = await loadProjectById(db, recentId);
          if (project) {
            setLastOpenedProjectId(recentId);
          }
        } catch (e) {
          console.warn("[Firestore] Не удалось загрузить последний проект:", e);
        }
      }
    }
    if (!project) {
      project = createEmptyProject();
      await createProjectInDb(db, project);
      setLastOpenedProjectId(project.meta.id);
    } else {
      setLastOpenedProjectId(project.meta.id);
    }

    useAppStore.setState({
      currentProject: project,
      viewport2d: project.viewState.viewport2d,
      viewport3d: project.viewState.viewport3d,
      activeTab: project.viewState.activeTab,
      selectedEntityIds: [],
      dirty: false,
      history: initialProjectHistory,
      wallPlacementHistoryBaseline: null,
      pendingOpeningPlacementHistoryBaseline: null,
      wallMoveCopyHistoryBaseline: null,
      lengthChangeHistoryBaseline: null,
      persistenceReady: true,
      firestoreEnabled: true,
      persistenceStatus: "saved",
      lastError: null,
    });
  } catch (e) {
    console.error("[Firestore] Ошибка начальной загрузки:", e);
    const fallback = createEmptyProject();
    useAppStore.setState({
      currentProject: fallback,
      viewport2d: fallback.viewState.viewport2d,
      viewport3d: fallback.viewState.viewport3d,
      activeTab: fallback.viewState.activeTab,
      selectedEntityIds: [],
      dirty: false,
      history: initialProjectHistory,
      wallPlacementHistoryBaseline: null,
      pendingOpeningPlacementHistoryBaseline: null,
      wallMoveCopyHistoryBaseline: null,
      lengthChangeHistoryBaseline: null,
      persistenceReady: true,
      firestoreEnabled: true,
      persistenceStatus: "error",
      lastError: e instanceof Error ? `Firestore: ${e.message}` : "Ошибка загрузки проекта",
    });
  } finally {
    queueMicrotask(() => {
      isPersistenceHydrating = false;
    });
    subscribeAutosave();
  }
}
