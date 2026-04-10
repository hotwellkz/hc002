import type { Opening } from "./opening";
import type { Profile } from "./profile";
import { getProfileById } from "./profileOps";
import type { Project } from "./project";
import type { Wall } from "./wall";
import { resolveEffectiveWallManufacturing, resolveWallCalculationModel } from "./wallManufacturing";

/**
 * Для двери на стене с моделью «каркас / ГКЛ»:
 * `offsetFromStartMm` — левый край чистого проёма, `widthMm` — ширина чистого проёма;
 * стойки занимают полосы шириной T слева и справа от чистого проёма.
 */
export function isFrameGklDoorClearOpeningSemantics(wall: Wall, project: Project): boolean {
  if (!wall.profileId) {
    return false;
  }
  const prof = getProfileById(project, wall.profileId);
  if (!prof) {
    return false;
  }
  return resolveWallCalculationModel(prof) === "frame";
}

/** Толщина профиля каркаса вдоль стены (мм) для расчёта дверного проёма. */
export function frameDoorStudThicknessAlongWallMm(profile: Profile): number {
  return resolveEffectiveWallManufacturing(profile).jointBoardThicknessMm;
}

export function frameGklDoorRoughAlongSpanMm(
  clearLeftMm: number,
  clearWidthMm: number,
  studThicknessAlongWallMm: number,
): { readonly roughLo: number; readonly roughHi: number } {
  const T = studThicknessAlongWallMm;
  return {
    roughLo: clearLeftMm - T,
    roughHi: clearLeftMm + clearWidthMm + T,
  };
}

/** Занятый вдоль стены отрезок с учётом обкладки стойками (для клиппинга, пересечений). */
export function doorAlongWallOccupiedIntervalMm(
  o: Opening,
  wall: Wall,
  project: Project,
): { readonly lo: number; readonly hi: number } {
  const lo = o.offsetFromStartMm ?? 0;
  const hi = lo + o.widthMm;
  if (o.kind !== "door" || !isFrameGklDoorClearOpeningSemantics(wall, project) || wall.profileId == null) {
    return { lo, hi };
  }
  const prof = getProfileById(project, wall.profileId)!;
  const T = frameDoorStudThicknessAlongWallMm(prof);
  const { roughLo, roughHi } = frameGklDoorRoughAlongSpanMm(lo, o.widthMm, T);
  return { lo: roughLo, hi: roughHi };
}
