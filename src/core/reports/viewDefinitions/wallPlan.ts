import type { Project } from "../../domain/project";
import type { ReportPrimitive } from "../types";

/**
 * Заглушка «План стен» — структура отчёта без геометрии модели.
 */
export function buildWallPlanPlaceholderWorld(_project: Project): {
  readonly primitives: readonly ReportPrimitive[];
  readonly worldBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  readonly messages: readonly string[];
} {
  return {
    primitives: [],
    worldBounds: null,
    messages: ["План стен в отчётах будет добавлен в следующей итерации."],
  };
}
