import { Graphics } from "pixi.js";

import type { Project } from "@/core/domain/project";
import type { FloorBeamEntity } from "@/core/domain/floorBeam";
import { floorBeamExceedsLinearStockLength } from "@/core/domain/floorBeamLinearStockCheck";
import { getProfileById } from "@/core/domain/profileOps";
import { floorBeamPlanQuadCornersMm } from "@/core/domain/floorBeamGeometry";

import { fillColor2dForMaterialType } from "./materials2d";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

const BEAM_NORMAL = 0x8b7355;
const BEAM_SELECTED = 0xe7b65c;
/** Тёплый warning (оранжево-красный), читаемый на светлом и тёмном фоне плана. */
const OVER_STOCK_WARN_FILL = 0xd97736;
const OVER_STOCK_WARN_STROKE = 0xb45309;

export type DrawFloorBeams2dAppearance = "active" | "context";

export interface DrawFloorBeams2dOptions {
  readonly appearance?: DrawFloorBeams2dAppearance;
  readonly clear?: boolean;
  /** Подсветка балок длиннее max заготовки (только в режиме «Перекрытие» на плане). */
  readonly highlightOverLinearStock?: boolean;
}

function strokeAndFillForBeam(beam: FloorBeamEntity, project: Project): { stroke: number; fill: number } {
  const profile = getProfileById(project, beam.profileId);
  const mt = profile?.layers[0]?.materialType;
  if (!mt) {
    return { stroke: BEAM_NORMAL, fill: BEAM_NORMAL };
  }
  const fill = fillColor2dForMaterialType(mt);
  return { stroke: fill, fill };
}

export function drawFloorBeams2d(
  g: Graphics,
  project: Project,
  beams: readonly FloorBeamEntity[],
  t: ViewportTransform,
  selectedIds: ReadonlySet<string>,
  opts?: DrawFloorBeams2dOptions,
): void {
  const appearance = opts?.appearance ?? "active";
  if (opts?.clear !== false) {
    g.clear();
  }
  const alphaFill = appearance === "context" ? 0.14 : 0.24;
  const alphaStroke = appearance === "context" ? 0.38 : 0.72;

  const showOver = Boolean(opts?.highlightOverLinearStock);

  for (const beam of beams) {
    const corners = floorBeamPlanQuadCornersMm(project, beam);
    if (!corners || corners.length !== 4) {
      continue;
    }
    const { stroke, fill } = strokeAndFillForBeam(beam, project);
    const sel = selectedIds.has(beam.id);
    const overStock = showOver && floorBeamExceedsLinearStockLength(project, beam);

    if (overStock) {
      const s0w = worldToScreen(corners[0]!.x, corners[0]!.y, t);
      g.moveTo(s0w.x, s0w.y);
      for (let i = 1; i < 4; i++) {
        const si = worldToScreen(corners[i]!.x, corners[i]!.y, t);
        g.lineTo(si.x, si.y);
      }
      g.closePath();
      g.fill({ color: OVER_STOCK_WARN_FILL, alpha: appearance === "context" ? 0.1 : 0.16 });
      g.stroke({
        width: sel ? 4 : 3,
        color: OVER_STOCK_WARN_STROKE,
        alpha: appearance === "context" ? 0.45 : 0.72,
      });
    }

    const s0 = worldToScreen(corners[0]!.x, corners[0]!.y, t);
    g.moveTo(s0.x, s0.y);
    for (let i = 1; i < 4; i++) {
      const si = worldToScreen(corners[i]!.x, corners[i]!.y, t);
      g.lineTo(si.x, si.y);
    }
    g.closePath();
    g.fill({ color: fill, alpha: alphaFill });
    g.stroke({
      width: sel ? 2 : 1,
      color: sel ? BEAM_SELECTED : stroke,
      alpha: sel ? 0.95 : alphaStroke,
    });
  }
}
