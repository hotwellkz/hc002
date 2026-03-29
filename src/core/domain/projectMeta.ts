import type { ProjectUnits } from "./constants";

export interface ProjectMeta {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly units: ProjectUnits;
}
