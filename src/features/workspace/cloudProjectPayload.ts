import type { Project } from "@/core/domain/project";
import { projectFromWire, projectToWire, type ProjectFileV1 } from "@/core/io/projectWire";

export const CLOUD_PROJECT_APP_NAME = "HouseKit Pro" as const;

/** Обёртка project.json в облаке (Storage или Firestore). */
export interface CloudProjectFile {
  readonly schemaVersion: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly app: typeof CLOUD_PROJECT_APP_NAME;
  readonly project: ProjectFileV1;
}

export function buildCloudProjectFile(project: Project, savedBy: string): CloudProjectFile {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    savedAt: now,
    savedBy,
    app: CLOUD_PROJECT_APP_NAME,
    project: projectToWire(project),
  };
}

export function parseCloudProjectFileJson(json: string): Project {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Некорректный JSON проекта");
  }
  const o = raw as Record<string, unknown>;
  const sv = o["schemaVersion"];
  if (sv !== 1 && sv !== undefined) {
    console.warn("[HouseKit] Неизвестная schemaVersion облачного файла:", sv);
  }
  const proj = o["project"];
  if (proj == null) {
    throw new Error("В файле нет поля project");
  }
  if (o["app"] !== CLOUD_PROJECT_APP_NAME) {
    console.warn("[HouseKit] Поле app отличается от HouseKit Pro, пробуем загрузить project");
  }
  return projectFromWire(proj as Record<string, unknown>);
}

export function cloudProjectFileJsonString(file: CloudProjectFile): string {
  return JSON.stringify(file, null, 0);
}

/** Для обратной совместимости: сырой ProjectFileV1 без обёртки. */
export function tryParseProjectFromUnknownJson(json: string): Project {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Некорректный JSON");
  }
  const o = raw as Record<string, unknown>;
  if (o["project"] != null && o["app"] === CLOUD_PROJECT_APP_NAME) {
    return parseCloudProjectFileJson(json);
  }
  return projectFromWire(raw as Record<string, unknown>);
}
