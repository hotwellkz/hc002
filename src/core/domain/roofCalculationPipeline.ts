import { newEntityId } from "./ids";
import type { Project } from "./project";
import { getProfileById } from "./profileOps";
import { countRoofPlaneConnectivityComponents } from "./roofCalculationConnectivity";
import type { RoofAssemblyCalculation } from "./roofAssemblyCalculation";
import type { RoofPlaneEntity } from "./roofPlane";
import {
  resolveRoofProfileAssembly,
  validateRoofProfileAssemblyForCalculation,
} from "./roofProfileAssembly";
import { touchProjectMeta } from "./projectFactory";

export interface ApplyRoofCalculationInput {
  readonly project: Project;
  /** Идентификаторы выбранных скатов (roofPlane.id). */
  readonly roofPlaneIds: readonly string[];
}

export type ApplyRoofCalculationResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Добавляет запись расчёта кровли по выбранным скатам: удаляет старые записи, пересекающиеся с выбором, затем добавляет новую.
 */
export function applyRoofCalculationToProject(input: ApplyRoofCalculationInput): ApplyRoofCalculationResult {
  const { project, roofPlaneIds } = input;
  const ids = [...new Set(roofPlaneIds)];
  if (ids.length === 0) {
    return { ok: false, errors: ["Выберите скаты для расчёта."] };
  }

  const planes: RoofPlaneEntity[] = [];
  for (const id of ids) {
    const rp = project.roofPlanes.find((r) => r.id === id);
    if (!rp) {
      return { ok: false, errors: ["Один из выбранных скатов не найден в проекте."] };
    }
    planes.push(rp);
  }

  const profileIds = new Set(planes.map((p) => p.profileId).filter(Boolean));
  if (profileIds.size !== 1) {
    return {
      ok: false,
      errors: [
        "Для одного расчёта крыши все выбранные скаты должны иметь один и тот же профиль кровли. Сейчас выбраны скаты с разными профилями.",
      ],
    };
  }
  const profileId = [...profileIds][0]!;
  const profile = getProfileById(project, profileId);
  if (!profile || profile.category !== "roof") {
    return { ok: false, errors: ["У ската не задан профиль категории «Кровля» или профиль не найден."] };
  }

  const asm = resolveRoofProfileAssembly(profile);
  const profErrs = validateRoofProfileAssemblyForCalculation(asm);
  if (profErrs.length > 0) {
    return { ok: false, errors: profErrs };
  }

  const comp = countRoofPlaneConnectivityComponents(planes);
  if (comp > 1) {
    return {
      ok: false,
      errors: [
        "Выбранные скаты не образуют одну связную крышу по контуру (нет общих стыков или зазор слишком большой). Соедините скаты или выберите одну группу.",
      ],
    };
  }

  const sel = new Set(ids);
  const kept = project.roofAssemblyCalculations.filter((c) => !c.roofPlaneIds.some((rid) => sel.has(rid)));
  const now = new Date().toISOString();
  const entry: RoofAssemblyCalculation = {
    id: newEntityId(),
    createdAt: now,
    updatedAt: now,
    roofPlaneIds: ids,
  };

  const next: Project = {
    ...project,
    roofAssemblyCalculations: [...kept, entry],
  };
  return { ok: true, project: touchProjectMeta(next) };
}
