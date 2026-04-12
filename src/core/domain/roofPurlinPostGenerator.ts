import { beamPlanThicknessAndVerticalFromOrientationMm } from "@/core/domain/floorBeamSection";
import { resolveFloorBeamCenterlineInPlan } from "@/core/domain/floorBeamGeometry";
import type { FloorBeamEntity } from "@/core/domain/floorBeam";
import { newEntityId } from "@/core/domain/ids";
import { rawRoofZUpAtPlanPointMm } from "@/core/domain/roofGroupHeightAdjust";
import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import type { RoofPurlinEntity } from "@/core/domain/roofPurlin";
import type { RoofPostEntity } from "@/core/domain/roofPost";
import type { RoofSystemEntity } from "@/core/domain/roofSystem";
import type { Point2D } from "@/core/geometry/types";
import { computeLayerVerticalStack, type LayerVerticalSlice } from "@/core/domain/layerVerticalStack";

import {
  clipSegmentToPolygon2dMm,
  closestPointOnRidgePolylineMm,
  distancePointToSegmentMm,
  floorBeamTopElevationMm,
} from "./roofRafterGeometry";
import type { RoofRafterGeneratorParams } from "./roofRafterGenerator";

const RIDGE_BEAM_LIFT_STUB_MM = 40;

/** Шаг по опорным балкам перекрытия: 0, N, 2N, … */
export const ROOF_POST_STRIDE_FROM_BEAMS = 3;

/** Макс. смещение в плане (мм) от центра балки до точки под коньком — иначе стойка «висит» мимо опоры. */
const POST_MAX_PLAN_OFFSET_FROM_BEAM_MM = 1400;

/** Минимальный зазор в плане между стойками (мм), чтобы не дублировать близкие точки. */
const POST_MIN_PLAN_SPACING_MM = 350;

/** Зазор от расчётной линии конька вниз до оси прогона (мм): прогон ниже зоны опирания стропил на коньке. */
const PURLIN_AXIS_DROP_BELOW_RIDGE_MM = 90;

type LayerStack = ReadonlyMap<string, LayerVerticalSlice>;

function layerBaseMm(project: Project, layerId: string, stack: LayerStack): number {
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

function ridgePolylineFromSegments(
  segs: readonly { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number }[],
): Point2D[] {
  if (segs.length === 0) {
    return [];
  }
  const pts: Point2D[] = [{ x: segs[0]!.ax, y: segs[0]!.ay }];
  for (const s of segs) {
    pts.push({ x: s.bx, y: s.by });
  }
  const out: Point2D[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5) {
      out.push(p);
    }
  }
  return out;
}

function zRidgeAtPointMm(
  planeA: RoofPlaneEntity,
  planeB: RoofPlaneEntity,
  baseA: number,
  baseB: number,
  adjA: number,
  adjB: number,
  px: number,
  py: number,
  ridgeLiftMm: number,
): number {
  const zA = roofZAtPointMm(planeA, baseA, adjA, px, py) + ridgeLiftMm;
  const zB = roofZAtPointMm(planeB, baseB, adjB, px, py) + ridgeLiftMm;
  return Math.min(zA, zB);
}

/**
 * Прогон вдоль конька и стойки под ним (MVP: профиль как у стропил, шаг стоек по балкам).
 */
export function generateRoofPurlinAndPosts(
  project: Project,
  sys: RoofSystemEntity,
  planeA: RoofPlaneEntity,
  planeB: RoofPlaneEntity,
  stack: ReturnType<typeof computeLayerVerticalStack>,
  zAdjMap: ReadonlyMap<string, number>,
  floorBeamsInRoof: readonly FloorBeamEntity[],
  params: RoofRafterGeneratorParams,
  nowIso: string,
): { readonly purlins: readonly RoofPurlinEntity[]; readonly posts: readonly RoofPostEntity[]; readonly warnings: string[] } {
  const warnings: string[] = [];
  const profile = getProfileById(project, params.rafterProfileId);
  if (!profile) {
    warnings.push("Прогон/стойки: нет профиля.");
    return { purlins: [], posts: [], warnings };
  }
  const { planThicknessMm: pTh, verticalMm: pVert } = beamPlanThicknessAndVerticalFromOrientationMm(profile, "edge");
  if (!(pTh > 0) || !(pVert > 0)) {
    return { purlins: [], posts: [], warnings };
  }

  const baseA = layerBaseMm(project, planeA.layerId, stack);
  const baseB = layerBaseMm(project, planeB.layerId, stack);
  const adjA = zAdjMap.get(planeA.id) ?? 0;
  const adjB = zAdjMap.get(planeB.id) ?? 0;
  const ridgeLift = params.ridgeBeamEnabled ? RIDGE_BEAM_LIFT_STUB_MM : 0;

  const ridgeSegs = sys.ridgeSegmentsPlanMm.map((s) => ({
    ax: s.ax,
    ay: s.ay,
    bx: s.bx,
    by: s.by,
  }));
  const poly = ridgePolylineFromSegments(ridgeSegs);
  if (poly.length < 2) {
    warnings.push("Прогон: недостаточно точек конька.");
    return { purlins: [], posts: [], warnings };
  }

  const vertexAxisElevationMm = poly.map((p) => {
    const zR = zRidgeAtPointMm(planeA, planeB, baseA, baseB, adjA, adjB, p.x, p.y, ridgeLift);
    return zR - PURLIN_AXIS_DROP_BELOW_RIDGE_MM - pVert * 0.5;
  });

  const purlinId = newEntityId();
  const purlin: RoofPurlinEntity = {
    id: purlinId,
    type: "roofPurlin",
    layerId: sys.layerId,
    roofSystemId: sys.id,
    profileId: params.rafterProfileId,
    polylinePlanMm: poly,
    vertexAxisElevationMm,
    sectionOrientation: "edge",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const footprint = sys.footprintMm;
  const ridgeSegsForClosest = ridgeSegs;
  const posts: RoofPostEntity[] = [];
  const verticalById = stack;
  const placedPlan: { readonly x: number; readonly y: number }[] = [];

  const tryAddPostAtBeamAndRidge = (beam: FloorBeamEntity, qx: number, qy: number, zBeam: number): void => {
    const cl = resolveFloorBeamCenterlineInPlan(project, beam);
    if (!cl) {
      return;
    }
    const clip = clipSegmentToPolygon2dMm(
      cl.centerStart.x,
      cl.centerStart.y,
      cl.centerEnd.x,
      cl.centerEnd.y,
      footprint,
    );
    if (!clip) {
      return;
    }
    const dBeamRidge = distancePointToSegmentMm(qx, qy, clip.sx, clip.sy, clip.ex, clip.ey);
    if (dBeamRidge > POST_MAX_PLAN_OFFSET_FROM_BEAM_MM) {
      return;
    }
    if (placedPlan.some((p) => Math.hypot(p.x - qx, p.y - qy) < POST_MIN_PLAN_SPACING_MM)) {
      return;
    }
    const zR = zRidgeAtPointMm(planeA, planeB, baseA, baseB, adjA, adjB, qx, qy, ridgeLift);
    const zPurlinAxis = zR - PURLIN_AXIS_DROP_BELOW_RIDGE_MM - pVert * 0.5;
    const zPurlinBottom = zPurlinAxis - pVert * 0.5;
    const zPostTop = zPurlinBottom - 1;
    if (zPostTop <= zBeam + 20) {
      return;
    }
    placedPlan.push({ x: qx, y: qy });
    posts.push({
      id: newEntityId(),
      type: "roofPost",
      layerId: sys.layerId,
      roofSystemId: sys.id,
      profileId: params.rafterProfileId,
      planCenterMm: { x: qx, y: qy },
      bottomElevationMm: zBeam,
      topElevationMm: zPostTop,
      supportingFloorBeamId: beam.id,
      sectionOrientation: "edge",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  };

  for (let i = 0; i < floorBeamsInRoof.length; i += ROOF_POST_STRIDE_FROM_BEAMS) {
    const beam = floorBeamsInRoof[i]!;
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
      continue;
    }
    const bx = (clip.sx + clip.ex) * 0.5;
    const by = (clip.sy + clip.ey) * 0.5;
    const q = closestPointOnRidgePolylineMm(ridgeSegsForClosest, bx, by);
    if (!q) {
      continue;
    }
    const zBeam = floorBeamTopElevationMm(project, beam, verticalById);
    if (zBeam == null) {
      continue;
    }
    tryAddPostAtBeamAndRidge(beam, q.x, q.y, zBeam);
  }

  return { purlins: [purlin], posts, warnings };
}
