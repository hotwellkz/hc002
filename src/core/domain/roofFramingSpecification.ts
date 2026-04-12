import { beamPlanThicknessAndVerticalFromOrientationMm } from "@/core/domain/floorBeamSection";
import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { RoofStrutEntity } from "@/core/domain/roofStrut";

export interface RoofStrutSpecificationRow {
  readonly id: string;
  readonly name: string;
  readonly lengthMm: number;
  readonly profileLabel: string;
}

function strutLengthMm(s: RoofStrutEntity): number {
  const dx = s.endPlanMm.x - s.startPlanMm.x;
  const dy = s.endPlanMm.y - s.startPlanMm.y;
  const dz = s.endElevationMm - s.startElevationMm;
  return Math.hypot(dx, dy, dz);
}

/** Строки для вкладки «Спецификация» — подкосы (MVP: длина и профиль). */
export function buildRoofStrutSpecificationRows(project: Project): readonly RoofStrutSpecificationRow[] {
  const out: RoofStrutSpecificationRow[] = [];
  for (const s of project.roofStruts) {
    const pr = getProfileById(project, s.profileId);
    const profileLabel = pr
      ? (() => {
          const { planThicknessMm, verticalMm } = beamPlanThicknessAndVerticalFromOrientationMm(pr, s.sectionOrientation);
          return `${pr.name} (${planThicknessMm}×${verticalMm} мм)`;
        })()
      : s.profileId;
    out.push({
      id: s.id,
      name: "Подкос",
      lengthMm: strutLengthMm(s),
      profileLabel,
    });
  }
  return out;
}
