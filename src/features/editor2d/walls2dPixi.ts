import { Graphics } from "pixi.js";

import type { Project } from "@/core/domain/project";
import { getProfileById } from "@/core/domain/profileOps";
import type { Wall } from "@/core/domain/wall";
import {
  MIN_LAYERED_WALL_SCREEN_THICKNESS_PX,
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
const OPENING_SLOT_FILL = 0x5aa7ff;
const OPENING_SLOT_EMPTY = 0x8b939e;
const OPENING_SLOT_STROKE = 0x2563eb;
const OPENING_SLOT_STROKE_SEL = 0xe7b65c;

export type Draw2dLayerAppearance = "active" | "context";

export interface DrawWalls2dOptions {
  readonly appearance?: Draw2dLayerAppearance;
  /** Если false — дорисовать поверх уже нарисованного (без clear). */
  readonly clear?: boolean;
  /** false — одна полоса (как раньше); true — послойно при достаточном zoom. */
  readonly show2dProfileLayers?: boolean;
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

function drawWallStrokeSimple(
  wallsG: Graphics,
  openingsG: Graphics,
  w: Wall,
  t: ViewportTransform,
  showSel: boolean,
  ctx: boolean,
): void {
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
  const strokePx = Math.max(2, T * t.zoomPixelsPerMm);

  const fillAlpha = ctx ? 0.38 : showSel ? 0.98 : 0.92;
  const edgeAlpha = ctx ? 0.1 : 0.18;
  const seamAlpha = ctx ? 0.12 : 0.26;

  if (showSel && !ctx) {
    const outer = quadCornersAlongWallMm(sx, sy, ex, ey, -T / 2, T / 2);
    if (outer) {
      strokeQuadMm(wallsG, outer, t, 0x000000, 0.4, Math.max(2, strokePx * 0.06 + 2));
    }
  }

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
    strokeQuadMm(wallsG, corners, t, 0x0f1218, edgeAlpha, 1);
  }

  acc = -T / 2;
  for (let i = 0; i < strips.length - 1; i++) {
    acc += strips[i]!.thicknessMm;
    const off = acc;
    const p0 = worldToScreen(sx + px * off, sy + py * off, t);
    const p1 = worldToScreen(ex + px * off, ey + py * off, t);
    wallsG.moveTo(p0.x, p0.y);
    wallsG.lineTo(p1.x, p1.y);
    wallsG.stroke({ width: 1, color: 0x0a0c10, alpha: seamAlpha, cap: "butt" });
  }

  if (showSel && !ctx) {
    const a = worldToScreen(sx, sy, t);
    const b = worldToScreen(ex, ey, t);
    const r = Math.max(4, strokePx * 0.55);
    for (const p of [a, b]) {
      openingsG.circle(p.x, p.y, r * 0.45);
      openingsG.fill({ color: WALL_SELECTED, alpha: 0.9 });
      openingsG.stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    }
  }
}

/**
 * Стены: обычные и выбранные; проёмы — точки по центру.
 * В режиме context слой приглушён, выделение не отображается.
 * Послойный режим: заливки по resolveWallProfileLayerStripsMm при достаточной толщине на экране.
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
    const strokePx = Math.max(2, w.thicknessMm * t.zoomPixelsPerMm);
    const strips =
      show2dProfileLayers && strokePx >= MIN_LAYERED_WALL_SCREEN_THICKNESS_PX && profile
        ? resolveWallProfileLayerStripsMm(w.thicknessMm, profile)
        : null;

    if (strips && strips.length >= 2) {
      drawWallLayeredPlan(wallsG, openingsG, w, strips, t, showSel, ctx);
    } else {
      drawWallStrokeSimple(wallsG, openingsG, w, t, showSel, ctx);
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
  }
}
