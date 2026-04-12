import { Graphics } from "pixi.js";

import type { RoofSystemEntity } from "@/core/domain/roofSystem";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";
import { worldToScreen } from "@/core/geometry/viewportTransform";

const RIDGE_COLOR = 0xca8a04;
const RIDGE_ALPHA = 0.92;
const RIDGE_WIDTH = 1.65;

/** Линии конька из `RoofSystemEntity` (генератор простых крыш). */
export function drawRoofSystemRidges2d(
  g: Graphics,
  systems: readonly RoofSystemEntity[],
  t: ViewportTransform,
  opts?: { readonly clear?: boolean },
): void {
  if (opts?.clear !== false) {
    g.clear();
  }
  for (const sys of systems) {
    for (const seg of sys.ridgeSegmentsPlanMm) {
      const dx = seg.bx - seg.ax;
      const dy = seg.by - seg.ay;
      if (Math.hypot(dx, dy) < 0.5) {
        continue;
      }
      const a = worldToScreen(seg.ax, seg.ay, t);
      const b = worldToScreen(seg.bx, seg.by, t);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke({ width: RIDGE_WIDTH, color: RIDGE_COLOR, alpha: RIDGE_ALPHA, cap: "round" });
    }
  }
}
