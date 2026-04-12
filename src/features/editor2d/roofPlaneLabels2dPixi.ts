import { Container, Text } from "pixi.js";

import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";

import type { RoofLabelLayout2d } from "./roofPlaneLabelLayout2d";

const FILL = 0x334155;
const OUTLINE = 0xf8fafc;

/**
 * Подписи скатов по заранее вычисленной раскладке (стрелка и текст не пересекаются).
 */
export function appendRoofPlaneLabels2d(
  container: Container,
  planes: readonly RoofPlaneEntity[],
  layoutByPlaneId: ReadonlyMap<string, RoofLabelLayout2d>,
  _t: ViewportTransform,
  opts?: { readonly fontSizePx?: number; readonly lineHeightFactor?: number },
): void {
  const fs = opts?.fontSizePx ?? 11;
  const lh = opts?.lineHeightFactor ?? 1.28;
  for (const rp of planes) {
    const poly = roofPlanePolygonMm(rp);
    if (poly.length < 3) {
      continue;
    }
    const lay = layoutByPlaneId.get(rp.id);
    if (!lay) {
      continue;
    }
    const txt = new Text({
      text: `${lay.line1}\n${lay.line2}`,
      style: {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: fs,
        fill: FILL,
        fontWeight: "500",
        align: "left",
        stroke: { color: OUTLINE, width: Math.max(1.1, fs * 0.1) },
        lineHeight: fs * lh,
      },
    });
    txt.anchor.set(0, 0);
    txt.x = lay.textTopLeftPx.x;
    txt.y = lay.textTopLeftPx.y;
    txt.alpha = 0.95;
    container.addChild(txt);
  }
}
