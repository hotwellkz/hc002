import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";

/** Удаляет неразмещённое окно-черновик при отмене режима установки. */
export function removeUnplacedWindowDraft(project: Project, draftOpeningId: string): Project {
  const openings = project.openings.filter((o) => !(o.id === draftOpeningId && o.wallId == null));
  return touchProjectMeta({ ...project, openings });
}
