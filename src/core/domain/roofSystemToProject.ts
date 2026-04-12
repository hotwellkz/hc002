import type { Point2D } from "../geometry/types";
import { newEntityId } from "./ids";
import { nextRoofPlaneSlopeIndex } from "./roofPlane";
import { refreshCalculatedRoofPlaneOverhangMm } from "./roofCalculationPipeline";
import type { RoofAssemblyCalculation } from "./roofAssemblyCalculation";
import type { Project } from "./project";
import type { RoofSystemEntity, RoofSystemKind } from "./roofSystem";
import { touchProjectMeta } from "./projectFactory";
import {
  buildRectangleRoofSystemGeometryMm,
  type MonoCardinalDrain,
  type RidgeAlongChoice,
} from "./roofSystemRectangleGeometry";

export interface AddRectangleRoofSystemArgs {
  readonly footprintCcWMm: readonly Point2D[];
  readonly roofKind: RoofSystemKind;
  readonly pitchDeg: number;
  readonly baseLevelMm: number;
  readonly profileId: string;
  readonly eaveOverhangMm: number;
  readonly sideOverhangMm: number;
  readonly ridgeAlong: RidgeAlongChoice;
  readonly monoDrainCardinal: MonoCardinalDrain;
}

/**
 * Добавляет в проект крышу из генератора: скаты, запись `RoofSystemEntity`, автоматический расчёт кровли (свесы).
 */
export function addRectangleRoofSystemToProject(project: Project, args: AddRectangleRoofSystemArgs): Project {
  const sysId = newEntityId();
  const now = new Date().toISOString();
  const slope0 = nextRoofPlaneSlopeIndex(project);
  const geom = buildRectangleRoofSystemGeometryMm({
    footprintCcWMm: args.footprintCcWMm,
    roofKind: args.roofKind,
    pitchDeg: args.pitchDeg,
    baseLevelMm: args.baseLevelMm,
    profileId: args.profileId,
    layerId: project.activeLayerId,
    roofSystemId: sysId,
    ridgeAlong: args.ridgeAlong,
    monoDrainCardinal: args.monoDrainCardinal,
    slopeIndexStart: slope0,
    nowIso: now,
  });

  const roofSystem: RoofSystemEntity = {
    id: sysId,
    type: "roofSystem",
    layerId: project.activeLayerId,
    roofKind: args.roofKind,
    footprintMm: args.footprintCcWMm.map((p) => ({ x: p.x, y: p.y })),
    profileId: args.profileId,
    pitchDeg: args.pitchDeg,
    baseLevelMm: args.baseLevelMm,
    eaveOverhangMm: args.eaveOverhangMm,
    sideOverhangMm: args.sideOverhangMm,
    ridgeUnitPlan: geom.ridgeUnitPlan,
    drainUnitPlan: geom.drainUnitPlan,
    ridgeAlong: args.ridgeAlong,
    generatedPlaneIds: geom.planes.map((p) => p.id),
    ridgeSegmentsPlanMm: geom.ridgeSegmentsPlanMm,
    createdAt: now,
    updatedAt: now,
  };

  const calcEntry: RoofAssemblyCalculation = {
    id: newEntityId(),
    createdAt: now,
    updatedAt: now,
    roofPlaneIds: geom.planes.map((p) => p.id),
  };

  let next: Project = touchProjectMeta({
    ...project,
    roofPlanes: [...project.roofPlanes, ...geom.planes],
    roofSystems: [...project.roofSystems, roofSystem],
    roofAssemblyCalculations: [...project.roofAssemblyCalculations, calcEntry],
  });

  const calcIds = new Set(calcEntry.roofPlaneIds);
  next = {
    ...next,
    roofPlanes: next.roofPlanes.map((rp) =>
      calcIds.has(rp.id) ? refreshCalculatedRoofPlaneOverhangMm(next, rp) : rp,
    ),
  };

  return touchProjectMeta(next);
}
