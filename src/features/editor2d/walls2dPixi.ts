import { Graphics } from "pixi.js";

import type { Project } from "@/core/domain/project";
import { getProfileById } from "@/core/domain/profileOps";
import type { Wall } from "@/core/domain/wall";
import {
  MIN_WALL_2D_LAYER_LINE_STROKE_PX,
  resolveWallProfileLayerStripsMm,
  type WallProfileLayerStripMm,
} from "@/core/domain/wallProfileLayers";

import { fillColor2dForMaterialType } from "./materials2d";
import { openingSlotCornersMm } from "./openingPlanGeometry2d";
import { quadCornersAlongWallMm } from "./wallPlanGeometry2d";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

/** Акцент и выделение — из design-tokens (accent, warning) */
const WALL_NORMAL = 0x5aa7ff;
const WALL_CONTEXT = 0x4a6a8a;
const WALL_SELECTED = 0xe7b65c;
/** Подсветка выбранной стены в послойном 2D: тонирование тела + тонкий контур по реальному периметру (без внешнего «ореола»). */
const WALL_SELECTED_BODY_OVERLAY_ALPHA = 0.22;
const WALL_SELECTED_EDGE_STROKE_PX = 1.2;
const WALL_SELECTED_EDGE_ALPHA = 0.9;
const OPENING_SLOT_FILL = 0x5aa7ff;
const OPENING_SLOT_EMPTY = 0x8b939e;
const OPENING_SLOT_STROKE = 0x2563eb;
const OPENING_SLOT_STROKE_SEL = 0xe7b65c;
const DOOR_ARC = 0x1f2937;

export type Draw2dLayerAppearance = "active" | "context";

export interface DrawWalls2dOptions {
  readonly appearance?: Draw2dLayerAppearance;
  /** Если false — дорисовать поверх уже нарисованного (без clear). */
  readonly clear?: boolean;
  /** false — одна полоса (как раньше); true — послойно по профилю. */
  readonly show2dProfileLayers?: boolean;
}

function wallStrokeAndFillColor(wall: Wall, project: Project): { stroke: number; fill: number } {
  const profile = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
  const mt = profile?.layers[0]?.materialType;
  if (!mt) {
    return { stroke: WALL_NORMAL, fill: WALL_NORMAL };
  }
  const fill = fillColor2dForMaterialType(mt);
  return { stroke: fill, fill };
}

export function drawDoorSwing2d(
  g: Graphics,
  wall: Wall,
  leftAlongMm: number,
  widthMm: number,
  swing: "in_right" | "in_left" | "out_right" | "out_left",
  t: ViewportTransform,
): void {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return;
  }
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const hingeAtStart = swing.endsWith("left");
  /** "in" = внутрь помещения, "out" = наружу; для нашей нормали знак должен быть инвертирован. */
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
  /** Открытое полотно = поворот закрытого на +/-90° вокруг петли. */
  const odx = sideSign > 0 ? -cdy : cdy;
  const ody = sideSign > 0 ? cdx : -cdx;
  const oex = hx + odx * leafLenMm;
  const oey = hy + ody * leafLenMm;

  const hs = worldToScreen(hx, hy, t);
  const os = worldToScreen(oex, oey, t);

  /** Рисуем только одно положение полотна (открытое), чтобы не было эффекта "двойного открытия". */
  g.moveTo(hs.x, hs.y);
  g.lineTo(os.x, os.y);
  g.stroke({ width: 1.5, color: DOOR_ARC, alpha: 0.96 });

  g.circle(hs.x, hs.y, Math.max(1.8, 1.8 + 0.2 * t.zoomPixelsPerMm));
  g.fill({ color: DOOR_ARC, alpha: 0.9 });

  /** Дуга строится в world-space тем же знаком поворота, что и открытое полотно. */
  const turn = sideSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  const steps = 20;
  g.moveTo(worldToScreen(cex, cey, t).x, worldToScreen(cex, cey, t).y);
  for (let i = 1; i <= steps; i++) {
    const a = (turn * i) / steps;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const vx = cdx * leafLenMm;
    const vy = cdy * leafLenMm;
    const rx = vx * ca - vy * sa;
    const ry = vx * sa + vy * ca;
    const px = hx + rx;
    const py = hy + ry;
    const sp = worldToScreen(px, py, t);
    g.lineTo(sp.x, sp.y);
  }
  g.stroke({ width: 1.05, color: DOOR_ARC, alpha: 0.6 });
}

function fillQuadMm(g: Graphics, corners: readonly { readonly x: number; readonly y: number }[], t: ViewportTransform, color: number, alpha: number): void {
  if (corners.length < 4) {
    return;
  }
  const s0 = worldToScreen(corners[0]!.x, corners[0]!.y, t);
  g.moveTo(s0.x, s0.y);
  for (let i = 1; i < 4; i++) {
    const si = worldToScreen(corners[i]!.x, corners[i]!.y, t);
    g.lineTo(si.x, si.y);
  }
  g.closePath();
  g.fill({ color, alpha });
}

function strokeQuadMm(
  g: Graphics,
  corners: readonly { readonly x: number; readonly y: number }[],
  t: ViewportTransform,
  color: number,
  alpha: number,
  width: number,
): void {
  if (corners.length < 4) {
    return;
  }
  const s0 = worldToScreen(corners[0]!.x, corners[0]!.y, t);
  g.moveTo(s0.x, s0.y);
  for (let i = 1; i < 4; i++) {
    const si = worldToScreen(corners[i]!.x, corners[i]!.y, t);
    g.lineTo(si.x, si.y);
  }
  g.closePath();
  g.stroke({ width, color, alpha, join: "miter" });
}

/** Маркеры концов оси стены: компактные, без визуального «раздувания» узла относительно толщины на экране. */
function drawWallAxisEndpointHandles(
  openingsG: Graphics,
  a: { x: number; y: number },
  b: { x: number; y: number },
  wallThicknessScreenPx: number,
): void {
  const r = Math.max(2.6, Math.min(5.2, wallThicknessScreenPx * 0.3));
  for (const p of [a, b]) {
    openingsG.circle(p.x, p.y, r);
    openingsG.fill({ color: WALL_SELECTED, alpha: 0.92 });
    openingsG.stroke({ width: 1, color: 0xffffff, alpha: 0.55 });
  }
}

function drawWallStrokeSimple(
  wallsG: Graphics,
  openingsG: Graphics,
  w: Wall,
  project: Project,
  t: ViewportTransform,
  showSel: boolean,
  ctx: boolean,
): void {
  const a = worldToScreen(w.start.x, w.start.y, t);
  const b = worldToScreen(w.end.x, w.end.y, t);
  const strokePx = Math.max(2, w.thicknessMm * t.zoomPixelsPerMm);
  const profileColor = wallStrokeAndFillColor(w, project);
  const color = showSel ? WALL_SELECTED : ctx ? WALL_CONTEXT : profileColor.stroke;
  const alpha = ctx ? 0.35 : showSel ? 1 : 0.95;

  wallsG.moveTo(a.x, a.y);
  wallsG.lineTo(b.x, b.y);
  wallsG.stroke({ width: strokePx, color, alpha, cap: "butt" });

  if (showSel) {
    drawWallAxisEndpointHandles(openingsG, a, b, strokePx);
  }
}

function drawWallLayeredPlan(
  wallsG: Graphics,
  openingsG: Graphics,
  w: Wall,
  strips: readonly WallProfileLayerStripMm[],
  t: ViewportTransform,
  showSel: boolean,
  ctx: boolean,
): void {
  const sx = w.start.x;
  const sy = w.start.y;
  const ex = w.end.x;
  const ey = w.end.y;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return;
  }
  const px = -dy / len;
  const py = dx / len;
  const T = w.thicknessMm;
  const wallThicknessScreenPx = Math.max(2, T * t.zoomPixelsPerMm);

  const fillAlpha = ctx ? 0.38 : 0.92;
  const edgeAlpha = ctx ? 0.1 : 0.18;
  const seamAlpha = ctx ? 0.12 : 0.26;

  let acc = -T / 2;
  for (const strip of strips) {
    const off0 = acc;
    const off1 = acc + strip.thicknessMm;
    acc = off1;
    const corners = quadCornersAlongWallMm(sx, sy, ex, ey, off0, off1);
    if (!corners) {
      continue;
    }
    fillQuadMm(wallsG, corners, t, fillColor2dForMaterialType(strip.materialType), fillAlpha);
    strokeQuadMm(wallsG, corners, t, 0x0f1218, edgeAlpha, MIN_WALL_2D_LAYER_LINE_STROKE_PX);
  }

  if (showSel && !ctx) {
    const outer = quadCornersAlongWallMm(sx, sy, ex, ey, -T / 2, T / 2);
    if (outer) {
      fillQuadMm(wallsG, outer, t, WALL_SELECTED, WALL_SELECTED_BODY_OVERLAY_ALPHA);
      strokeQuadMm(
        wallsG,
        outer,
        t,
        WALL_SELECTED,
        WALL_SELECTED_EDGE_ALPHA,
        WALL_SELECTED_EDGE_STROKE_PX,
      );
    }
  }

  acc = -T / 2;
  for (let i = 0; i < strips.length - 1; i++) {
    acc += strips[i]!.thicknessMm;
    const off = acc;
    const p0 = worldToScreen(sx + px * off, sy + py * off, t);
    const p1 = worldToScreen(ex + px * off, ey + py * off, t);
    wallsG.moveTo(p0.x, p0.y);
    wallsG.lineTo(p1.x, p1.y);
    wallsG.stroke({ width: MIN_WALL_2D_LAYER_LINE_STROKE_PX, color: 0x0a0c10, alpha: seamAlpha, cap: "butt" });
  }

  if (showSel && !ctx) {
    const a = worldToScreen(sx, sy, t);
    const b = worldToScreen(ex, ey, t);
    drawWallAxisEndpointHandles(openingsG, a, b, wallThicknessScreenPx);
  }
}

/**
 * Стены: обычные и выбранные; проёмы — точки по центру.
 * В режиме context слой приглушён, выделение не отображается.
 * Послойный режим: заливки по resolveWallProfileLayerStripsMm; обводки/швы — не ниже MIN_WALL_2D_LAYER_LINE_STROKE_PX.
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
  const show2dProfileLayers = options?.show2dProfileLayers !== false;
  if (clear) {
    wallsG.clear();
    openingsG.clear();
  }

  const ctx = appearance === "context";

  for (const w of project.walls) {
    const sel = selectedIds.has(w.id);
    const showSel = !ctx && sel;
    const profile = w.profileId ? getProfileById(project, w.profileId) : undefined;
    const strips =
      show2dProfileLayers && profile ? resolveWallProfileLayerStripsMm(w.thicknessMm, profile) : null;

    if (strips && strips.length >= 2) {
      drawWallLayeredPlan(wallsG, openingsG, w, strips, t, showSel, ctx);
    } else {
      drawWallStrokeSimple(wallsG, openingsG, w, project, t, showSel, ctx);
    }
  }

  for (const o of project.openings) {
    const wall = project.walls.find((wall) => wall.id === o.wallId);
    if (!wall || o.wallId == null || o.offsetFromStartMm == null) {
      continue;
    }
    const corners = openingSlotCornersMm(wall, o.offsetFromStartMm, o.widthMm, 1);
    if (!corners) {
      continue;
    }
    const sel = selectedIds.has(o.id);
    const showSel = !ctx && sel;
    const empty = o.isEmptyOpening === true;
    const fillCol = empty ? OPENING_SLOT_EMPTY : OPENING_SLOT_FILL;
    const fillA = ctx ? (empty ? 0.32 : 0.22) : empty ? 0.55 : 0.38;
    fillQuadMm(openingsG, corners, t, fillCol, fillA);
    const strokeCol = showSel ? OPENING_SLOT_STROKE_SEL : OPENING_SLOT_STROKE;
    const strokeW = showSel ? 2.2 : ctx ? 1 : 1.35;
    strokeQuadMm(openingsG, corners, t, strokeCol, ctx ? 0.45 : showSel ? 1 : 0.88, strokeW);
    if (showSel) {
      const hr = Math.max(2.5, 3);
      for (const c of corners) {
        const sc = worldToScreen(c.x, c.y, t);
        openingsG.circle(sc.x, sc.y, hr);
        openingsG.fill({ color: OPENING_SLOT_STROKE_SEL, alpha: 0.95 });
        openingsG.stroke({ width: 1, color: 0xffffff, alpha: 0.42 });
      }
    }
    if (empty && !ctx) {
      const mid = {
        x: (corners[0]!.x + corners[2]!.x) / 2,
        y: (corners[0]!.y + corners[2]!.y) / 2,
      };
      const s0 = worldToScreen(mid.x - 40, mid.y - 40, t);
      const s1 = worldToScreen(mid.x + 40, mid.y + 40, t);
      openingsG.moveTo(s0.x, s0.y);
      openingsG.lineTo(s1.x, s1.y);
      openingsG.stroke({ width: 1, color: 0x2a3038, alpha: 0.5 });
    }
    if (!ctx && o.kind === "door" && !empty) {
      drawDoorSwing2d(openingsG, wall, o.offsetFromStartMm, o.widthMm, o.doorSwing ?? "in_right", t);
    }
  }
}
