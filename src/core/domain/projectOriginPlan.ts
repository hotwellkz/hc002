import type { Project } from "./project";
import type { Point2D } from "../geometry/types";

/**
 * Мировые мм плана → координаты относительно {@link Project.projectOrigin}.
 * Если база не задана, совпадает с миром.
 */
export function worldMmToPlanMm(world: Point2D, project: Pick<Project, "projectOrigin">): Point2D {
  const o = project.projectOrigin;
  if (!o) {
    return { x: world.x, y: world.y };
  }
  return { x: world.x - o.x, y: world.y - o.y };
}

/**
 * Координаты относительно базы → мировые мм плана.
 */
export function planMmToWorldMm(plan: Point2D, project: Pick<Project, "projectOrigin">): Point2D {
  const o = project.projectOrigin;
  if (!o) {
    return { x: plan.x, y: plan.y };
  }
  return { x: plan.x + o.x, y: plan.y + o.y };
}

/** Привязка к сетке с шагом stepMm, линии сетки проходят через базу (ox, oy). */
export function snapWorldToGridAlignedToOrigin(world: Point2D, gridStepMm: number, origin: Point2D | null): Point2D {
  if (!(gridStepMm > 0)) {
    return { x: world.x, y: world.y };
  }
  const ox = origin?.x ?? 0;
  const oy = origin?.y ?? 0;
  return {
    x: Math.round((world.x - ox) / gridStepMm) * gridStepMm + ox,
    y: Math.round((world.y - oy) / gridStepMm) * gridStepMm + oy,
  };
}
