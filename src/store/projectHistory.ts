import type { Project } from "@/core/domain/project";

import { deserializeProject, serializeProject } from "@/core/io/serialization";

/** Разумный предел стека, чтобы не раздувать память (снимки через JSON). */
export const PROJECT_HISTORY_LIMIT = 80;

export interface ProjectHistoryStacks {
  readonly past: readonly Project[];
  readonly future: readonly Project[];
}

export const initialProjectHistory: ProjectHistoryStacks = { past: [], future: [] };

export function cloneProjectSnapshot(project: Project): Project {
  return deserializeProject(serializeProject(project));
}

export function projectsModelEqual(a: Project, b: Project): boolean {
  return serializeProject(a) === serializeProject(b);
}

/** Навигация (зум, панорама, вкладка) не откатывается — подмешиваем текущее состояние из UI. */
export function mergeLiveNavigationIntoProject(
  project: Project,
  live: {
    readonly viewport2d: Project["viewState"]["viewport2d"];
    readonly viewport3d: Project["viewState"]["viewport3d"];
    readonly activeTab: Project["viewState"]["activeTab"];
  },
): Project {
  return {
    ...project,
    viewState: {
      ...project.viewState,
      viewport2d: live.viewport2d,
      viewport3d: live.viewport3d,
      activeTab: live.activeTab,
    },
  };
}

export function appendPastClearFuture(
  history: ProjectHistoryStacks,
  beforeMutation: Project,
): ProjectHistoryStacks {
  const past = [...history.past, beforeMutation];
  const capped = past.length > PROJECT_HISTORY_LIMIT ? past.slice(-PROJECT_HISTORY_LIMIT) : past;
  return { past: capped, future: [] };
}

export function capFutureFront(future: readonly Project[]): readonly Project[] {
  return future.length > PROJECT_HISTORY_LIMIT ? future.slice(0, PROJECT_HISTORY_LIMIT) : future;
}

/** Id сущностей, которые могут быть в выделении 2D. */
export function filterSelectionToExistingProjectIds(
  ids: readonly string[],
  project: Project,
): string[] {
  const wall = new Set(project.walls.map((w) => w.id));
  const op = new Set(project.openings.map((o) => o.id));
  const lines = new Set(project.planLines.map((l) => l.id));
  const dims = new Set(project.dimensions.map((d) => d.id));
  return ids.filter((id) => wall.has(id) || op.has(id) || lines.has(id) || dims.has(id));
}
