import { Graphics } from "pixi.js";

import type { Wall } from "@/core/domain/wall";
import { openingSlotCornersMm } from "./openingPlanGeometry2d";
import { quadCornersAlongWallMm } from "./wallPlanGeometry2d";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

/** Подсветка стены и превью проёма при установке окна. */
export function drawWindowPlacementPreview2d(
  g: Graphics,
  wall: Wall,
  leftAlongMm: number,
  openingWidthMm: number,
  valid: boolean,
  t: ViewportTransform,
): void {
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const T = wall.thicknessMm;

  const outer = quadCornersAlongWallMm(sx, sy, ex, ey, -T / 2, T / 2);
  if (outer) {
    const strokeCol = valid ? 0x3d9a6b : 0xc45c5c;
    const fillCol = valid ? 0x3d9a6b : 0xc45c5c;
    const s0 = worldToScreen(outer[0]!.x, outer[0]!.y, t);
    g.moveTo(s0.x, s0.y);
    for (let i = 1; i < outer.length; i++) {
      const si = worldToScreen(outer[i]!.x, outer[i]!.y, t);
      g.lineTo(si.x, si.y);
    }
    g.closePath();
    g.stroke({ width: 2, color: strokeCol, alpha: 0.95 });
    g.fill({ color: fillCol, alpha: valid ? 0.12 : 0.18 });
  }

  const sliceCorners = openingSlotCornersMm(wall, leftAlongMm, openingWidthMm, 1);
  if (!sliceCorners) {
    return;
  }
  const p0 = worldToScreen(sliceCorners[0]!.x, sliceCorners[0]!.y, t);
  g.moveTo(p0.x, p0.y);
  for (let i = 1; i < 4; i++) {
    const pi = worldToScreen(sliceCorners[i]!.x, sliceCorners[i]!.y, t);
    g.lineTo(pi.x, pi.y);
  }
  g.closePath();
  g.fill({ color: valid ? 0xa8c5ff : 0xffb4a8, alpha: valid ? 0.42 : 0.5 });
  g.stroke({ width: 1.5, color: valid ? 0x2563eb : 0xd32f2f, alpha: 0.95 });
}
