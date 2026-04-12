import type { FloorBeamEntity } from "./floorBeam";
import { floorBeamRefLengthMm } from "./floorBeamLengthChangeGeometry";
import { isProfileUsableForFloorBeam } from "./floorBeamSection";
import { getProfileById } from "./profileOps";
import type { Project } from "./project";
import { resolveLinearStockMaxLengthMm } from "./profileLinearStock";

const EPS = 1e-3;

/**
 * Длина опорной линии балки превышает максимальную длину заготовки/сегмента для её профиля
 * (поле профиля или согласованный fallback). Для подсветки на плане перекрытия.
 */
export function floorBeamExceedsLinearStockLength(project: Project, beam: FloorBeamEntity): boolean {
  const profile = getProfileById(project, beam.profileId);
  if (!profile || !isProfileUsableForFloorBeam(profile)) {
    return false;
  }
  const L = floorBeamRefLengthMm(beam);
  const maxMm = resolveLinearStockMaxLengthMm(profile);
  return L > maxMm + EPS;
}
