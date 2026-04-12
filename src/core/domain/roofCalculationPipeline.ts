import { newEntityId } from "./ids";
import type { Project } from "./project";
import { getProfileById } from "./profileOps";
import { countRoofPlaneConnectivityComponents } from "./roofCalculationConnectivity";
import type { RoofAssemblyCalculation } from "./roofAssemblyCalculation";
import { updateRoofPlaneEntityAfterContourEdit } from "./roofContourJoin";
import {
  applyRoofProfileOverhangToPlanPolygonMm,
  roofQuadSharedEdgeIndexPairsMm,
} from "./roofOverhangGeometry";
import type { RoofPlaneEntity } from "./roofPlane";
import { roofPlaneCalculationBasePolygonMm } from "./roofPlane";
import {
  resolveRoofProfileAssembly,
  validateRoofProfileAssemblyForCalculation,
} from "./roofProfileAssembly";
import type { RoofProfileAssembly } from "./roofProfileAssembly";
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
 * Рёбра четырёхугольника, совпадающие с другим скатом на том же слое: без свеса.
 * Иначе боковой свес к каждому полигону сдвигает общее ребро в противоположные стороны
 * (внешние нормали навстречу) → разъезд линии стыка и разная «длина» скатов в плане.
 */
function collectInternalJoinEdgeIndicesForRoofPlaneMm(project: Project, rp: RoofPlaneEntity): Set<number> {
  const out = new Set<number>();
  const baseSelf = roofPlaneCalculationBasePolygonMm(rp);
  if (baseSelf.length !== 4) {
    return out;
  }
  for (const other of project.roofPlanes) {
    if (other.id === rp.id || other.layerId !== rp.layerId) {
      continue;
    }
    const baseO = roofPlaneCalculationBasePolygonMm(other);
    if (baseO.length !== 4) {
      continue;
    }
    for (const { indexA } of roofQuadSharedEdgeIndexPairsMm(baseSelf, baseO)) {
      out.add(indexA);
    }
  }
  return out;
}

function roofPlaneWithProfileOverhangMm(project: Project, rp: RoofPlaneEntity, asm: RoofProfileAssembly): RoofPlaneEntity | null {
  const base = roofPlaneCalculationBasePolygonMm(rp);
  const rpWithFrozenBase: RoofPlaneEntity = { ...rp, planContourBaseMm: base };
  const zeroIdx = collectInternalJoinEdgeIndicesForRoofPlaneMm(project, rp);
  const expanded = applyRoofProfileOverhangToPlanPolygonMm(
    base,
    rp.slopeDirection,
    asm.eaveOverhangMm,
    asm.sideOverhangMm,
    { zeroOffsetEdgeIndices: zeroIdx },
  );
  return updateRoofPlaneEntityAfterContourEdit(rpWithFrozenBase, expanded, { updateBaseContour: false });
}

/** Пересобрать расчётный контур (свесы) по профилю для ската, уже попавшего в расчёт крыши. */
export function refreshCalculatedRoofPlaneOverhangMm(project: Project, rp: RoofPlaneEntity): RoofPlaneEntity {
  const inCalc = project.roofAssemblyCalculations.some((c) => c.roofPlaneIds.includes(rp.id));
  if (!inCalc) {
    return rp;
  }
  const profile = getProfileById(project, rp.profileId);
  if (!profile || profile.category !== "roof") {
    return rp;
  }
  const asm = resolveRoofProfileAssembly(profile);
  return roofPlaneWithProfileOverhangMm(project, rp, asm) ?? rp;
}

/** Обновить свесы у всех скатов, участвующих в любом расчёте крыши (после правки базового контура). */
export function refreshAllCalculatedRoofPlaneOverhangsInProject(project: Project): Project {
  const ids = new Set(project.roofAssemblyCalculations.flatMap((c) => [...c.roofPlaneIds]));
  if (ids.size === 0) {
    return project;
  }
  const nextPlanes = project.roofPlanes.map((p) => (ids.has(p.id) ? refreshCalculatedRoofPlaneOverhangMm(project, p) : p));
  return { ...project, roofPlanes: nextPlanes };
}

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

  const roofPlanes = project.roofPlanes.map((rp) =>
    sel.has(rp.id) ? roofPlaneWithProfileOverhangMm(project, rp, asm) ?? rp : rp,
  );

  const next: Project = {
    ...project,
    roofPlanes,
    roofAssemblyCalculations: [...kept, entry],
  };
  return { ok: true, project: touchProjectMeta(next) };
}
