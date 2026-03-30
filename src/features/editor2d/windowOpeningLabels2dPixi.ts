import { Container, Text } from "pixi.js";

import { openingCenterOnWallMm } from "@/core/domain/openingPlacement";
import type { Project } from "@/core/domain/project";
import { cssHexToPixiNumber } from "@/shared/cssColor";

import { collectDimensionLabelScreenPositions } from "./dimensions2dPixi";
import { exteriorNormalForWallLabelMm } from "./wallLabelExteriorNormalMm";
import type { WallMarkAppearance } from "./wallMarks2dPixi";
import type { AppendWallMarkLabels2dOptions } from "./wallMarks2dPixi";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

function readOpeningLabelColors(): { readonly fill: number; readonly outline: number } {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const fill = cs.getPropertyValue("--color-wall-mark-text").trim() || "#e8ecf1";
  const outline = cs.getPropertyValue("--color-wall-mark-outline").trim() || "#14171b";
  return { fill: cssHexToPixiNumber(fill), outline: cssHexToPixiNumber(outline) };
}

function screenDist(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isClearOfDimLabels(
  p: { readonly x: number; readonly y: number },
  dimCenters: readonly { readonly x: number; readonly y: number }[],
  radiusPx: number,
): boolean {
  for (const d of dimCenters) {
    if (screenDist(p, d) < 18 + radiusPx * 0.35) {
      return false;
    }
  }
  return true;
}

/**
 * Подписи ОК-n и ширина/высота у проёма; снаружи полосы стены по внешней нормали.
 * Перед кадром контейнер нужно очистить (как для марок стен).
 */
export function appendWindowOpeningLabels2d(
  container: Container,
  project: Project,
  t: ViewportTransform,
  appearance: WallMarkAppearance,
  options?: AppendWallMarkLabels2dOptions,
): void {
  const ctx = appearance === "context";
  const { fill: fillCol, outline: outlineCol } = readOpeningLabelColors();
  const dimProject = options?.dimensionProject;
  const dimCenters = dimProject ? collectDimensionLabelScreenPositions(dimProject, t) : [];
  const allWalls = project.walls;

  for (const o of project.openings) {
    if (o.kind !== "window" || o.wallId == null || o.offsetFromStartMm == null) {
      continue;
    }
    const wall = allWalls.find((w) => w.id === o.wallId);
    if (!wall) {
      continue;
    }
    const mark = o.markLabel?.trim();
    if (!mark) {
      continue;
    }
    const center = openingCenterOnWallMm(wall, o);
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      continue;
    }
    const ux = dx / len;
    const uy = dy / len;
    const { nx, ny } = exteriorNormalForWallLabelMm(wall, allWalls, allWalls);
    const halfT = wall.thicknessMm / 2;
    const ang = Math.atan2(dy, dx);
    const strokePx = Math.max(2, wall.thicknessMm * t.zoomPixelsPerMm);
    const fs = Math.max(7.2, Math.min(9.2, strokePx * 0.2 + 6.5));
    const lineGapMm = 4.5;
    const outsetMm = halfT + Math.max(55, 420 / t.zoomPixelsPerMm);

    const wMm = Math.round(o.widthMm);
    const hMm = Math.round(o.heightMm);
    const line2 = `${wMm}/${hMm}`;

    const tryOutset = (scale: number) => {
      const oMm = outsetMm * scale;
      const bx = center.x + nx * oMm;
      const by = center.y + ny * oMm;
      const offAlongWorld = (lineGapMm * 0.55) / t.zoomPixelsPerMm;
      const t1 = worldToScreen(bx - uy * offAlongWorld, by + ux * offAlongWorld, t);
      const t2 = worldToScreen(bx + uy * offAlongWorld, by - ux * offAlongWorld, t);
      const mid = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };
      const rApprox = Math.max(12, fs * 2.2);
      if (!isClearOfDimLabels(mid, dimCenters, rApprox)) {
        return null;
      }
      return { mid1: t1, mid2: t2 };
    };

    const pos = tryOutset(1) ?? tryOutset(1.35) ?? tryOutset(1.85);
    if (!pos) {
      continue;
    }

    const mkText = (text: string, x: number, y: number) => {
      const txt = new Text({
        text,
        style: {
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: fs,
          fill: fillCol,
          fontWeight: "600",
          stroke: { color: outlineCol, width: Math.max(1, fs * 0.1) },
        },
      });
      txt.anchor.set(0.5);
      txt.x = x;
      txt.y = y;
      txt.rotation = ang;
      txt.alpha = ctx ? 0.4 : 0.94;
      container.addChild(txt);
    };

    mkText(mark, pos.mid1.x, pos.mid1.y);
    mkText(line2, pos.mid2.x, pos.mid2.y);
  }
}
