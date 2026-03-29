import type { Point2D } from "../geometry/types";
import type { Profile } from "./profile";
import { computeProfileTotalThicknessMm } from "./profileOps";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";
import type { Wall } from "./wall";
import { newEntityId } from "./ids";

/** Минимальная длина сегмента стены, мм (защита от нулевой длины). */
export const MIN_WALL_SEGMENT_LENGTH_MM = 1;

/**
 * Итоговая толщина стены по профилю (алиас к computeProfileTotalThicknessMm).
 */
export function computeProfileThickness(profile: Profile): number {
  return computeProfileTotalThicknessMm(profile);
}

export function snapPoint2dToGridMm(p: Point2D, gridStepMm: number): Point2D {
  if (!Number.isFinite(gridStepMm) || gridStepMm <= 0) {
    return { x: p.x, y: p.y };
  }
  return {
    x: Math.round(p.x / gridStepMm) * gridStepMm,
    y: Math.round(p.y / gridStepMm) * gridStepMm,
  };
}

export function segmentLengthMm(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export interface CreateWallInput {
  readonly layerId: string;
  readonly profileId: string;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly thicknessMm: number;
  readonly heightMm: number;
  readonly baseElevationMm: number;
  readonly placementGroupId?: string;
}

/**
 * Создаёт сущность стены; null, если сегмент слишком короткий или данные невалидны.
 */
export function createWallEntity(input: CreateWallInput): Wall | null {
  if (
    !Number.isFinite(input.thicknessMm) ||
    input.thicknessMm <= 0 ||
    !Number.isFinite(input.heightMm) ||
    input.heightMm <= 0
  ) {
    return null;
  }
  if (segmentLengthMm(input.start, input.end) < MIN_WALL_SEGMENT_LENGTH_MM) {
    return null;
  }
  const t = new Date().toISOString();
  const w: Wall = {
    id: newEntityId(),
    layerId: input.layerId,
    profileId: input.profileId,
    start: { x: input.start.x, y: input.start.y },
    end: { x: input.end.x, y: input.end.y },
    thicknessMm: input.thicknessMm,
    heightMm: input.heightMm,
    baseElevationMm: input.baseElevationMm,
    createdAt: t,
    updatedAt: t,
  };
  if (input.placementGroupId) {
    return { ...w, placementGroupId: input.placementGroupId };
  }
  return w;
}

export function addWallToProject(project: Project, wall: Wall): Project {
  return touchProjectMeta({
    ...project,
    walls: [...project.walls, wall],
  });
}

export function addWallsToProject(project: Project, walls: readonly Wall[]): Project {
  return touchProjectMeta({
    ...project,
    walls: [...project.walls, ...walls],
  });
}

export function setProjectOrigin(project: Project, origin: Point2D): Project {
  return touchProjectMeta({
    ...project,
    projectOrigin: { x: origin.x, y: origin.y },
  });
}
