import { Graphics } from "pixi.js";

import type { Project } from "@/core/domain/project";
import { openingCenterOnWallMm } from "@/core/domain/openingPlacement";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

const WALL_NORMAL = 0x5c7cfa;
const WALL_CONTEXT = 0x4a5f8a;
const WALL_SELECTED = 0xfcc419;
const OPENING_DOT = 0x8b93a7;
const OPENING_CONTEXT = 0x5c6578;
const OPENING_SELECTED = 0xfcc419;

export type Draw2dLayerAppearance = "active" | "context";

export interface DrawWalls2dOptions {
  readonly appearance?: Draw2dLayerAppearance;
  /** Если false — дорисовать поверх уже нарисованного (без clear). */
  readonly clear?: boolean;
}

/**
 * Стены: обычные и выбранные (толще + контур); проёмы — точки по центру.
 * В режиме context слой приглушён, выделение не отображается.
 */
export function drawWallsAndOpenings2d(
  wallsG: Graphics,
  openingsG: Graphics,
  project: Project,
  t: ViewportTransform,
  selectedIds: ReadonlySet<string>,
  options?: DrawWalls2dOptions,
): void {
  const appearance = options?.appearance ?? "active";
  const clear = options?.clear ?? true;
  if (clear) {
    wallsG.clear();
    openingsG.clear();
  }

  const ctx = appearance === "context";

  for (const w of project.walls) {
    const sel = selectedIds.has(w.id);
    const showSel = !ctx && sel;
    const a = worldToScreen(w.start.x, w.start.y, t);
    const b = worldToScreen(w.end.x, w.end.y, t);
    const strokePx = Math.max(2, w.thicknessMm * t.zoomPixelsPerMm);
    const color = showSel ? WALL_SELECTED : ctx ? WALL_CONTEXT : WALL_NORMAL;
    const alpha = ctx ? 0.35 : showSel ? 1 : 0.95;

    if (showSel) {
      const outline = strokePx + 4;
      wallsG.moveTo(a.x, a.y);
      wallsG.lineTo(b.x, b.y);
      wallsG.stroke({ width: outline, color: 0x000000, alpha: 0.35, cap: "butt" });
    }
    wallsG.moveTo(a.x, a.y);
    wallsG.lineTo(b.x, b.y);
    wallsG.stroke({ width: strokePx, color, alpha, cap: "butt" });

    if (showSel) {
      const r = Math.max(4, strokePx * 0.55);
      for (const p of [a, b]) {
        openingsG.circle(p.x, p.y, r * 0.45);
        openingsG.fill({ color: WALL_SELECTED, alpha: 0.9 });
        openingsG.stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
      }
    }
  }

  for (const o of project.openings) {
    const wall = project.walls.find((w) => w.id === o.wallId);
    if (!wall) {
      continue;
    }
    const p = openingCenterOnWallMm(wall, o);
    const s = worldToScreen(p.x, p.y, t);
    const sel = selectedIds.has(o.id);
    const showSel = !ctx && sel;
    const r = showSel ? 6 : ctx ? 3 : 4;
    openingsG.circle(s.x, s.y, r);
    openingsG.fill({
      color: showSel ? OPENING_SELECTED : ctx ? OPENING_CONTEXT : OPENING_DOT,
      alpha: ctx ? 0.45 : showSel ? 1 : 0.75,
    });
    if (showSel) {
      openingsG.stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
    }
  }
}
