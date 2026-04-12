import { newEntityId } from "./ids";
import type { Point2D } from "../geometry/types";
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

/** Профиль кровли с учётом переопределения свесов из `RoofSystemEntity`, если скат из генератора. */
export function mergeRoofProfileAssemblyForPlane(project: Project, rp: RoofPlaneEntity): RoofProfileAssembly | null {
  const profile = getProfileById(project, rp.profileId);
  if (!profile || profile.category !== "roof") {
    return null;
  }
  let asm = resolveRoofProfileAssembly(profile);
  if (rp.roofSystemId) {
    const sys = project.roofSystems.find((s) => s.id === rp.roofSystemId);
    if (sys) {
      asm = { ...asm, eaveOverhangMm: sys.eaveOverhangMm, sideOverhangMm: sys.sideOverhangMm };
    }
  }
  return asm;
}

export interface ApplyRoofCalculationInput {
  readonly project: Project;
  /** Идентификаторы выбранных скатов (roofPlane.id). */
  readonly roofPlaneIds: readonly string[];
}

export type ApplyRoofCalculationResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Допуск совпадения общего ребра двух скатов (мм): меньше — риск не найти стык после join и развести конёк свесами. */
export const ROOF_INTERNAL_JOIN_SHARED_EDGE_TOL_MM = 4;

/**
 * Рёбра четырёхугольника, совпадающие с другим скатом на том же слое: без свеса.
 * Иначе боковой свес к каждому полигону сдвигает общее ребро в противоположные стороны
 * (внешние нормали навстречу) → разъезд линии стыка и разная «длина» скатов в плане.
 *
 * `selfBaseQuad` — тот же базовый контур, от которого считается свес (immutable base), без повторного чтения
 * у сущности с уже «плавающим» planContourMm.
 */
export function collectInternalJoinEdgeIndicesForRoofBaseMm(
  project: Project,
  selfId: string,
  selfLayerId: string,
  selfBaseQuad: readonly Point2D[],
): Set<number> {
  const out = new Set<number>();
  if (selfBaseQuad.length !== 4) {
    return out;
  }
  for (const other of project.roofPlanes) {
    if (other.id === selfId || other.layerId !== selfLayerId) {
      continue;
    }
    const baseO = roofPlaneCalculationBasePolygonMm(other);
    if (baseO.length !== 4) {
      continue;
    }
    for (const { indexA } of roofQuadSharedEdgeIndexPairsMm(selfBaseQuad, baseO, ROOF_INTERNAL_JOIN_SHARED_EDGE_TOL_MM)) {
      out.add(indexA);
    }
  }
  return out;
}

function roofPlaneWithProfileOverhangMm(project: Project, rp: RoofPlaneEntity, asm: RoofProfileAssembly): RoofPlaneEntity | null {
  const base = roofPlaneCalculationBasePolygonMm(rp);
  const rpWithFrozenBase: RoofPlaneEntity = { ...rp, planContourBaseMm: base };
  const zeroIdx = collectInternalJoinEdgeIndicesForRoofBaseMm(project, rp.id, rp.layerId, base);
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
  const asm = mergeRoofProfileAssemblyForPlane(project, rp);
  if (!asm) {
    return rp;
  }
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
 * После «Соединить контур»: если в расчёте крыши только один из двух скатов стыка,
 * `refreshAllCalculatedRoofPlaneOverhangsInProject` обновит только его — второй останется без свесов профиля
 * и визуально «другой» по длине/высоте. Пересчитываем свесы для **обоих** id одним профилем (при совпадении profileId).
 */
export function refreshRoofOverhangForJoinPairInProject(project: Project, idA: string, idB: string): Project {
  const inAsm = (id: string) => project.roofAssemblyCalculations.some((c) => c.roofPlaneIds.includes(id));
  if (!inAsm(idA) && !inAsm(idB)) {
    return project;
  }
  const byId = new Map(project.roofPlanes.map((r) => [r.id, r] as const));
  const pa = byId.get(idA);
  const pb = byId.get(idB);
  if (!pa || !pb || pa.layerId !== pb.layerId) {
    return refreshAllCalculatedRoofPlaneOverhangsInProject(project);
  }
  if (pa.profileId !== pb.profileId) {
    return refreshAllCalculatedRoofPlaneOverhangsInProject(project);
  }
  const profile = getProfileById(project, pa.profileId);
  if (!profile || profile.category !== "roof") {
    return refreshAllCalculatedRoofPlaneOverhangsInProject(project);
  }
  const nextPlanes = project.roofPlanes.map((rp) => {
    if (rp.id !== idA && rp.id !== idB) {
      return rp;
    }
    const asm = mergeRoofProfileAssemblyForPlane(project, rp);
    return asm ? roofPlaneWithProfileOverhangMm(project, rp, asm) ?? rp : rp;
  });
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

  const profErrs = validateRoofProfileAssemblyForCalculation(resolveRoofProfileAssembly(profile));
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

  const roofPlanes = project.roofPlanes.map((rp) => {
    if (!sel.has(rp.id)) {
      return rp;
    }
    const merged = mergeRoofProfileAssemblyForPlane(project, rp);
    return merged ? roofPlaneWithProfileOverhangMm(project, rp, merged) ?? rp : rp;
  });

  const next: Project = {
    ...project,
    roofPlanes,
    roofAssemblyCalculations: [...kept, entry],
  };
  return { ok: true, project: touchProjectMeta(next) };
}
