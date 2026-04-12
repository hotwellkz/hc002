import { Quaternion, Vector3 } from "three";

import { beamPlanThicknessAndVerticalFromOrientationMm } from "@/core/domain/floorBeamSection";
import { getProfileById } from "@/core/domain/profileOps";
import type { ProfileMaterialType } from "@/core/domain/profile";
import type { Project } from "@/core/domain/project";
import type { RoofPurlinEntity } from "@/core/domain/roofPurlin";
import type { RoofPostEntity } from "@/core/domain/roofPost";
import type { RoofStrutEntity } from "@/core/domain/roofStrut";
import { getLayerById } from "@/core/domain/layerOps";

import { isProjectLayerVisibleIn3d } from "./view3dVisibility";

const MM_TO_M = 0.001;
const MIN_LEN_MM = 1;

export interface RoofFramingBoxMeshSpec {
  readonly reactKey: string;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly materialType: ProfileMaterialType | "default";
}

function planToThreeMm(pxMm: number, pyMm: number, zUpMm: number): Vector3 {
  return new Vector3(pxMm * MM_TO_M, zUpMm * MM_TO_M, -pyMm * MM_TO_M);
}

function boxAlongSegmentMm(
  sx: number,
  sy: number,
  sz: number,
  ex: number,
  ey: number,
  ez: number,
  planThicknessMm: number,
  verticalMm: number,
  profile: NonNullable<ReturnType<typeof getProfileById>>,
): RoofFramingBoxMeshSpec | null {
  const a = planToThreeMm(sx, sy, sz);
  const b = planToThreeMm(ex, ey, ez);
  const dir = b.clone().sub(a);
  const lenM = dir.length();
  if (lenM < MIN_LEN_MM * MM_TO_M) {
    return null;
  }
  dir.normalize();
  const center = a.clone().add(b).multiplyScalar(0.5);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir);
  const mt: ProfileMaterialType | "default" = profile.layers[0]?.materialType ?? "wood";
  return {
    reactKey: "",
    position: [center.x, center.y, center.z],
    quaternion: [q.x, q.y, q.z, q.w],
    width: planThicknessMm * MM_TO_M,
    height: verticalMm * MM_TO_M,
    depth: lenM,
    materialType: mt,
  };
}

export function roofPostsForScene3d(project: Project): readonly RoofPostEntity[] {
  return project.roofPosts.filter((p) => {
    const layer = getLayerById(project, p.layerId);
    if (layer?.isVisible === false) {
      return false;
    }
    return isProjectLayerVisibleIn3d(p.layerId, project);
  });
}

export function roofPostsToMeshSpecs(project: Project, posts: readonly RoofPostEntity[]): RoofFramingBoxMeshSpec[] {
  const out: RoofFramingBoxMeshSpec[] = [];
  for (const post of posts) {
    const profile = getProfileById(project, post.profileId);
    if (!profile) {
      continue;
    }
    const { planThicknessMm, verticalMm } = beamPlanThicknessAndVerticalFromOrientationMm(profile, post.sectionOrientation);
    if (!(planThicknessMm > 0) || !(verticalMm > 0)) {
      continue;
    }
    const px = post.planCenterMm.x;
    const py = post.planCenterMm.y;
    const z0 = post.bottomElevationMm;
    const z1 = post.topElevationMm;
    const spec = boxAlongSegmentMm(px, py, z0, px, py, z1, planThicknessMm, verticalMm, profile);
    if (!spec) {
      continue;
    }
    out.push({ ...spec, reactKey: post.id });
  }
  return out;
}

export function roofPurlinsForScene3d(project: Project): readonly RoofPurlinEntity[] {
  return project.roofPurlins.filter((p) => {
    const layer = getLayerById(project, p.layerId);
    if (layer?.isVisible === false) {
      return false;
    }
    return isProjectLayerVisibleIn3d(p.layerId, project);
  });
}

export function roofPurlinsToMeshSpecs(project: Project, purlins: readonly RoofPurlinEntity[]): RoofFramingBoxMeshSpec[] {
  const out: RoofFramingBoxMeshSpec[] = [];
  for (const pu of purlins) {
    const profile = getProfileById(project, pu.profileId);
    if (!profile) {
      continue;
    }
    const { planThicknessMm, verticalMm } = beamPlanThicknessAndVerticalFromOrientationMm(profile, pu.sectionOrientation);
    if (!(planThicknessMm > 0) || !(verticalMm > 0)) {
      continue;
    }
    const poly = pu.polylinePlanMm;
    const zv = pu.vertexAxisElevationMm;
    if (poly.length < 2 || zv.length !== poly.length) {
      continue;
    }
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i]!;
      const b = poly[i + 1]!;
      const spec = boxAlongSegmentMm(a.x, a.y, zv[i]!, b.x, b.y, zv[i + 1]!, planThicknessMm, verticalMm, profile);
      if (!spec) {
        continue;
      }
      out.push({ ...spec, reactKey: `${pu.id}-seg-${i}` });
    }
  }
  return out;
}

export function roofStrutsForScene3d(project: Project): readonly RoofStrutEntity[] {
  return project.roofStruts.filter((p) => {
    const layer = getLayerById(project, p.layerId);
    if (layer?.isVisible === false) {
      return false;
    }
    return isProjectLayerVisibleIn3d(p.layerId, project);
  });
}

export function roofStrutsToMeshSpecs(project: Project, struts: readonly RoofStrutEntity[]): RoofFramingBoxMeshSpec[] {
  const out: RoofFramingBoxMeshSpec[] = [];
  for (const s of struts) {
    const profile = getProfileById(project, s.profileId);
    if (!profile) {
      continue;
    }
    const { planThicknessMm, verticalMm } = beamPlanThicknessAndVerticalFromOrientationMm(profile, s.sectionOrientation);
    if (!(planThicknessMm > 0) || !(verticalMm > 0)) {
      continue;
    }
    const spec = boxAlongSegmentMm(
      s.startPlanMm.x,
      s.startPlanMm.y,
      s.startElevationMm,
      s.endPlanMm.x,
      s.endPlanMm.y,
      s.endElevationMm,
      planThicknessMm,
      verticalMm,
      profile,
    );
    if (!spec) {
      continue;
    }
    out.push({ ...spec, reactKey: s.id });
  }
  return out;
}
