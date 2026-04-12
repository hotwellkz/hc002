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

function insertRectangleRoofSystemIntoProject(
  project: Project,
  args: AddRectangleRoofSystemArgs,
  meta: { readonly systemId: string; readonly layerId: string; readonly createdAt: string; readonly updatedAt: string },
): Project {
  const slope0 = nextRoofPlaneSlopeIndex(project);
  const geom = buildRectangleRoofSystemGeometryMm({
    footprintCcWMm: args.footprintCcWMm,
    roofKind: args.roofKind,
    pitchDeg: args.pitchDeg,
    baseLevelMm: args.baseLevelMm,
    profileId: args.profileId,
    layerId: meta.layerId,
    roofSystemId: meta.systemId,
    ridgeAlong: args.ridgeAlong,
    monoDrainCardinal: args.monoDrainCardinal,
    slopeIndexStart: slope0,
    nowIso: meta.updatedAt,
  });

  const roofSystem: RoofSystemEntity = {
    id: meta.systemId,
    type: "roofSystem",
    layerId: meta.layerId,
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
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };

  const calcEntry: RoofAssemblyCalculation = {
    id: newEntityId(),
    createdAt: meta.updatedAt,
    updatedAt: meta.updatedAt,
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

/**
 * Добавляет в проект крышу из генератора: скаты, запись `RoofSystemEntity`, автоматический расчёт кровли (свесы).
 */
export function addRectangleRoofSystemToProject(project: Project, args: AddRectangleRoofSystemArgs): Project {
  const sysId = newEntityId();
  const now = new Date().toISOString();
  return insertRectangleRoofSystemIntoProject(project, args, {
    systemId: sysId,
    layerId: project.activeLayerId,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Перестраивает существующую крышу-генератор с тем же id и слоем; контур основания берётся из текущей сущности.
 */
export function replaceRectangleRoofSystemInProject(
  project: Project,
  systemId: string,
  args: Omit<AddRectangleRoofSystemArgs, "footprintCcWMm">,
): Project {
  const sys = project.roofSystems.find((s) => s.id === systemId);
  if (!sys || sys.type !== "roofSystem") {
    throw new Error("Крыша не найдена.");
  }
  const planeIds = new Set(sys.generatedPlaneIds);
  const updatedAt = new Date().toISOString();

  let stripped: Project = {
    ...project,
    roofPlanes: project.roofPlanes.filter((r) => !planeIds.has(r.id)),
    roofSystems: project.roofSystems.filter((s) => s.id !== systemId),
    roofAssemblyCalculations: project.roofAssemblyCalculations.filter(
      (c) => !c.roofPlaneIds.some((id) => planeIds.has(id)),
    ),
  };
  stripped = touchProjectMeta(stripped);

  const footprintCcWMm = sys.footprintMm.map((p) => ({ x: p.x, y: p.y }));

  return insertRectangleRoofSystemIntoProject(
    stripped,
    {
      ...args,
      footprintCcWMm,
    },
    {
      systemId: sys.id,
      layerId: sys.layerId,
      createdAt: sys.createdAt,
      updatedAt,
    },
  );
}
