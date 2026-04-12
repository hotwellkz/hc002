import { getProfileById } from "./profileOps";
import type { Project } from "./project";
import { refreshCalculatedRoofPlaneOverhangMm } from "./roofCalculationPipeline";
import type { RoofPlaneEntity } from "./roofPlane";
import { isProfileUsableForRoofPlane } from "./roofPlane";
import { touchProjectMeta } from "./projectFactory";

export interface ManualRoofPlaneParamsInput {
  readonly angleDeg: number;
  readonly levelMm: number;
  readonly profileId: string;
}

/**
 * Обновляет параметры одной ручной плоскости крыши и пересчитывает свесы, если скат в расчёте кровли.
 * Скаты с `roofSystemId` сюда не передаются — их меняют через {@link replaceRectangleRoofSystemInProject}.
 */
export function applyManualRoofPlaneParamsInProject(
  project: Project,
  planeId: string,
  input: ManualRoofPlaneParamsInput,
): { readonly ok: true; readonly project: Project } | { readonly ok: false; readonly error: string } {
  const rp0 = project.roofPlanes.find((r) => r.id === planeId);
  if (!rp0) {
    return { ok: false, error: "Скат не найден." };
  }
  if (rp0.roofSystemId) {
    return { ok: false, error: "Этот скат создан генератором — используйте параметры всей крыши." };
  }
  const profileId = input.profileId.trim();
  if (!profileId) {
    return { ok: false, error: "Выберите профиль кровли." };
  }
  const profile = getProfileById(project, profileId);
  if (!profile || !isProfileUsableForRoofPlane(profile)) {
    return { ok: false, error: "Нужен профиль категории «крыша»." };
  }
  const angleDeg = Number(input.angleDeg);
  const levelMm = Number(input.levelMm);
  if (!Number.isFinite(angleDeg) || !Number.isFinite(levelMm)) {
    return { ok: false, error: "Угол и уровень должны быть числами." };
  }

  const now = new Date().toISOString();
  const tentative: Project = {
    ...project,
    roofPlanes: project.roofPlanes.map((r) =>
      r.id === planeId
        ? {
            ...r,
            angleDeg,
            levelMm,
            profileId,
            updatedAt: now,
          }
        : r,
    ),
  };
  const rpT = tentative.roofPlanes.find((r) => r.id === planeId)!;
  const rpRefreshed = refreshCalculatedRoofPlaneOverhangMm(tentative, rpT);
  const next: Project = touchProjectMeta({
    ...tentative,
    roofPlanes: tentative.roofPlanes.map((r) => (r.id === planeId ? rpRefreshed : r)),
  });
  return { ok: true, project: next };
}

export function roofPlaneGenerationMode(rp: RoofPlaneEntity): "generator" | "manual" {
  return rp.roofSystemId ? "generator" : "manual";
}
