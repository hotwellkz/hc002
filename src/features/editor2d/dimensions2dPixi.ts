import { Container, Graphics, Text } from "pixi.js";

import type { Dimension } from "@/core/domain/dimension";
import type { Project } from "@/core/domain/project";
import {
  DIMENSION_FONT_SIZE_PX,
  DIMENSION_LABEL_H_PAD_PX,
  DIMENSION_TEXT_FONT_STACK,
  DIMENSION_TICK_HALF_PX,
  PLAN_2D_DIMENSION_OFFSET_EXTRA_MM,
  measureDimensionLabelTextWidthPx,
  readDimensionStyleColors,
} from "@/shared/dimensionStyle";

import {
  drawPlanCadDimension2d,
  planDimensionLabelScreenPosition,
  planDimensionMidWorldMm,
} from "./dimensionLines2dPixi";
import type { ViewportTransform } from "./viewportTransforms";

const PLAN_DIM_BASE_OFFSET_MM = 420;

function effectivePlan2dDimensionOffsetMm(d: Dimension): number {
  return (d.offsetMm ?? PLAN_DIM_BASE_OFFSET_MM) + PLAN_2D_DIMENSION_OFFSET_EXTRA_MM;
}

/** Центр размерной линии в мировых мм (геометрия без учёта смещения подписи). */
export function dimensionLabelCenterWorldMm(d: Dimension): { readonly mx: number; readonly my: number } | null {
  const offsetMm = effectivePlan2dDimensionOffsetMm(d);
  const { nx, ny } = outwardNormalForDimLine(d);
  return planDimensionMidWorldMm(d.a, d.b, nx, ny, offsetMm);
}

/**
 * Экранная позиция подписи размера (центр текста), с тем же смещением от оси линии, что и при отрисовке.
 */
export function dimensionLabelScreenPosition(d: Dimension, t: ViewportTransform): { readonly x: number; readonly y: number } | null {
  const offsetMm = effectivePlan2dDimensionOffsetMm(d);
  const { nx, ny } = outwardNormalForDimLine(d);
  const c = planDimensionMidWorldMm(d.a, d.b, nx, ny, offsetMm);
  if (!c) {
    return null;
  }
  return planDimensionLabelScreenPosition(c, nx, ny, t);
}

/** Экранные позиции подписей размеров (для анти-наложения с марками стен). */
export function collectDimensionLabelScreenPositions(
  project: Project,
  t: ViewportTransform,
): readonly { readonly x: number; readonly y: number }[] {
  const layerId = project.activeLayerId;
  const dims = project.dimensions.filter((d) => !d.layerId || d.layerId === layerId);
  const out: { x: number; y: number }[] = [];
  for (const d of dims) {
    const s = dimensionLabelScreenPosition(d, t);
    if (s) {
      out.push(s);
    }
  }
  return out;
}

/** Единичная нормаль «наружу» от линии измерения к размерной линии (мировые координаты). */
function outwardNormalForDimLine(d: Dimension): { readonly nx: number; readonly ny: number } {
  if (d.kind === "rectangle_outer_horizontal") {
    return { nx: 0, ny: -1 };
  }
  if (d.kind === "rectangle_outer_vertical") {
    return { nx: 1, ny: 0 };
  }
  const ax = d.a.x;
  const ay = d.a.y;
  const bx = d.b.x;
  const by = d.b.y;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    return { nx: 0, ny: -1 };
  }
  const lx = -dy / len;
  const ly = dx / len;
  return { nx: lx, ny: ly };
}

/**
 * Размерные линии плана: выносные линии, размерная линия на смещённой оси, засечки, подпись с разрывом линии.
 */
export function drawDimensions2d(
  linesG: Graphics,
  labelsC: Container,
  project: Project,
  t: ViewportTransform,
): void {
  linesG.clear();
  clearDimensionLabels(labelsC);
  const layerId = project.activeLayerId;
  const dims = project.dimensions.filter((d) => !d.layerId || d.layerId === layerId);

  const { line: LINE, text: TEXT_COL } = readDimensionStyleColors();
  const lineAlpha = 0.93;
  const textAlpha = 0.95;
  const extAlpha = 0.8;
  const tickHalfPx = DIMENSION_TICK_HALF_PX;

  for (const d of dims) {
    const overshootMm = d.extensionOvershootMm ?? 72;
    const { nx, ny } = outwardNormalForDimLine(d);
    const ax = d.a.x;
    const ay = d.a.y;
    const bx = d.b.x;
    const by = d.b.y;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      continue;
    }
    const ux = dx / len;
    const uy = dy / len;

    const offsetMm = effectivePlan2dDimensionOffsetMm(d);
    const label = String(d.textValueMm ?? Math.round(len));
    const tw = (measureDimensionLabelTextWidthPx(label) + DIMENSION_LABEL_H_PAD_PX) / 2;

    drawPlanCadDimension2d(linesG, {
      a: d.a,
      b: d.b,
      nx,
      ny,
      offsetMm,
      overshootMm,
      t,
      lineColor: LINE,
      lineAlpha,
      extAlpha,
      tickHalfPx,
      labelGapHalfScreenPx: tw,
    });

    const mid = planDimensionMidWorldMm(d.a, d.b, nx, ny, offsetMm);
    if (!mid) {
      continue;
    }
    const labelPos = planDimensionLabelScreenPosition(mid, nx, ny, t);
    const ang = Math.atan2(uy, ux);
    const txt = new Text({
      text: label,
      style: {
        fontFamily: DIMENSION_TEXT_FONT_STACK,
        fontSize: DIMENSION_FONT_SIZE_PX,
        fill: TEXT_COL,
        fontWeight: "400",
      },
    });
    txt.anchor.set(0.5);
    txt.x = labelPos.x;
    txt.y = labelPos.y;
    txt.rotation = ang;
    txt.alpha = textAlpha;
    labelsC.addChild(txt);
  }
}

function clearDimensionLabels(c: Container): void {
  for (const ch of [...c.children]) {
    ch.destroy({ children: true });
  }
  c.removeChildren();
}
