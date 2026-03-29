import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

import type { Project } from "@/core/domain/project";
import { projectFromWire, projectToWire, type ProjectFileV1 } from "@/core/io/projectWire";
import { validateProjectSchema } from "@/core/validation/validateProjectSchema";

export const PROJECTS_COLLECTION = "projects";

export interface FirestoreProjectDocument {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly payload: ProjectFileV1;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

function wireFromPayload(raw: unknown): ProjectFileV1 {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("payload проекта отсутствует или некорректен");
  }
  return raw as ProjectFileV1;
}

export async function createProjectInDb(db: Firestore, project: Project): Promise<void> {
  const wire = projectToWire(project);
  const { ok, errors } = validateProjectSchema(project);
  if (!ok) {
    throw new Error(errors?.map((e) => e.message).join("; ") ?? "Схема проекта не прошла проверку");
  }
  const ref = doc(db, PROJECTS_COLLECTION, project.meta.id);
  await setDoc(ref, {
    id: project.meta.id,
    name: project.meta.name,
    schemaVersion: project.meta.schemaVersion,
    payload: wire,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProjectSnapshot(db: Firestore, project: Project): Promise<void> {
  const wire = projectToWire(project);
  const { ok, errors } = validateProjectSchema(project);
  if (!ok) {
    throw new Error(errors?.map((e) => e.message).join("; ") ?? "Схема проекта не прошла проверку");
  }
  const ref = doc(db, PROJECTS_COLLECTION, project.meta.id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      id: project.meta.id,
      name: project.meta.name,
      schemaVersion: project.meta.schemaVersion,
      payload: wire,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await updateDoc(ref, {
    name: project.meta.name,
    schemaVersion: project.meta.schemaVersion,
    payload: wire,
    updatedAt: serverTimestamp(),
  });
}

export async function loadProjectById(db: Firestore, id: string): Promise<Project | null> {
  const ref = doc(db, PROJECTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data() as Partial<FirestoreProjectDocument>;
  const payload = wireFromPayload(data.payload);
  const project = projectFromWire(payload as unknown as Record<string, unknown>);
  const { ok, errors } = validateProjectSchema(project);
  if (!ok) {
    console.error("[Firestore] Проект не прошёл валидацию после загрузки:", errors);
    throw new Error("Загруженный проект не прошёл проверку схемы");
  }
  return project;
}

export async function getMostRecentProjectId(db: Firestore): Promise<string | null> {
  const q = query(collection(db, PROJECTS_COLLECTION), orderBy("updatedAt", "desc"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }
  const d = snap.docs[0]!;
  const id = d.data()["id"];
  return typeof id === "string" && id.length > 0 ? id : d.id;
}

export async function listProjectIdsRecentFirst(db: Firestore, max: number): Promise<readonly string[]> {
  const q = query(collection(db, PROJECTS_COLLECTION), orderBy("updatedAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const id = d.data()["id"];
    return typeof id === "string" && id.length > 0 ? id : d.id;
  });
}
