import { Graphics } from "pixi.js";

import type { Point2D } from "@/core/geometry/types";
import { dimensionLabelOffsetFromDimAxisPx } from "@/shared/dimensionStyle";

import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

/** Поперечные засечки на концах размерной линии (как `.wd-dim-cap` во «Виде стены»). */
export function drawDimensionPerpCaps2d(
  g: Graphics,
  atX: number,
  atY: number,
  lineUx: number,
  lineUy: number,
  tickHalfPx: number,
  color: number,
  alpha: number,
): void {
  const len = Math.hypot(lineUx, lineUy);
  if (len < 1e-9) {
    return;
  }
  const uux = lineUx / len;
  const uuy = lineUy / len;
  const px = -uuy;
  const py = uux;
  g.moveTo(atX + px * tickHalfPx, atY + py * tickHalfPx);
  g.lineTo(atX - px * tickHalfPx, atY - py * tickHalfPx);
  g.stroke({ width: 1, color, alpha, cap: "butt" });
}

export interface PlanCadDimension2dParams {
  readonly a: Point2D;
  readonly b: Point2D;
  /** Единичная нормаль от линии измерения к размерной линии (мировые мм). */
  readonly nx: number;
  readonly ny: number;
  readonly offsetMm: number;
  readonly overshootMm: number;
  readonly t: ViewportTransform;
  readonly lineColor: number;
  readonly lineAlpha: number;
  readonly extAlpha: number;
  readonly tickHalfPx: number;
  /** Половина разрыва размерной линии под подпись, в экранных px (вдоль линии). */
  readonly labelGapHalfScreenPx?: number;
}

/**
 * Полноценный линейный размер на плане: выносные линии, размерная линия на смещённой оси,
 * засечки на стыке с выносными, опциональный разрыв под текст.
 */
export function drawPlanCadDimension2d(g: Graphics, p: PlanCadDimension2dParams): void {
  const {
    a,
    b,
    nx,
    ny,
    offsetMm,
    overshootMm,
    t,
    lineColor,
    lineAlpha,
    extAlpha,
    tickHalfPx,
    labelGapHalfScreenPx = 0,
  } = p;
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return;
  }
  const ux = dx / len;
  const uy = dy / len;

  const aOffX = ax + nx * offsetMm;
  const aOffY = ay + ny * offsetMm;
  const bOffX = bx + nx * offsetMm;
  const bOffY = by + ny * offsetMm;

  const p0x = aOffX - ux * overshootMm;
  const p0y = aOffY - uy * overshootMm;
  const p1x = bOffX + ux * overshootMm;
  const p1y = bOffY + uy * overshootMm;

  const aExt0 = worldToScreen(ax, ay, t);
  const aExt1 = worldToScreen(aOffX, aOffY, t);
  const bExt0 = worldToScreen(bx, by, t);
  const bExt1 = worldToScreen(bOffX, bOffY, t);

  g.moveTo(aExt0.x, aExt0.y);
  g.lineTo(aExt1.x, aExt1.y);
  g.stroke({ width: 1, color: lineColor, alpha: extAlpha, cap: "butt" });

  g.moveTo(bExt0.x, bExt0.y);
  g.lineTo(bExt1.x, bExt1.y);
  g.stroke({ width: 1, color: lineColor, alpha: extAlpha, cap: "butt" });

  const s0 = worldToScreen(p0x, p0y, t);
  const s1 = worldToScreen(p1x, p1y, t);
  const svx = s1.x - s0.x;
  const svy = s1.y - s0.y;
  const slen = Math.hypot(svx, svy);

  const gapHalf = labelGapHalfScreenPx;
  if (gapHalf > 0 && slen > gapHalf * 2 + 6) {
    const tcx = (s0.x + s1.x) / 2;
    const tcy = (s0.y + s1.y) / 2;
    const nlx = slen > 1e-6 ? svx / slen : 1;
    const nly = slen > 1e-6 ? svy / slen : 0;
    const e0x = tcx - nlx * gapHalf;
    const e0y = tcy - nly * gapHalf;
    const e1x = tcx + nlx * gapHalf;
    const e1y = tcy + nly * gapHalf;
    g.moveTo(s0.x, s0.y);
    g.lineTo(e0x, e0y);
    g.stroke({ width: 1, color: lineColor, alpha: lineAlpha, cap: "butt" });
    g.moveTo(e1x, e1y);
    g.lineTo(s1.x, s1.y);
    g.stroke({ width: 1, color: lineColor, alpha: lineAlpha, cap: "butt" });
  } else {
    g.moveTo(s0.x, s0.y);
    g.lineTo(s1.x, s1.y);
    g.stroke({ width: 1, color: lineColor, alpha: lineAlpha, cap: "butt" });
  }

  drawDimensionPerpCaps2d(g, aExt1.x, aExt1.y, svx, svy, tickHalfPx, lineColor, lineAlpha);
  drawDimensionPerpCaps2d(g, bExt1.x, bExt1.y, svx, svy, tickHalfPx, lineColor, lineAlpha);
}

/** Середина размерной линии в мировых мм (на смещённой оси). */
export function planDimensionMidWorldMm(
  a: Point2D,
  b: Point2D,
  nx: number,
  ny: number,
  offsetMm: number,
): { readonly mx: number; readonly my: number } | null {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return null;
  }
  const aOffX = ax + nx * offsetMm;
  const aOffY = ay + ny * offsetMm;
  const bOffX = bx + nx * offsetMm;
  const bOffY = by + ny * offsetMm;
  return { mx: (aOffX + bOffX) / 2, my: (aOffY + bOffY) / 2 };
}

/** Экранная позиция центра подписи — как у габаритных размеров (зазор от оси в px). */
export function planDimensionLabelScreenPosition(
  midWorld: { readonly mx: number; readonly my: number },
  nx: number,
  ny: number,
  t: ViewportTransform,
): { readonly x: number; readonly y: number } {
  const ms = worldToScreen(midWorld.mx, midWorld.my, t);
  const step = worldToScreen(midWorld.mx + nx * 80, midWorld.my + ny * 80, t);
  const vx = step.x - ms.x;
  const vy = step.y - ms.y;
  const vlen = Math.hypot(vx, vy);
  if (vlen < 1e-6) {
    return { x: ms.x, y: ms.y };
  }
  const off = dimensionLabelOffsetFromDimAxisPx();
  return { x: ms.x + (vx / vlen) * off, y: ms.y + (vy / vlen) * off };
}
