import type { Project } from "../domain/project";
import type { ReportDefinition, ReportReadiness, ReportStatus } from "./types";
import { buildFoundationPlanWorld } from "./viewDefinitions/foundationPlan";

function hasMinimal3dCoverContent(project: Project): boolean {
  return (
    project.walls.length > 0 ||
    project.slabs.length > 0 ||
    project.roofPlanes.length > 0 ||
    project.foundationStrips.length > 0 ||
    project.foundationPiles.length > 0 ||
    project.floorBeams.length > 0
  );
}

function statusRank(s: ReportStatus): number {
  switch (s) {
    case "blocked":
      return 0;
    case "warning":
      return 1;
    case "ready":
      return 2;
    case "soon":
      return 3;
    default: {
      const _e: never = s;
      return _e;
    }
  }
}

function mergeStatus(a: ReportStatus, b: ReportStatus): ReportStatus {
  return statusRank(a) < statusRank(b) ? a : b;
}

/** Готовность отчёта по текущей модели (без компиляции PDF). */
export function evaluateReportReadiness(project: Project, definition: ReportDefinition): ReportReadiness {
  if (!definition.implemented) {
    return { status: "soon", messages: [] };
  }

  if (definition.viewKind === "foundation_plan") {
    const built = buildFoundationPlanWorld(project);
    if (built.worldBounds == null) {
      return {
        status: "blocked",
        messages: built.messages.length > 0 ? built.messages : ["Нет данных для плана фундамента."],
      };
    }
    const msgs = [...built.messages];
    let st: ReportStatus = "ready";
    if (!built.hasFoundationData) {
      st = mergeStatus(st, "warning");
      if (!msgs.some((m) => m.includes("стен"))) {
        msgs.push("Используется контур по стенам — проверьте соответствие фундаменту.");
      }
    }
    if (built.usedWallFallback) {
      st = mergeStatus(st, "warning");
    }
    return { status: st, messages: msgs };
  }

  if (definition.viewKind === "wall_plan") {
    return { status: "soon", messages: ["Отчёт в разработке."] };
  }

  if (definition.viewKind === "project_cover_3d") {
    if (!hasMinimal3dCoverContent(project)) {
      return {
        status: "blocked",
        messages: ["Нет элементов модели для 3D-обложки (стены, перекрытия, крыша, фундамент и т.д.)."],
      };
    }
    return {
      status: "ready",
      messages: [
        "Презентационный лист: не использовать для размеров и производства. Технические листы — из 2D/3D модели.",
      ],
    };
  }

  return { status: "blocked", messages: ["Неизвестный тип отчёта."] };
}
