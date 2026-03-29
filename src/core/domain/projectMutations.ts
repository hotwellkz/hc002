import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";

/**
 * Удаляет сущности по id из проекта; стены и проёмы — каскадно (проём на удалённой стене тоже удаляется).
 */
export function deleteEntitiesFromProject(project: Project, selectedIds: ReadonlySet<string>): Project {
  const wallsKept = project.walls.filter((w) => !selectedIds.has(w.id));
  const removedWallIds = new Set(project.walls.filter((w) => selectedIds.has(w.id)).map((w) => w.id));
  const openingsKept = project.openings.filter((o) => {
    if (selectedIds.has(o.id)) {
      return false;
    }
    if (removedWallIds.has(o.wallId)) {
      return false;
    }
    return true;
  });

  return touchProjectMeta({
    ...project,
    walls: wallsKept,
    openings: openingsKept,
  });
}
