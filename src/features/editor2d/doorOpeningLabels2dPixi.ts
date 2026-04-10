import { Container, Text } from "pixi.js";

import { openingCenterOnWallMm } from "@/core/domain/openingPlacement";
import type { Project } from "@/core/domain/project";
import { cssHexToPixiNumber } from "@/shared/cssColor";

import { collectDimensionLabelScreenPositions } from "./dimensions2dPixi";
import { openingPlanLabelRotationRad } from "./openingPlanLabelOrientation2d";
import { exteriorNormalForWallLabelMm } from "./wallLabelExteriorNormalMm";
import type { AppendWallMarkLabels2dOptions, WallMarkAppearance } from "./wallMarks2dPixi";
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

function doorOrderMap(project: Project): ReadonlyMap<string, number> {
  const doors = project.openings
    .filter((o): o is typeof o & { wallId: string; offsetFromStartMm: number } => {
      return o.kind === "door" && o.wallId != null && o.offsetFromStartMm != null;
    })
    .sort((a, b) => {
      if (a.wallId !== b.wallId) {
        return a.wallId.localeCompare(b.wallId);
      }
      if (a.offsetFromStartMm !== b.offsetFromStartMm) {
        return a.offsetFromStartMm - b.offsetFromStartMm;
      }
      return a.id.localeCompare(b.id);
    });
  const out = new Map<string, number>();
  for (let i = 0; i < doors.length; i++) {
    out.set(doors[i]!.id, i + 1);
  }
  return out;
}

/**
 * Подписи Д-n и ширина/высота — та же логика позиционирования, что у окон (внешняя сторона стены, анти-наложение с размерами плана).
 */
export function appendDoorOpeningLabels2d(
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
  const numberById = doorOrderMap(project);

  for (const o of project.openings) {
    if (o.kind !== "door" || o.wallId == null || o.offsetFromStartMm == null) {
      continue;
    }
    const wall = allWalls.find((w) => w.id === o.wallId);
    if (!wall) {
      continue;
    }
    const num = numberById.get(o.id) ?? 0;
    const line1 = `Д-${num}`;
    const center = openingCenterOnWallMm(wall, o);
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      continue;
    }
    const { nx, ny } = exteriorNormalForWallLabelMm(wall, allWalls, allWalls);
    const halfT = wall.thicknessMm / 2;
    const strokePx = Math.max(2, wall.thicknessMm * t.zoomPixelsPerMm);
    const fs = Math.max(7.2, Math.min(9.2, strokePx * 0.2 + 6.5));
    const lineGapMm = 16 / Math.max(0.01, t.zoomPixelsPerMm);
    const outsetMm = halfT + 14 / Math.max(0.01, t.zoomPixelsPerMm);

    const wMm = Math.round(o.widthMm);
    const hMm = Math.round(o.heightMm);
    const line2 = `${wMm}/${hMm}`;

    const tryOutset = (scale: number) => {
      const oMm = outsetMm * scale;
      const bx = center.x + nx * oMm;
      const by = center.y + ny * oMm;
      const mid = worldToScreen(bx, by, t);
      const rApprox = Math.max(12, fs * 2.2);
      if (!isClearOfDimLabels(mid, dimCenters, rApprox)) {
        return null;
      }
      return { mid };
    };

    const fallbackPos = (() => {
      const bx = center.x + nx * outsetMm;
      const by = center.y + ny * outsetMm;
      return {
        mid: worldToScreen(bx, by, t),
      };
    })();
    const pos = tryOutset(1) ?? tryOutset(1.2) ?? tryOutset(1.45) ?? fallbackPos;
    const label = new Text({
      text: `${line1}\n${line2}`,
      style: {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: fs,
        lineHeight: fs + Math.max(2, lineGapMm * t.zoomPixelsPerMm * 0.15),
        align: "center",
        fill: fillCol,
        fontWeight: "600",
        stroke: { color: outlineCol, width: Math.max(1, fs * 0.1) },
      },
    });
    label.anchor.set(0.5);
    label.x = pos.mid.x;
    label.y = pos.mid.y;
    label.rotation = openingPlanLabelRotationRad(dx, dy, t);
    label.alpha = ctx ? 0.4 : 0.94;
    container.addChild(label);
  }
}
