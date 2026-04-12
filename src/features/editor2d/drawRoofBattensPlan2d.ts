import { Graphics } from "pixi.js";

import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { resolveRoofProfileAssembly } from "@/core/domain/roofProfileAssembly";
import {
  buildRoofBattenPlanSegmentsMm,
  roofAssemblyZAdjustMmByPlaneIdForProject,
  roofLayerBaseMmForPlane,
} from "@/core/geometry/roofAssemblyGeometry3d";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";
import { worldToScreen } from "@/core/geometry/viewportTransform";

/** Контур полосы доски на плане. */
const BATTEN_STROKE = 0x8b9cb0;
const BATTEN_ALPHA = 0.55;
const BATTEN_FILL = 0xa8b8c8;
const BATTEN_FILL_ALPHA = 0.09;
const BATTEN_EDGE_PX = 0.55;
/** Ось доски на плане (тонкая линия по центру полосы). */
const BATTEN_AXIS_PX = 0.65;

/**
 * Проекция расчётной обрешётки на план (мм → экран). Не сохраняется в проект: строится из ската + профиля.
 * Только скаты из `calculatedPlaneIds` с `battenUse` в профиле.
 */
export function drawRoofBattensPlan2d(
  g: Graphics,
  project: Project,
  planes: readonly RoofPlaneEntity[],
  calculatedPlaneIds: ReadonlySet<string>,
  t: ViewportTransform,
  opts?: { readonly clear?: boolean },
): void {
  if (opts?.clear !== false) {
    g.clear();
  }
  if (calculatedPlaneIds.size === 0 || planes.length === 0) {
    return;
  }
  const zMap = roofAssemblyZAdjustMmByPlaneIdForProject(project);
  for (const rp of planes) {
    if (!calculatedPlaneIds.has(rp.id)) {
      continue;
    }
    const profile = getProfileById(project, rp.profileId);
    const asm = resolveRoofProfileAssembly(profile ?? {});
    if (!asm.battenUse) {
      continue;
    }
    const layerBase = roofLayerBaseMmForPlane(project, rp.layerId);
    const zAdj = zMap.get(rp.id) ?? 0;
    const segs = buildRoofBattenPlanSegmentsMm(rp, layerBase, asm, zAdj);
    const hw = Math.max(0, asm.battenWidthMm) * 0.5;
    for (const s of segs) {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-3) {
        continue;
      }
      const nx = (-dy / len) * hw;
      const ny = (dx / len) * hw;
      const ax = s.x1 + nx;
      const ay = s.y1 + ny;
      const bx = s.x1 - nx;
      const by = s.y1 - ny;
      const cx = s.x2 - nx;
      const cy = s.y2 - ny;
      const dx2 = s.x2 + nx;
      const dy2 = s.y2 + ny;
      const pA = worldToScreen(ax, ay, t);
      const pB = worldToScreen(bx, by, t);
      const pC = worldToScreen(cx, cy, t);
      const pD = worldToScreen(dx2, dy2, t);
      g.moveTo(pA.x, pA.y);
      g.lineTo(pB.x, pB.y);
      g.lineTo(pC.x, pC.y);
      g.lineTo(pD.x, pD.y);
      g.closePath();
      g.fill({ color: BATTEN_FILL, alpha: BATTEN_FILL_ALPHA });
      g.stroke({
        width: BATTEN_EDGE_PX,
        color: BATTEN_STROKE,
        alpha: BATTEN_ALPHA * 0.85,
        cap: "round",
        join: "round",
      });
      const m1 = worldToScreen(s.x1, s.y1, t);
      const m2 = worldToScreen(s.x2, s.y2, t);
      g.moveTo(m1.x, m1.y);
      g.lineTo(m2.x, m2.y);
      g.stroke({
        width: BATTEN_AXIS_PX,
        color: BATTEN_STROKE,
        alpha: BATTEN_ALPHA,
        cap: "round",
        join: "round",
      });
    }
  }
}
