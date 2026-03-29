import type { Project } from "../domain/project";

import { projectFromWire, projectToWire } from "./projectWire";

export function serializeProject(project: Project): string {
  const wire = projectToWire(project);
  return JSON.stringify(wire, null, 2);
}

export function deserializeProject(json: string): Project {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Некорректный JSON проекта");
  }
  return projectFromWire(parsed as Record<string, unknown>);
}
