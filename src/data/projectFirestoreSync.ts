import type { Project } from "@/core/domain/project";
import { tryGetFirestoreDb } from "@/firebase/app";

import { setLastOpenedProjectId } from "./lastOpenedProjectId";
import { updateProjectSnapshot } from "./projectFirestoreRepository";

/** Запись снимка в Firestore и обновление lastOpened (без зависимости от store). */
export async function syncProjectToFirestore(project: Project): Promise<void> {
  const db = tryGetFirestoreDb();
  if (!db) {
    return;
  }
  await updateProjectSnapshot(db, project);
  setLastOpenedProjectId(project.meta.id);
}
