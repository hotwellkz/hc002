/**
 * Авто-отступ внешних габаритных размеров прямоугольника (2D-план): размерная линия и выноски
 * уходят дальше от контура, если снаружи есть подписи проёмов, дуги дверей, приблизительно — марки стен.
 * Всё в мировых мм, без zoom — стабильно при масштабировании.
 */

import type { Dimension } from "@/core/domain/dimension";
import { isOpeningPlacedOnWall, type DoorOpeningSwing } from "@/core/domain/opening";
import { openingCenterOnWallMm } from "@/core/domain/openingPlacement";
import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";

import { exteriorNormalForWallLabelMm } from "./wallLabelExteriorNormalMm";

/** Минимальный зазор за выступающей аннотацией (мм), не меньше шага сетки подставляется отдельно. */
export const OUTER_DIMENSION_CLEARANCE_PAD_MIN_MM = 180;

/** Запас под двухстрочную подпись ОК/Д от полосы стены (мм), фиксированный — без привязки к zoom. */
const OPENING_LABEL_OUTSET_FROM_MID_MM = 380;

/** Приблизительный вынос марки стены от середины оси (мм). */
const WALL_MARK_APPROX_OUTSET_MM = 280;

function outwardScalarMm(
  px: number,
  py: number,
  ref: { readonly x: number; readonly y: number },
  nx: number,
  ny: number,
): number {
  return (px - ref.x) * nx + (py - ref.y) * ny;
}

function collectDoorSwingWorldPointsMm(
  wall: Wall,
  leftAlongMm: number,
  widthMm: number,
  swing: DoorOpeningSwing,
): { readonly x: number; readonly y: number }[] {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return [];
  }
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const hingeAtStart = swing.endsWith("left");
  const inward = swing.startsWith("in");
  const sideSign = inward ? -1 : 1;
  const leafLenMm = Math.max(120, widthMm);
  const halfT = Math.max(1, wall.thicknessMm * 0.5);
  const normalInsetMm = Math.max(2, Math.min(halfT - 1, 5));
  const hingeNormalMm = sideSign * Math.max(0, halfT - normalInsetMm);
  const hingeAlong = hingeAtStart ? leftAlongMm : leftAlongMm + widthMm;
  const closedAlongDir = hingeAtStart ? 1 : -1;

  const hx = wall.start.x + ux * hingeAlong + nx * hingeNormalMm;
  const hy = wall.start.y + uy * hingeAlong + ny * hingeNormalMm;
  const cdx = ux * closedAlongDir;
  const cdy = uy * closedAlongDir;
  const cex = hx + cdx * leafLenMm;
  const cey = hy + cdy * leafLenMm;
  const odx = sideSign > 0 ? -cdy : cdy;
  const ody = sideSign > 0 ? cdx : -cdx;
  const oex = hx + odx * leafLenMm;
  const oey = hy + ody * leafLenMm;

  const out: { x: number; y: number }[] = [
    { x: hx, y: hy },
    { x: cex, y: cey },
    { x: oex, y: oey },
  ];
  const turn = sideSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const a = (turn * i) / steps;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const vx = cdx * leafLenMm;
    const vy = cdy * leafLenMm;
    const rx = vx * ca - vy * sa;
    const ry = vx * sa + vy * ca;
    out.push({ x: hx + rx, y: hy + ry });
  }
  return out;
}

function rectangleWallsForDimension(project: Project, d: Dimension): readonly Wall[] {
  const layerId = d.layerId ?? project.activeLayerId;
  const ids = new Set(d.wallIds ?? []);
  if (ids.size === 0) {
    return [];
  }
  return project.walls.filter((w) => w.layerId === layerId && ids.has(w.id));
}

function dimOutwardNormal(d: Dimension): { readonly nx: number; readonly ny: number } | null {
  if (d.kind === "rectangle_outer_horizontal") {
    return { nx: 0, ny: -1 };
  }
  if (d.kind === "rectangle_outer_vertical") {
    return { nx: 1, ny: 0 };
  }
  return null;
}

/**
 * Минимальное эффективное смещение размерной линии от линии измерения (мм), в тех же единицах,
 * что и аргумент `offsetMm` в `planDimensionMidWorldMm` / `drawPlanCadDimension2d` после суммирования
 * с {@link PLAN_2D_DIMENSION_OFFSET_EXTRA_MM} в вызывающем коде — здесь возвращаем **уже итоговую**
 * величину «линия измерения → размерная линия», округлённую вверх по шагу сетки.
 *
 * Если габарит не прямоугольный или нет стен — null (использовать только базовый offset).
 */
export function computeRectangleOuterDimensionMinEffectiveOffsetMm(project: Project, d: Dimension): number | null {
  const n = dimOutwardNormal(d);
  if (!n) {
    return null;
  }
  const walls = rectangleWallsForDimension(project, d);
  if (walls.length === 0) {
    return null;
  }

  const ref = d.a;
  let maxOut = 0;

  const rectWalls = walls;

  for (const w of walls) {
    for (const o of project.openings) {
      if (!isOpeningPlacedOnWall(o) || o.wallId !== w.id) {
        continue;
      }
      const { nx: enx, ny: eny } = exteriorNormalForWallLabelMm(w, rectWalls, project.walls);
      const halfT = w.thicknessMm / 2;
      const c = openingCenterOnWallMm(w, o);
      const lx = c.x + enx * (halfT + OPENING_LABEL_OUTSET_FROM_MID_MM);
      const ly = c.y + eny * (halfT + OPENING_LABEL_OUTSET_FROM_MID_MM);
      maxOut = Math.max(maxOut, outwardScalarMm(lx, ly, ref, n.nx, n.ny));

      if (o.kind === "door") {
        const swing = o.doorSwing ?? "in_right";
        for (const p of collectDoorSwingWorldPointsMm(w, o.offsetFromStartMm, o.widthMm, swing)) {
          maxOut = Math.max(maxOut, outwardScalarMm(p.x, p.y, ref, n.nx, n.ny));
        }
      }
    }

    const mark = w.markLabel?.trim();
    if (mark) {
      const { nx: mnx, ny: mny } = exteriorNormalForWallLabelMm(w, rectWalls, project.walls);
      const halfT = w.thicknessMm / 2;
      const mx = (w.start.x + w.end.x) / 2;
      const my = (w.start.y + w.end.y) / 2;
      const ax = mx + mnx * (halfT + WALL_MARK_APPROX_OUTSET_MM);
      const ay = my + mny * (halfT + WALL_MARK_APPROX_OUTSET_MM);
      maxOut = Math.max(maxOut, outwardScalarMm(ax, ay, ref, n.nx, n.ny));
    }
  }

  const grid = project.settings.gridStepMm;
  const pad = Math.max(OUTER_DIMENSION_CLEARANCE_PAD_MIN_MM, Number.isFinite(grid) && grid > 0 ? grid : 0);
  const raw = maxOut + pad;
  if (!Number.isFinite(raw) || raw < 0) {
    return null;
  }
  if (Number.isFinite(grid) && grid > 0) {
    return Math.ceil(raw / grid) * grid;
  }
  return raw;
}
