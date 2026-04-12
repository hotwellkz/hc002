import { Graphics } from "pixi.js";

import {
  MIN_WALL_2D_LAYER_LINE_STROKE_PX,
  resolveWallProfileLayerStripsForWallVisualization,
  type WallProfileLayerStripMm,
} from "@/core/domain/wallProfileLayers";
import {
  type LinearProfilePlacementMode,
  computeWallCenterlineFromReferenceLine,
} from "@/core/geometry/linearPlacementGeometry";
import {
  adjustedRectForRectanglePlacement,
  axisAlignedRectFromCorners,
  fourWallMiteredCenterSegmentsFromRect,
} from "@/core/geometry/rectangleWallGeometry";
import type { Point2D } from "@/core/geometry/types";
import type { Profile } from "@/core/domain/profile";

import { fillColor2dForMaterialType, plan2dLayerFillAlpha } from "./materials2d";
import { quadCornersAlongWallMm } from "./wallPlanGeometry2d";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

const PREVIEW_FILL = 0x5aa7ff;
const PREVIEW_STROKE = 0x5aa7ff;
const AXIS_LINE = 0xffffff;
const REF_LINE = 0xaab8c8;
const RECT_REF = 0x6b7688;
const EPS = 1e-6;

export interface WallPreview2dLayeredOptions {
  /** Профиль черновика стены; послойный preview при layered-профиле. */
  readonly profile: Profile | undefined;
  readonly show2dProfileLayers: boolean;
  readonly thicknessMm: number;
  readonly zoomPixelsPerMm: number;
}

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

function drawWallBandLayeredFromCenterline(
  g: Graphics,
  centerStart: Point2D,
  centerEnd: Point2D,
  thicknessMm: number,
  strips: readonly WallProfileLayerStripMm[],
  t: ViewportTransform,
): void {
  const sx = centerStart.x;
  const sy = centerStart.y;
  const ex = centerEnd.x;
  const ey = centerEnd.y;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    return;
  }
  const px = -dy / len;
  const py = dx / len;
  const T = thicknessMm;
  let acc = -T / 2;
  for (const strip of strips) {
    const off0 = acc;
    const off1 = acc + strip.thicknessMm;
    acc = off1;
    const corners = quadCornersAlongWallMm(sx, sy, ex, ey, off0, off1);
    if (!corners) {
      continue;
    }
    const s0 = worldToScreen(corners[0]!.x, corners[0]!.y, t);
    g.moveTo(s0.x, s0.y);
    for (let i = 1; i < 4; i++) {
      const si = worldToScreen(corners[i]!.x, corners[i]!.y, t);
      g.lineTo(si.x, si.y);
    }
    g.closePath();
    g.fill({
      color: fillColor2dForMaterialType(strip.materialType),
      alpha: plan2dLayerFillAlpha(strip.materialType, 0.32),
    });
    g.stroke({ width: MIN_WALL_2D_LAYER_LINE_STROKE_PX, color: 0x5aa7ff, alpha: 0.45 });
  }
  acc = -T / 2;
  for (let i = 0; i < strips.length - 1; i++) {
    acc += strips[i]!.thicknessMm;
    const off = acc;
    const p0 = worldToScreen(sx + px * off, sy + py * off, t);
    const p1 = worldToScreen(ex + px * off, ey + py * off, t);
    g.moveTo(p0.x, p0.y);
    g.lineTo(p1.x, p1.y);
    g.stroke({ width: MIN_WALL_2D_LAYER_LINE_STROKE_PX, color: 0x0a0c10, alpha: 0.35, cap: "butt" });
  }
}

function resolvePreviewStrips(opts: WallPreview2dLayeredOptions | undefined): WallProfileLayerStripMm[] | null {
  if (!opts?.profile || !opts.show2dProfileLayers) {
    return null;
  }
  return resolveWallProfileLayerStripsForWallVisualization(opts.thicknessMm, opts.profile);
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
  layeredOpts?: WallPreview2dLayeredOptions,
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

  const strips = resolvePreviewStrips(layeredOpts);
  if (strips && strips.length >= 1) {
    drawWallBandLayeredFromCenterline(g, centerStart, centerEnd, thicknessMm, strips, t);
  } else {
    drawWallBandFromCenterline(g, centerStart, centerEnd, thicknessMm, t);
  }

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
  layeredOpts?: WallPreview2dLayeredOptions,
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
  const segs = fourWallMiteredCenterSegmentsFromRect(adjusted, thicknessMm);
  if (!segs) {
    return;
  }
  const strips = resolvePreviewStrips(layeredOpts);
  const useLayered = strips && strips.length >= 1;
  for (const seg of segs) {
    if (useLayered) {
      drawWallBandLayeredFromCenterline(g, seg.start, seg.end, thicknessMm, strips, t);
    } else {
      drawWallBandFromCenterline(g, seg.start, seg.end, thicknessMm, t);
    }
    const a = worldToScreen(seg.start.x, seg.start.y, t);
    const b = worldToScreen(seg.end.x, seg.end.y, t);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({ width: 1, color: AXIS_LINE, alpha: 0.35 });
  }
}
