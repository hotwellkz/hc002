import { newEntityId } from "./ids";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";
import type { Opening } from "./opening";
import type { WindowFormKey, WindowViewPresetKey } from "./windowFormCatalog";
import { windowFormName } from "./windowFormCatalog";

export interface AddWindowDraftPayload {
  readonly formKey: WindowFormKey;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly viewPreset: WindowViewPresetKey;
  readonly sillOverhangMm: number;
  readonly isEmptyOpening: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Добавляет в проект сущность окна без привязки к стене (этап 1).
 */
export function addUnplacedWindowToProject(project: Project, draft: AddWindowDraftPayload): { project: Project; openingId: string } {
  const t = nowIso();
  const id = newEntityId();
  const formKey = draft.formKey;
  const opening: Opening = {
    id,
    wallId: null,
    kind: "window",
    offsetFromStartMm: null,
    widthMm: draft.widthMm,
    heightMm: draft.heightMm,
    formKey,
    formName: windowFormName(formKey),
    isEmptyOpening: draft.isEmptyOpening,
    viewPreset: draft.viewPreset,
    sillOverhangMm: draft.sillOverhangMm,
    createdAt: t,
    updatedAt: t,
  };
  return {
    project: touchProjectMeta({
      ...project,
      openings: [...project.openings, opening],
    }),
    openingId: id,
  };
}
