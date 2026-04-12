import {
  computeAllRoofPlanesZAdjustMmByPlaneIdInProject,
  rawRoofZUpAtPlanPointMm,
} from "@/core/domain/roofGroupHeightAdjust";
import { computeLayerVerticalStack } from "@/core/domain/layerVerticalStack";
import { newEntityId } from "@/core/domain/ids";
import type { FloorBeamEntity } from "@/core/domain/floorBeam";
import { beamPlanThicknessAndVerticalMm } from "@/core/domain/floorBeamSection";
import { resolveFloorBeamCenterlineInPlan } from "@/core/domain/floorBeamGeometry";
import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import type { RoofPurlinEntity } from "@/core/domain/roofPurlin";
import type { RoofPostEntity } from "@/core/domain/roofPost";
import type { RoofRafterEntity } from "@/core/domain/roofRafter";
import type { RoofStrutEntity } from "@/core/domain/roofStrut";
import { generateRoofPurlinAndPosts } from "@/core/domain/roofPurlinPostGenerator";
import { generateRoofStrutsForPosts } from "@/core/domain/roofStrutGenerator";

import {
  clipSegmentToPolygon2dMm,
  closestPointOnRidgePolylineMm,
  distancePointToSegmentMm,
  floorBeamTopElevationMm,
  footPlanAlongDrainToRoofElevationMm,
  pointInPolygonOrNearBoundaryMm,
} from "./roofRafterGeometry";

/** Шаг расстановки по балкам перекрытия. */
export type RoofRafterBeamStepMode = "everyBoard" | "everyOtherBoard" | "allBoards";

/**
 * Параметры генерации (прогон и стойки; подкосы требуют стойки + прогон — включаются автоматически в UI).
 */
export interface RoofRafterGeneratorParams {
  readonly roofSystemId: string;
  readonly rafterProfileId: string;
  /** Задел: учитывать коньковый брус (поднимает линию опирания верха). */
  readonly ridgeBeamEnabled: boolean;
  readonly pairBothSlopes: boolean;
  readonly beamStep: RoofRafterBeamStepMode;
  readonly enablePosts: boolean;
  readonly enablePurlin: boolean;
  readonly enableStruts: boolean;
}

export interface RoofRafterGeneratorResult {
  readonly entities: readonly RoofRafterEntity[];
  readonly purlins: readonly RoofPurlinEntity[];
  readonly posts: readonly RoofPostEntity[];
  readonly struts: readonly RoofStrutEntity[];
  readonly warnings: readonly string[];
}

const RIDGE_BEAM_LIFT_STUB_MM = 40;

function layerBaseMm(project: Project, layerId: string, stack: ReturnType<typeof computeLayerVerticalStack>): number {
  return stack.get(layerId)?.computedBaseMm ?? project.layers.find((l) => l.id === layerId)?.elevationMm ?? 0;
}

function roofZAtPointMm(
  rp: RoofPlaneEntity,
  baseMm: number,
  zAdj: number,
  px: number,
  py: number,
): number {
  return rawRoofZUpAtPlanPointMm(rp, baseMm, px, py) + zAdj;
}

function beamMidpointMm(project: Project, beam: FloorBeamEntity): { readonly x: number; readonly y: number } | null {
  const cl = resolveFloorBeamCenterlineInPlan(project, beam);
  if (!cl) {
    return null;
  }
  return {
    x: (cl.centerStart.x + cl.centerEnd.x) * 0.5,
    y: (cl.centerStart.y + cl.centerEnd.y) * 0.5,
  };
}

function sortBeamsAcrossRidge(
  beams: readonly FloorBeamEntity[],
  project: Project,
  ridgeUnit: { readonly x: number; readonly y: number },
): FloorBeamEntity[] {
  const perp = { x: -ridgeUnit.y, y: ridgeUnit.x };
  const plen = Math.hypot(perp.x, perp.y);
  const px = plen > 1e-9 ? perp.x / plen : 1;
  const py = plen > 1e-9 ? perp.y / plen : 0;
  const scored = beams
    .map((b) => {
      const m = beamMidpointMm(project, b);
      const s = m ? m.x * px + m.y * py : 0;
      return { b, s };
    })
    .sort((a, b) => a.s - b.s);
  return scored.map((x) => x.b);
}

function passesBeamStep(index: number, mode: RoofRafterBeamStepMode): boolean {
  if (mode === "everyOtherBoard") {
    return index % 2 === 0;
  }
  return true;
}

/**
 * Генерирует стропила для двускатной крыши по выбранной `RoofSystemEntity` и доскам перекрытия проекта.
 */
export function generateRoofRaftersForProject(
  project: Project,
  params: RoofRafterGeneratorParams,
  nowIso: string,
): RoofRafterGeneratorResult {
  const warnings: string[] = [];
  const sys = project.roofSystems.find((s) => s.id === params.roofSystemId);
  if (!sys || sys.roofKind !== "gable") {
    warnings.push("Выберите двускатную крышу из генератора (roofKind=gable).");
    return { entities: [], purlins: [], posts: [], struts: [], warnings };
  }

  const planes = sys.generatedPlaneIds
    .map((id) => project.roofPlanes.find((p) => p.id === id))
    .filter((p): p is RoofPlaneEntity => p != null);
  if (planes.length < 2) {
    warnings.push("У крыши должно быть два ската (generatedPlaneIds).");
    return { entities: [], purlins: [], posts: [], struts: [], warnings };
  }
  const planeA = planes[0]!;
  const planeB = planes[1]!;

  const rafterProfile = getProfileById(project, params.rafterProfileId);
  if (!rafterProfile) {
    warnings.push("Не найден профиль стропил.");
    return { entities: [], purlins: [], posts: [], struts: [], warnings };
  }

  const footprint = sys.footprintMm;
  if (footprint.length < 3) {
    warnings.push("Некорректный контур основания крыши.");
    return { entities: [], purlins: [], posts: [], struts: [], warnings };
  }

  const ridgeSegs = sys.ridgeSegmentsPlanMm.map((s) => ({
    ax: s.ax,
    ay: s.ay,
    bx: s.bx,
    by: s.by,
  }));
  if (ridgeSegs.length === 0) {
    warnings.push("Нет отрезков конька в данных крыши.");
    return { entities: [], purlins: [], posts: [], struts: [], warnings };
  }

  const stack = computeLayerVerticalStack(project);
  const zAdjMap = computeAllRoofPlanesZAdjustMmByPlaneIdInProject(project, (lid) => layerBaseMm(project, lid, stack));

  const verticalById = stack;

  const ridgeUnit = sys.ridgeUnitPlan;
  const ruLen = Math.hypot(ridgeUnit.x, ridgeUnit.y);
  const ruN = ruLen > 1e-9 ? { x: ridgeUnit.x / ruLen, y: ridgeUnit.y / ruLen } : { x: 1, y: 0 };

  let floorBeams = project.floorBeams.filter((b) => {
    const cl = resolveFloorBeamCenterlineInPlan(project, b);
    if (!cl) {
      return false;
    }
    return (
      clipSegmentToPolygon2dMm(cl.centerStart.x, cl.centerStart.y, cl.centerEnd.x, cl.centerEnd.y, footprint) != null
    );
  });
  floorBeams = sortBeamsAcrossRidge(floorBeams, project, ruN);

  if (floorBeams.length === 0) {
    warnings.push("Нет досок перекрытия в контуре крыши (по центру балки).");
    return { entities: [], purlins: [], posts: [], struts: [], warnings };
  }

  const layerId = sys.layerId;
  const roofSystemId = sys.id;

  const out: RoofRafterEntity[] = [];

  let beamIndex = 0;
  for (const beam of floorBeams) {
    const stepOk = passesBeamStep(beamIndex, params.beamStep);
    beamIndex++;
    if (!stepOk) {
      continue;
    }

    const cl = resolveFloorBeamCenterlineInPlan(project, beam);
    if (!cl) {
      continue;
    }
    const clip = clipSegmentToPolygon2dMm(
      cl.centerStart.x,
      cl.centerStart.y,
      cl.centerEnd.x,
      cl.centerEnd.y,
      footprint,
    );
    if (!clip) {
      warnings.push(`Балка ${beam.id}: центрлиния не пересекает контур крыши, пропуск.`);
      continue;
    }
    const bx = (clip.sx + clip.ex) * 0.5;
    const by = (clip.sy + clip.ey) * 0.5;

    const q = closestPointOnRidgePolylineMm(ridgeSegs, bx, by);
    if (!q) {
      continue;
    }

    const zBeam = floorBeamTopElevationMm(project, beam, verticalById);
    if (zBeam == null) {
      continue;
    }

    const baseA = layerBaseMm(project, planeA.layerId, stack);
    const baseB = layerBaseMm(project, planeB.layerId, stack);
    const adjA = zAdjMap.get(planeA.id) ?? 0;
    const adjB = zAdjMap.get(planeB.id) ?? 0;

    const ridgeLift = params.ridgeBeamEnabled ? RIDGE_BEAM_LIFT_STUB_MM : 0;
    const zRidgeA = roofZAtPointMm(planeA, baseA, adjA, q.x, q.y) + ridgeLift;
    const zRidgeB = roofZAtPointMm(planeB, baseB, adjB, q.x, q.y) + ridgeLift;
    const zRidgeMin = Math.min(zRidgeA, zRidgeB);
    if (zBeam >= zRidgeMin - 2) {
      warnings.push(`Балка ${beam.id}: перекрытие слишком высоко относительно конька — пропуск.`);
      continue;
    }

    const profileBeam = getProfileById(project, beam.profileId);
    const planTh = profileBeam ? beamPlanThicknessAndVerticalMm(profileBeam, beam.sectionRolled).planThicknessMm : 100;
    const maxDist = planTh * 0.5 + Math.max(220, planTh * 0.35);

    const mkRafter = (
      plane: RoofPlaneEntity,
      base: number,
      zAdj: number,
      zRidgeAtPlane: number,
    ): { readonly rafter: RoofRafterEntity; readonly distBeamMm: number } | null => {
      const foot = footPlanAlongDrainToRoofElevationMm(plane, base, zAdj, q.x, q.y, zBeam);
      if (!foot) {
        return null;
      }
      const poly = roofPlanePolygonMm(plane);
      if (!pointInPolygonOrNearBoundaryMm(foot.x, foot.y, poly, 5)) {
        return null;
      }
      const dBeam = distancePointToSegmentMm(
        foot.x,
        foot.y,
        cl.centerStart.x,
        cl.centerStart.y,
        cl.centerEnd.x,
        cl.centerEnd.y,
      );
      if (dBeam > maxDist) {
        return null;
      }
      const id = newEntityId();
      return {
        distBeamMm: dBeam,
        rafter: {
          id,
          type: "roofRafter",
          layerId,
          roofSystemId,
          profileId: params.rafterProfileId,
          supportingFloorBeamId: beam.id,
          pairedRoofRafterId: null,
          roofPlaneId: plane.id,
          footPlanMm: { x: foot.x, y: foot.y },
          ridgePlanMm: { x: q.x, y: q.y },
          footElevationMm: zBeam,
          ridgeElevationMm: zRidgeAtPlane,
          sectionOrientation: "edge",
          sectionRolled: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      };
    };

    const rA = mkRafter(planeA, baseA, adjA, zRidgeA);
    const rB = mkRafter(planeB, baseB, adjB, zRidgeB);

    if (!rA && !rB) {
      warnings.push(`Балка ${beam.id}: не удалось построить стропило на скаты.`);
      continue;
    }

    if (params.pairBothSlopes) {
      if (rA && rB) {
        out.push(
          { ...rA.rafter, pairedRoofRafterId: rB.rafter.id },
          { ...rB.rafter, pairedRoofRafterId: rA.rafter.id },
        );
      } else if (rA) {
        out.push(rA.rafter);
      } else if (rB) {
        out.push(rB.rafter);
      }
    } else if (rA && rB) {
      out.push(rA.distBeamMm <= rB.distBeamMm ? rA.rafter : rB.rafter);
    } else if (rA) {
      out.push(rA.rafter);
    } else if (rB) {
      out.push(rB.rafter);
    }
  }

  let purlins: RoofPurlinEntity[] = [];
  let posts: RoofPostEntity[] = [];
  let struts: RoofStrutEntity[] = [];
  const wantPurlinPosts = params.enablePurlin || params.enablePosts;
  if (wantPurlinPosts) {
    const pp = generateRoofPurlinAndPosts(project, sys, planeA, planeB, stack, zAdjMap, floorBeams, params, nowIso);
    purlins = [...pp.purlins];
    posts = [...pp.posts];
    warnings.push(...pp.warnings);
  }

  if (params.enableStruts && posts.length > 0) {
    const st = generateRoofStrutsForPosts(
      project,
      sys,
      planeA,
      planeB,
      stack,
      zAdjMap,
      posts,
      out,
      params,
      nowIso,
    );
    struts = [...st.struts];
    warnings.push(...st.warnings);
  }

  return { entities: out, purlins, posts, struts, warnings };
}
