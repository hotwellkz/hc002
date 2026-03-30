import { getProfileById } from "./profileOps";
import type { Project } from "./project";
import type { WallCalculationStage3Options } from "./wallCalculation";
import { buildWallCalculationForWall, SipWallLayoutError } from "./sipWallLayout";
import { touchProjectMeta } from "./projectFactory";

/**
 * Пересчёт расчёта стены после изменения проёма / обрамления (локально, только если расчёт уже был).
 */
export function recalculateWallCalculationIfPresent(project: Project, wallId: string): Project {
  const existing = project.wallCalculations.find((c) => c.wallId === wallId);
  if (!existing) {
    return project;
  }
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall || !wall.profileId) {
    return {
      ...project,
      wallCalculations: project.wallCalculations.filter((c) => c.wallId !== wallId),
    };
  }
  const prof = getProfileById(project, wall.profileId);
  if (!prof) {
    return project;
  }
  const options: WallCalculationStage3Options = {
    includeOpeningFraming: existing.settingsSnapshot.stage3OpeningFraming !== false,
    includeWallConnectionElements: existing.settingsSnapshot.stage3WallConnections !== false,
  };
  try {
    const next = buildWallCalculationForWall(wall, prof, {
      openings: project.openings,
      wallJoints: project.wallJoints,
      skipAutoOpeningFramingForOpeningIds: new Set(project.openingFramingPieces.map((p) => p.openingId)),
      options,
    });
    return touchProjectMeta({
      ...project,
      wallCalculations: [...project.wallCalculations.filter((c) => c.wallId !== wallId), next],
    });
  } catch {
    return project;
  }
}

export function recalculateWallCalculationStrict(
  project: Project,
  wallId: string,
): { readonly project: Project } | { readonly error: string } {
  const existing = project.wallCalculations.find((c) => c.wallId === wallId);
  if (!existing) {
    return { project };
  }
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall || !wall.profileId) {
    return {
      project: {
        ...project,
        wallCalculations: project.wallCalculations.filter((c) => c.wallId !== wallId),
      },
    };
  }
  const prof = getProfileById(project, wall.profileId);
  if (!prof) {
    return { error: "Профиль стены не найден — пересчёт SIP невозможен." };
  }
  const options: WallCalculationStage3Options = {
    includeOpeningFraming: existing.settingsSnapshot.stage3OpeningFraming !== false,
    includeWallConnectionElements: existing.settingsSnapshot.stage3WallConnections !== false,
  };
  try {
    const next = buildWallCalculationForWall(wall, prof, {
      openings: project.openings,
      wallJoints: project.wallJoints,
      skipAutoOpeningFramingForOpeningIds: new Set(project.openingFramingPieces.map((p) => p.openingId)),
      options,
    });
    return {
      project: touchProjectMeta({
        ...project,
        wallCalculations: [...project.wallCalculations.filter((c) => c.wallId !== wallId), next],
      }),
    };
  } catch (e) {
    const msg = e instanceof SipWallLayoutError ? e.message : "Ошибка пересчёта SIP стены.";
    return { error: msg };
  }
}
