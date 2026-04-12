import { Graphics } from "pixi.js";

import type { Project } from "@/core/domain/project";
import { getProfileById } from "@/core/domain/profileOps";

import {
  lumberPlan2dFillForRoleAndMaterial,
  wallCalcCorePlan2dFill,
} from "./wallCalculationPlan2dColors";
import { collectWallCalculationPlanQuads } from "./wallCalculationPlan2dQuads";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

function fillQuadMm(
  g: Graphics,
  corners: readonly { readonly x: number; readonly y: number }[],
  t: ViewportTransform,
  color: number,
  alpha: number,
): void {
  if (corners.length < 4) {
    return;
  }
  const s0 = worldToScreen(corners[0]!.x, corners[0]!.y, t);
  g.moveTo(s0.x, s0.y);
  for (let i = 1; i < 4; i++) {
    const si = worldToScreen(corners[i]!.x, corners[i]!.y, t);
    g.lineTo(si.x, si.y);
  }
  g.closePath();
  g.fill({ color, alpha });
}

/**
 * Расчётная SIP-раскладка: заливка ядра (приглушённая); детали по ролям; обвязка отдельным тоном.
 */
export function drawWallCalculationOverlay2d(
  g: Graphics,
  project: Project,
  visibleWallIds: ReadonlySet<string>,
  t: ViewportTransform,
): void {
  g.clear();
  const wallById = new Map(project.walls.map((w) => [w.id, w]));
  for (const calc of project.wallCalculations) {
    const wall = wallById.get(calc.wallId);
    if (!wall || !visibleWallIds.has(wall.id)) {
      continue;
    }
    const quads = collectWallCalculationPlanQuads(wall, project, calc);
    const profile = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
    const coreFill = wallCalcCorePlan2dFill(wall.thicknessMm, profile);
    for (const q of quads) {
      if (q.kind === "sip") {
        fillQuadMm(g, q.corners, t, coreFill.color, coreFill.alpha);
      } else {
        const { color, alpha } = lumberPlan2dFillForRoleAndMaterial(q.role, q.materialType);
        fillQuadMm(g, q.corners, t, color, alpha);
      }
    }
  }
}
