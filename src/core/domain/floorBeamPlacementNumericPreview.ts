import type { Point2D } from "../geometry/types";

import type { FloorBeamPlacementSession } from "./floorBeamPlacement";

export type FloorBeamPlacementNumericField = "x" | "y" | "d";

/** Якорь и текущий конец превью — общая модель для балки, переноса стены/балки, копирования сущности. */
export type LinearNumericAnchorPreview = {
  readonly anchorMm: Point2D;
  readonly previewEndMm: Point2D;
  readonly shiftDirectionLockUnit: Point2D | null;
};

/**
 * «Сырая» вторая точка по вводу ΔX / ΔY / D (мм).
 * D — со знаком вдоль текущего направления или вдоль {@link LinearNumericAnchorPreview.shiftDirectionLockUnit}.
 */
export function linearSecondPointFromNumericInput(
  session: LinearNumericAnchorPreview,
  field: FloorBeamPlacementNumericField,
  valueMm: number,
): Point2D | null {
  const anchor = session.anchorMm;
  const cur = session.previewEndMm;
  const dx0 = cur.x - anchor.x;
  const dy0 = cur.y - anchor.y;

  if (field === "x") {
    return { x: anchor.x + valueMm, y: cur.y };
  }
  if (field === "y") {
    return { x: cur.x, y: anchor.y + valueMm };
  }

  const u = session.shiftDirectionLockUnit;
  const uLen2 = u ? u.x * u.x + u.y * u.y : 0;
  if (u && uLen2 > 1e-12) {
    return { x: anchor.x + u.x * valueMm, y: anchor.y + u.y * valueMm };
  }

  const len = Math.hypot(dx0, dy0);
  if (len < 1e-6) {
    return { x: anchor.x + valueMm, y: anchor.y };
  }
  const nx = dx0 / len;
  const ny = dy0 / len;
  return { x: anchor.x + nx * valueMm, y: anchor.y + ny * valueMm };
}

export function floorBeamPlacementSecondPointFromNumericInput(
  session: Pick<FloorBeamPlacementSession, "firstPointMm" | "previewEndMm" | "shiftDirectionLockUnit">,
  field: FloorBeamPlacementNumericField,
  valueMm: number,
): Point2D | null {
  const anchor = session.firstPointMm;
  const cur = session.previewEndMm;
  if (!anchor || !cur) {
    return null;
  }
  return linearSecondPointFromNumericInput(
    { anchorMm: anchor, previewEndMm: cur, shiftDirectionLockUnit: session.shiftDirectionLockUnit },
    field,
    valueMm,
  );
}
