import { findWallPlacementShiftLockSnapHit } from "../geometry/wallPlacementSnap2d";
import { buildViewportTransform } from "../geometry/viewportTransform";
import { computeLinearSecondPointPreview } from "../geometry/shiftDirectionLock2d";
import type { Point2D } from "../geometry/types";
import type { Project } from "./project";
import type { SnapKind, SnapSettings2d } from "../geometry/snap2d";

export type Editor2dSnapSettingsFn = (project: Project) => SnapSettings2d;

/** Общий срез сессий «якорь → вторая точка» (балка, перенос стены, перенос балки). */
export type LinearPickPreviewSessionSlice = {
  readonly shiftDirectionLockUnit: Point2D | null;
  readonly angleSnapLockedDeg: number | null;
  readonly shiftLockReferenceMm: Point2D | null;
};

export type LinearPickPreviewPatch = {
  readonly previewEnd: Point2D;
  readonly lastSnapKind: SnapKind;
  readonly angleSnapLockedDeg: number | null;
  readonly shiftLockReferenceMm: Point2D | null;
};

/**
 * Цепочка snap / Shift-lock / угол — как у {@link computeLinearSecondPointPreview} с мышью.
 */
export function mergeLinearPickPreviewFromRawWorldMm(input: {
  readonly anchor: Point2D;
  readonly session: LinearPickPreviewSessionSlice;
  readonly project: Project;
  readonly canvasPx: { readonly width: number; readonly height: number } | null;
  readonly rawWorldMm: Point2D;
  readonly altKey?: boolean;
  readonly skipAngleSnap?: boolean;
  readonly editor2dSnapSettings: Editor2dSnapSettingsFn;
}): LinearPickPreviewPatch {
  const { anchor, session, project, canvasPx, rawWorldMm, altKey, skipAngleSnap, editor2dSnapSettings } = input;
  const u = session.shiftDirectionLockUnit;
  const vx = rawWorldMm.x - anchor.x;
  const vy = rawWorldMm.y - anchor.y;
  const uLen2 = u ? u.x * u.x + u.y * u.y : 0;
  const dotOnU = u && uLen2 > 1e-12 ? vx * u.x + vy * u.y : 0;
  const backwardShiftLock = Boolean(u && uLen2 > 1e-12 && dotOnU < -1e-6);

  if (backwardShiftLock || !canvasPx) {
    return {
      previewEnd: { x: rawWorldMm.x, y: rawWorldMm.y },
      lastSnapKind: "none" as SnapKind,
      angleSnapLockedDeg: session.angleSnapLockedDeg,
      shiftLockReferenceMm: session.shiftLockReferenceMm,
    };
  }

  const e2 = project.settings.editor2d;
  const vp2 = project.viewState.viewport2d;
  const t = buildViewportTransform(
    canvasPx.width,
    canvasPx.height,
    vp2.panXMm,
    vp2.panYMm,
    vp2.zoomPixelsPerMm,
  );
  const r = computeLinearSecondPointPreview({
    anchor,
    rawWorldMm,
    viewport: t,
    project,
    snapSettings: editor2dSnapSettings(project),
    gridStepMm: project.settings.gridStepMm,
    shiftDirectionLockUnit: session.shiftDirectionLockUnit,
    angleSnapLockedDeg: session.angleSnapLockedDeg,
    skipAngleSnap: Boolean(skipAngleSnap) || Boolean(altKey),
    altKey: Boolean(altKey),
    shiftLockFindHit: (args) =>
      findWallPlacementShiftLockSnapHit({
        ...args,
        linearPlacementMode: e2.linearPlacementMode,
      }),
  });
  return {
    previewEnd: r.previewEnd,
    lastSnapKind: r.lastSnapKind,
    angleSnapLockedDeg: r.angleSnapLockedDeg,
    shiftLockReferenceMm: r.shiftLockReferenceMm,
  };
}
