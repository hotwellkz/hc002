import type { Point2D } from "../geometry/types";
import type { Project } from "./project";
import type { FloorBeamPlacementSession } from "./floorBeamPlacement";
import { mergeLinearPickPreviewFromRawWorldMm, type Editor2dSnapSettingsFn } from "./linearPickPreviewMerge";

export type { Editor2dSnapSettingsFn };

/**
 * Обновление превью второй точки балки из «сырой» мировой точки (после числового ввода),
 * с той же цепочкой snap / Shift-lock / угловой привязки, что у движения мыши.
 */
export function mergeFloorBeamPlacementPreviewFromRawWorldMm(input: {
  readonly session: FloorBeamPlacementSession;
  readonly project: Project;
  readonly canvasPx: { readonly width: number; readonly height: number } | null;
  readonly rawWorldMm: Point2D;
  readonly altKey?: boolean;
  readonly editor2dSnapSettings: Editor2dSnapSettingsFn;
}): Pick<
  FloorBeamPlacementSession,
  "previewEndMm" | "lastSnapKind" | "angleSnapLockedDeg" | "shiftLockReferenceMm"
> {
  const { session, project, canvasPx, rawWorldMm, altKey, editor2dSnapSettings } = input;
  const anchor = session.firstPointMm!;
  const patch = mergeLinearPickPreviewFromRawWorldMm({
    anchor,
    session,
    project,
    canvasPx,
    rawWorldMm,
    altKey,
    skipAngleSnap: Boolean(altKey),
    editor2dSnapSettings,
  });
  return {
    previewEndMm: patch.previewEnd,
    lastSnapKind: patch.lastSnapKind,
    angleSnapLockedDeg: patch.angleSnapLockedDeg,
    shiftLockReferenceMm: patch.shiftLockReferenceMm,
  };
}
