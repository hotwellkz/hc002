/**
 * Облачные проекты компании: Firestore meta + Storage (или встроенный JSON в Firestore) / mock localStorage.
 */

import {
  type Firestore,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadString } from "firebase/storage";

import type { Project } from "@/core/domain/project";
import { newEntityId } from "@/core/domain/ids";
import { createEmptyProject } from "@/core/domain/projectFactory";
import type { ProjectMeta } from "@/core/company/orgTypes";
import { tryGetFirestoreDb } from "@/firebase/app";
import { tryGetFirebaseStorage } from "@/firebase/storageClient";

import {
  buildCloudProjectFile,
  cloudProjectFileJsonString,
  parseCloudProjectFileJson,
  tryParseProjectFromUnknownJson,
} from "./cloudProjectPayload";

const MOCK_PREFIX = "housekit.projects.v1.";

function assertCompany(companyId: string, activeCompanyId: string | undefined | null): void {
  if (!activeCompanyId || activeCompanyId !== companyId) {
    throw new Error("Нет доступа к проектам этой компании.");
  }
}

function useFirebase(): boolean {
  return tryGetFirestoreDb() != null;
}

// ——— Mock ———

type MockEntry = { readonly meta: ProjectMeta; readonly json: string };

function mockRead(companyId: string): MockEntry[] {
  try {
    const raw = localStorage.getItem(MOCK_PREFIX + companyId);
    if (!raw) {
      return [];
    }
    const p = JSON.parse(raw) as { projects?: MockEntry[] };
    return Array.isArray(p.projects) ? p.projects : [];
  } catch {
    return [];
  }
}

function mockWrite(companyId: string, projects: MockEntry[]): void {
  localStorage.setItem(MOCK_PREFIX + companyId, JSON.stringify({ projects }));
}

// ——— Public API ———

export async function listProjects(companyId: string, activeCompanyId: string | undefined | null): Promise<ProjectMeta[]> {
  assertCompany(companyId, activeCompanyId);
  if (!useFirebase()) {
    return mockRead(companyId)
      .map((e) => e.meta)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const db = tryGetFirestoreDb() as Firestore;
  const snap = await getDocs(collection(db, "companies", companyId, "projects"));
  const list = snap.docs.map((d) => d.data() as ProjectMeta);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProject(
  companyId: string,
  userId: string,
  name: string,
  activeCompanyId: string | undefined | null,
): Promise<ProjectMeta> {
  assertCompany(companyId, activeCompanyId);
  const projectId = newEntityId();
  const now = new Date().toISOString();
  const base = createEmptyProject();
  const project: Project = {
    ...base,
    meta: {
      ...base.meta,
      id: projectId,
      name: name.trim() || "Новый проект",
      createdAt: now,
      updatedAt: now,
    },
  };

  const file = buildCloudProjectFile(project, userId);
  const json = cloudProjectFileJsonString(file);

  const meta: ProjectMeta = {
    id: projectId,
    companyId,
    name: project.meta.name,
    createdBy: userId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };

  if (!useFirebase()) {
    const storagePath = `companies/${companyId}/projects/${projectId}/project.json`;
    const fullMeta = { ...meta, storagePath };
    mockWrite(companyId, [...mockRead(companyId), { meta: fullMeta, json }]);
    return fullMeta;
  }

  const db = tryGetFirestoreDb() as Firestore;
  const storage = tryGetFirebaseStorage();
  const storagePath = `companies/${companyId}/projects/${projectId}/project.json`;

  if (storage) {
    await uploadString(ref(storage, storagePath), json, "raw", { contentType: "application/json" });
    await setDoc(doc(db, "companies", companyId, "projects", projectId), {
      ...meta,
      storagePath,
    });
  } else {
    await setDoc(doc(db, "companies", companyId, "projects", projectId), {
      ...meta,
      payloadJson: json,
    });
  }

  return storage ? { ...meta, storagePath } : meta;
}

export async function loadProject(
  companyId: string,
  projectId: string,
  activeCompanyId: string | undefined | null,
): Promise<{ meta: ProjectMeta; project: Project }> {
  assertCompany(companyId, activeCompanyId);

  if (!useFirebase()) {
    const row = mockRead(companyId).find((e) => e.meta.id === projectId);
    if (!row) {
      throw new Error("Проект не найден или у вас нет доступа.");
    }
    const project = tryParseProjectFromUnknownJson(row.json);
    return { meta: row.meta, project };
  }

  const db = tryGetFirestoreDb() as Firestore;
  const mref = doc(db, "companies", companyId, "projects", projectId);
  const ms = await getDoc(mref);
  if (!ms.exists()) {
    throw new Error("Проект не найден или у вас нет доступа.");
  }
  const meta = ms.data() as ProjectMeta & { payloadJson?: string };
  let json: string;
  const storage = tryGetFirebaseStorage();
  if (meta.storagePath && storage) {
    const bytes = await getBytes(ref(storage, meta.storagePath));
    json = new TextDecoder("utf-8").decode(bytes);
  } else if (meta.payloadJson != null && meta.payloadJson.length > 0) {
    json = meta.payloadJson;
  } else {
    throw new Error("Проект не найден или у вас нет доступа.");
  }
  const project = tryParseProjectFromUnknownJson(json);
  return { meta, project };
}

export async function saveProject(
  companyId: string,
  projectId: string,
  userId: string,
  project: Project,
  activeCompanyId: string | undefined | null,
): Promise<ProjectMeta> {
  assertCompany(companyId, activeCompanyId);
  if (project.meta.id !== projectId) {
    throw new Error("Идентификатор проекта не совпадает с облачным.");
  }

  const now = new Date().toISOString();
  const touched: Project = {
    ...project,
    meta: { ...project.meta, updatedAt: now },
  };
  const file = buildCloudProjectFile(touched, userId);
  const json = cloudProjectFileJsonString(file);

  if (!useFirebase()) {
    const rows = mockRead(companyId);
    const idx = rows.findIndex((e) => e.meta.id === projectId);
    if (idx < 0) {
      throw new Error("Проект не найден.");
    }
    const prev = rows[idx]!;
    const meta: ProjectMeta = {
      ...prev.meta,
      name: touched.meta.name,
      updatedAt: now,
      updatedBy: userId,
    };
    const next = [...rows];
    next[idx] = { meta, json };
    mockWrite(companyId, next);
    return meta;
  }

  const db = tryGetFirestoreDb() as Firestore;
  const mref = doc(db, "companies", companyId, "projects", projectId);
  const ms = await getDoc(mref);
  if (!ms.exists()) {
    throw new Error("Проект не найден.");
  }
  const prevMeta = ms.data() as ProjectMeta & { payloadJson?: string };
  const storage = tryGetFirebaseStorage();

  if (prevMeta.storagePath && storage) {
    await uploadString(ref(storage, prevMeta.storagePath), json, "raw", { contentType: "application/json" });
    const nextMeta: ProjectMeta = {
      ...prevMeta,
      name: touched.meta.name,
      updatedAt: now,
      updatedBy: userId,
    };
    await updateDoc(mref, {
      name: nextMeta.name,
      updatedAt: nextMeta.updatedAt,
      updatedBy: nextMeta.updatedBy,
      payloadJson: deleteField(),
    });
    return nextMeta;
  }

  const nextMeta: ProjectMeta = {
    ...prevMeta,
    name: touched.meta.name,
    updatedAt: now,
    updatedBy: userId,
  };
  await updateDoc(mref, {
    ...nextMeta,
    payloadJson: json,
  });
  return nextMeta;
}

export async function renameProject(
  companyId: string,
  projectId: string,
  name: string,
  activeCompanyId: string | undefined | null,
): Promise<void> {
  assertCompany(companyId, activeCompanyId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Введите название проекта.");
  }

  if (!useFirebase()) {
    const rows = mockRead(companyId);
    const idx = rows.findIndex((e) => e.meta.id === projectId);
    if (idx < 0) {
      return;
    }
    const row = rows[idx]!;
    const project = tryParseProjectFromUnknownJson(row.json);
    const nextProject: Project = {
      ...project,
      meta: { ...project.meta, name: trimmed, updatedAt: new Date().toISOString() },
    };
    const file = buildCloudProjectFile(nextProject, row.meta.updatedBy);
    const json = cloudProjectFileJsonString(file);
    const meta: ProjectMeta = { ...row.meta, name: trimmed, updatedAt: nextProject.meta.updatedAt };
    const copy = [...rows];
    copy[idx] = { meta, json };
    mockWrite(companyId, copy);
    return;
  }

  const db = tryGetFirestoreDb() as Firestore;
  const mref = doc(db, "companies", companyId, "projects", projectId);
  const ms = await getDoc(mref);
  if (!ms.exists()) {
    return;
  }
  const prevMeta = ms.data() as ProjectMeta & { payloadJson?: string };
  let project: Project;
  if (prevMeta.storagePath && tryGetFirebaseStorage()) {
    const bytes = await getBytes(ref(tryGetFirebaseStorage()!, prevMeta.storagePath));
    const json = new TextDecoder("utf-8").decode(bytes);
    project = parseCloudProjectFileJson(json);
  } else if (prevMeta.payloadJson) {
    project = parseCloudProjectFileJson(prevMeta.payloadJson);
  } else {
    return;
  }
  const nextProject: Project = {
    ...project,
    meta: { ...project.meta, name: trimmed, updatedAt: new Date().toISOString() },
  };
  const file = buildCloudProjectFile(nextProject, prevMeta.updatedBy);
  const json = cloudProjectFileJsonString(file);
  const storage = tryGetFirebaseStorage();
  if (prevMeta.storagePath && storage) {
    await uploadString(ref(storage, prevMeta.storagePath), json, "raw", { contentType: "application/json" });
    await updateDoc(mref, { name: trimmed, updatedAt: nextProject.meta.updatedAt });
  } else {
    await updateDoc(mref, {
      name: trimmed,
      updatedAt: nextProject.meta.updatedAt,
      payloadJson: json,
    });
  }
}

export async function deleteProject(
  companyId: string,
  projectId: string,
  activeCompanyId: string | undefined | null,
): Promise<void> {
  assertCompany(companyId, activeCompanyId);

  if (!useFirebase()) {
    mockWrite(
      companyId,
      mockRead(companyId).filter((e) => e.meta.id !== projectId),
    );
    return;
  }

  const db = tryGetFirestoreDb() as Firestore;
  const mref = doc(db, "companies", companyId, "projects", projectId);
  const ms = await getDoc(mref);
  if (ms.exists()) {
    const data = ms.data() as ProjectMeta & { payloadJson?: string };
    const storage = tryGetFirebaseStorage();
    if (data.storagePath && storage) {
      try {
        await deleteObject(ref(storage, data.storagePath));
      } catch {
        /* ignore */
      }
    }
    await deleteDoc(mref);
  }
}
