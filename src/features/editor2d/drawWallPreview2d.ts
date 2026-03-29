import { Graphics } from "pixi.js";

import {
  type LinearProfilePlacementMode,
  computeWallCenterlineFromReferenceLine,
} from "@/core/geometry/linearPlacementGeometry";
import {
  adjustedRectForRectanglePlacement,
  axisAlignedRectFromCorners,
  fourWallCenterSegmentsFromRect,
} from "@/core/geometry/rectangleWallGeometry";
import type { Point2D } from "@/core/geometry/types";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

const PREVIEW_FILL = 0x5aa7ff;
const PREVIEW_STROKE = 0x5aa7ff;
const AXIS_LINE = 0xffffff;
const REF_LINE = 0xaab8c8;
const RECT_REF = 0x6b7688;
const EPS = 1e-6;

function drawWallBandFromCenterline(
  g: Graphics,
  centerStart: Point2D,
  centerEnd: Point2D,
  thicknessMm: number,
  t: ViewportTransform,
): void {
  const dx = centerEnd.x - centerStart.x;
  const dy = centerEnd.y - centerStart.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    return;
  }
  const nx = (-dy / len) * (thicknessMm / 2);
  const ny = (dx / len) * (thicknessMm / 2);

  const p1 = { x: centerStart.x + nx, y: centerStart.y + ny };
  const p2 = { x: centerEnd.x + nx, y: centerEnd.y + ny };
  const p3 = { x: centerEnd.x - nx, y: centerEnd.y - ny };
  const p4 = { x: centerStart.x - nx, y: centerStart.y - ny };

  const s1 = worldToScreen(p1.x, p1.y, t);
  const s2 = worldToScreen(p2.x, p2.y, t);
  const s3 = worldToScreen(p3.x, p3.y, t);
  const s4 = worldToScreen(p4.x, p4.y, t);

  g.moveTo(s1.x, s1.y);
  g.lineTo(s2.x, s2.y);
  g.lineTo(s3.x, s3.y);
  g.lineTo(s4.x, s4.y);
  g.closePath();
  g.fill({ color: PREVIEW_FILL, alpha: 0.22 });
  g.stroke({ width: 1, color: PREVIEW_STROKE, alpha: 0.85 });
}

/**
 * Preview: опорная линия (тонкая, если смещение) + полоса стены по рассчитанной оси.
 */
export function drawWallPlacementPreview(
  g: Graphics,
  refStartMm: Point2D,
  refEndMm: Point2D,
  thicknessMm: number,
  mode: LinearProfilePlacementMode,
  t: ViewportTransform,
): void {
  const frame = computeWallCenterlineFromReferenceLine(refStartMm, refEndMm, thicknessMm, mode);
  if (!frame) {
    return;
  }
  const { centerStart, centerEnd } = frame;

  if (mode !== "center") {
    const r0 = worldToScreen(refStartMm.x, refStartMm.y, t);
    const r1 = worldToScreen(refEndMm.x, refEndMm.y, t);
    g.moveTo(r0.x, r0.y);
    g.lineTo(r1.x, r1.y);
    g.stroke({ width: 1, color: REF_LINE, alpha: 0.55 });
  }

  drawWallBandFromCenterline(g, centerStart, centerEnd, thicknessMm, t);

  const a = worldToScreen(centerStart.x, centerStart.y, t);
  const b = worldToScreen(centerEnd.x, centerEnd.y, t);
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({ width: 1, color: AXIS_LINE, alpha: mode === "center" ? 0.35 : 0.5 });
}

/**
 * Preview прямоугольника: контур опоры + четыре полосы стен по расчётным осям.
 */
export function drawRectangleWallPlacementPreview(
  g: Graphics,
  refA: Point2D,
  refB: Point2D,
  thicknessMm: number,
  placementMode: LinearProfilePlacementMode,
  t: ViewportTransform,
): void {
  const ref = axisAlignedRectFromCorners(refA, refB);
  const w = ref.maxX - ref.minX;
  const h = ref.maxY - ref.minY;
  if (w < EPS || h < EPS) {
    return;
  }

  const r0 = worldToScreen(ref.minX, ref.minY, t);
  const r1 = worldToScreen(ref.maxX, ref.minY, t);
  const r2 = worldToScreen(ref.maxX, ref.maxY, t);
  const r3 = worldToScreen(ref.minX, ref.maxY, t);
  g.moveTo(r0.x, r0.y);
  g.lineTo(r1.x, r1.y);
  g.lineTo(r2.x, r2.y);
  g.lineTo(r3.x, r3.y);
  g.closePath();
  g.stroke({ width: 1, color: RECT_REF, alpha: 0.45 });

  const adjusted = adjustedRectForRectanglePlacement(ref, thicknessMm, placementMode);
  if (!adjusted) {
    return;
  }
  const segs = fourWallCenterSegmentsFromRect(adjusted);
  for (const seg of segs) {
    drawWallBandFromCenterline(g, seg.start, seg.end, thicknessMm, t);
    const a = worldToScreen(seg.start.x, seg.start.y, t);
    const b = worldToScreen(seg.end.x, seg.end.y, t);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({ width: 1, color: AXIS_LINE, alpha: 0.35 });
  }
}
