import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import type { RoofPostEntity } from "@/core/domain/roofPost";
import type { RoofRafterEntity } from "@/core/domain/roofRafter";
import type { RoofStrutEntity } from "@/core/domain/roofStrut";
import type { RoofSystemEntity } from "@/core/domain/roofSystem";
import { newEntityId } from "@/core/domain/ids";
import { computeLayerVerticalStack } from "@/core/domain/layerVerticalStack";
import { rawRoofZUpAtPlanPointMm } from "@/core/domain/roofGroupHeightAdjust";

import {
  findRafterParameterForElevationAngleDeg,
  planSegmentMidpointInsideFootprint,
  planStrutClearOfWalls,
} from "./roofFramingGeometry";
import type { RoofRafterGeneratorParams } from "./roofRafterGenerator";

const RIDGE_BEAM_LIFT_STUB_MM = 40;
const MIN_STRUT_ELEV_DEG = 42;
const MAX_STRUT_ELEV_DEG = 62;

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

/** Верхняя точка на линии стропила не должна оказаться выше минимального «конька» в этой точке плана. */
function strutEndBelowRidgeEnvelopeMm(
  px: number,
  py: number,
  zEnd: number,
  planeA: RoofPlaneEntity,
  planeB: RoofPlaneEntity,
  baseA: number,
  baseB: number,
  adjA: number,
  adjB: number,
  ridgeLiftMm: number,
): boolean {
  const zA = roofZAtPointMm(planeA, baseA, adjA, px, py) + ridgeLiftMm;
  const zB = roofZAtPointMm(planeB, baseB, adjB, px, py) + ridgeLiftMm;
  const zCap = Math.min(zA, zB) + 2;
  return zEnd <= zCap + 1;
}

/**
 * Подкосы от низа стойки (уровень перекрытия) к точке на стропиле, угол ~45–60° к горизонтали.
 */
export function generateRoofStrutsForPosts(
  project: Project,
  sys: RoofSystemEntity,
  planeA: RoofPlaneEntity,
  planeB: RoofPlaneEntity,
  stack: ReturnType<typeof computeLayerVerticalStack>,
  zAdjMap: ReadonlyMap<string, number>,
  posts: readonly RoofPostEntity[],
  rafters: readonly RoofRafterEntity[],
  params: RoofRafterGeneratorParams,
  nowIso: string,
): { readonly struts: readonly RoofStrutEntity[]; readonly warnings: readonly string[] } {
  const warnings: string[] = [];
  const struts: RoofStrutEntity[] = [];
  const prof = getProfileById(project, params.rafterProfileId);
  if (!prof) {
    return { struts: [], warnings: ["Подкосы: нет профиля."] };
  }

  const baseA = layerBaseMm(project, planeA.layerId, stack);
  const baseB = layerBaseMm(project, planeB.layerId, stack);
  const adjA = zAdjMap.get(planeA.id) ?? 0;
  const adjB = zAdjMap.get(planeB.id) ?? 0;
  const ridgeLift = params.ridgeBeamEnabled ? RIDGE_BEAM_LIFT_STUB_MM : 0;

  const footprint = sys.footprintMm;
  const layerId = sys.layerId;

  const raftersByBeam = new Map<string, RoofRafterEntity[]>();
  for (const r of rafters) {
    if (r.roofSystemId !== sys.id) {
      continue;
    }
    if (!raftersByBeam.has(r.supportingFloorBeamId)) {
      raftersByBeam.set(r.supportingFloorBeamId, []);
    }
    raftersByBeam.get(r.supportingFloorBeamId)!.push(r);
  }

  for (const post of posts) {
    if (post.roofSystemId !== sys.id) {
      continue;
    }
    const list = raftersByBeam.get(post.supportingFloorBeamId) ?? [];
    const uniqPlanes = new Map<string, RoofRafterEntity>();
    for (const r of list) {
      if (!uniqPlanes.has(r.roofPlaneId)) {
        uniqPlanes.set(r.roofPlaneId, r);
      }
    }
    const candidates = [...uniqPlanes.values()];
    if (candidates.length === 0) {
      warnings.push(`Подкос: нет стропил для стойки ${post.id.slice(0, 8)}…`);
      continue;
    }

    const px = post.planCenterMm.x;
    const py = post.planCenterMm.y;
    const z0 = post.bottomElevationMm;

    for (const r of candidates) {
      const t = findRafterParameterForElevationAngleDeg(
        r.footPlanMm.x,
        r.footPlanMm.y,
        r.footElevationMm,
        r.ridgePlanMm.x,
        r.ridgePlanMm.y,
        r.ridgeElevationMm,
        px,
        py,
        z0,
        0.08,
        0.96,
        MIN_STRUT_ELEV_DEG,
        MAX_STRUT_ELEV_DEG,
      );
      if (t == null) {
        continue;
      }
      const fx = r.ridgePlanMm.x - r.footPlanMm.x;
      const fy = r.ridgePlanMm.y - r.footPlanMm.y;
      const fz = r.ridgeElevationMm - r.footElevationMm;
      const ex = r.footPlanMm.x + fx * t;
      const ey = r.footPlanMm.y + fy * t;
      const ez = r.footElevationMm + fz * t;
      if (!strutEndBelowRidgeEnvelopeMm(ex, ey, ez, planeA, planeB, baseA, baseB, adjA, adjB, ridgeLift)) {
        continue;
      }
      if (!planSegmentMidpointInsideFootprint(px, py, ex, ey, footprint)) {
        continue;
      }
      if (!planStrutClearOfWalls(project, px, py, ex, ey, layerId)) {
        continue;
      }
      struts.push({
        id: newEntityId(),
        type: "roofStrut",
        layerId,
        roofSystemId: sys.id,
        profileId: params.rafterProfileId,
        startPlanMm: { x: px, y: py },
        startElevationMm: z0,
        endPlanMm: { x: ex, y: ey },
        endElevationMm: ez,
        roofPostId: post.id,
        roofRafterId: r.id,
        sectionOrientation: "edge",
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  return { struts, warnings };
}
