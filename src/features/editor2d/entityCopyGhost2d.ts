/**
 * Предпросмотр копии: полупрозрачная геометрия со сдвигом Δ от исходного объекта.
 */

import { Graphics } from "pixi.js";
import type { EntityCopyTarget } from "@/core/domain/entityCopySession";
import type { FoundationStripEntity } from "@/core/domain/foundationStrip";
import {
  foundationStripOrthoRingFootprintContoursFromEntityMm,
  foundationStripSegmentFootprintQuadMm,
} from "@/core/domain/foundationStripGeometry";
import { floorBeamPlanQuadCornersMm } from "@/core/domain/floorBeamGeometry";
import type { Project } from "@/core/domain/project";
import { getProfileById } from "@/core/domain/profileOps";
import { isOpeningPlacedOnWall } from "@/core/domain/opening";
import { resolveWallProfileLayerStripsForWallVisualization } from "@/core/domain/wallProfileLayers";
import type { Wall } from "@/core/domain/wall";
import { wallStripQuadCornersMm } from "@/core/geometry/snap2d";
import type { Point2D } from "@/core/geometry/types";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";
import { worldToScreen } from "@/core/geometry/viewportTransform";

const GHOST_ALPHA = 0.38;
const GHOST_COLOR = 0x38bdf8;

function shift(p: Point2D, dx: number, dy: number): Point2D {
  return { x: p.x + dx, y: p.y + dy };
}

function strokeQuad(g: Graphics, quad: readonly Point2D[], t: ViewportTransform, dx: number, dy: number): void {
  if (quad.length < 2) {
    return;
  }
  const s0 = worldToScreen(quad[0]!.x + dx, quad[0]!.y + dy, t);
  g.moveTo(s0.x, s0.y);
  for (let i = 1; i < quad.length; i += 1) {
    const si = worldToScreen(quad[i]!.x + dx, quad[i]!.y + dy, t);
    g.lineTo(si.x, si.y);
  }
  g.closePath();
  g.stroke({ width: 1.25, color: GHOST_COLOR, alpha: GHOST_ALPHA });
}

function wallGhostQuads(w: Wall, project: Project, dx: number, dy: number, g: Graphics, t: ViewportTransform): void {
  const sx = w.start.x;
  const sy = w.start.y;
  const ex = w.end.x;
  const ey = w.end.y;
  const T = w.thicknessMm;
  if (!Number.isFinite(T) || T <= 0) {
    return;
  }
  const profile = w.profileId ? getProfileById(project, w.profileId) : undefined;
  const strips = profile ? resolveWallProfileLayerStripsForWallVisualization(T, profile) : null;
  if (strips && strips.length > 0) {
    let acc = -T / 2;
    for (const strip of strips) {
      const off0 = acc;
      const off1 = acc + strip.thicknessMm;
      const q = wallStripQuadCornersMm(sx, sy, ex, ey, off0, off1);
      if (q) {
        strokeQuad(g, q, t, dx, dy);
      }
      acc = off1;
    }
  } else {
    const q = wallStripQuadCornersMm(sx, sy, ex, ey, -T / 2, T / 2);
    if (q) {
      strokeQuad(g, q, t, dx, dy);
    }
  }
}

function openingSlotCornersMm(
  wall: Wall,
  leftAlongMm: number,
  openingWidthMm: number,
  insetFromHalfThicknessMm: number,
): Point2D[] | null {
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return null;
  }
  const ux = dx / len;
  const uy = dy / len;
  const T = wall.thicknessMm;
  const h = Math.max(0, T / 2 - insetFromHalfThicknessMm);
  const w0 = leftAlongMm;
  const w1 = leftAlongMm + openingWidthMm;
  return [
    { x: sx + ux * w0 + uy * h, y: sy + uy * w0 - ux * h },
    { x: sx + ux * w1 + uy * h, y: sy + uy * w1 - ux * h },
    { x: sx + ux * w1 - uy * h, y: sy + uy * w1 + ux * h },
    { x: sx + ux * w0 - uy * h, y: sy + uy * w0 + ux * h },
  ];
}

export function drawEntityCopyGhost2d(
  g: Graphics,
  project: Project,
  target: EntityCopyTarget,
  dxMm: number,
  dyMm: number,
  t: ViewportTransform,
): void {
  g.clear();
  if (!(Number.isFinite(dxMm) && Number.isFinite(dyMm))) {
    return;
  }

  if (target.kind === "wall") {
    const w = project.walls.find((x) => x.id === target.id);
    if (w) {
      wallGhostQuads(w, project, dxMm, dyMm, g, t);
    }
    return;
  }

  if (target.kind === "planLine") {
    const ln = project.planLines.find((x) => x.id === target.id);
    if (!ln) {
      return;
    }
    const a = worldToScreen(ln.start.x + dxMm, ln.start.y + dyMm, t);
    const b = worldToScreen(ln.end.x + dxMm, ln.end.y + dyMm, t);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({ width: 2, color: GHOST_COLOR, alpha: GHOST_ALPHA });
    return;
  }

  if (target.kind === "foundationPile") {
    const pile = project.foundationPiles.find((x) => x.id === target.id);
    if (!pile) {
      return;
    }
    const h = Math.max(pile.capSizeMm, pile.sizeMm) / 2;
    const cx = pile.centerX + dxMm;
    const cy = pile.centerY + dyMm;
    const q: Point2D[] = [
      { x: cx - h, y: cy - h },
      { x: cx + h, y: cy - h },
      { x: cx + h, y: cy + h },
      { x: cx - h, y: cy + h },
    ];
    strokeQuad(g, q, t, 0, 0);
    return;
  }

  if (target.kind === "floorBeam") {
    const beam = project.floorBeams.find((x) => x.id === target.id);
    if (!beam) {
      return;
    }
    const q = floorBeamPlanQuadCornersMm(project, beam);
    if (!q || q.length < 4) {
      return;
    }
    const shifted = q.map((p) => shift(p, dxMm, dyMm));
    strokeQuad(g, shifted, t, 0, 0);
    return;
  }

  if (target.kind === "foundationStrip") {
    const e: FoundationStripEntity | undefined = project.foundationStrips.find((x) => x.id === target.id);
    if (!e) {
      return;
    }
    const rings: readonly (readonly Point2D[])[] =
      e.kind === "ortho_ring"
        ? (() => {
            const { outer, inner } = foundationStripOrthoRingFootprintContoursFromEntityMm(e);
            return [outer, inner];
          })()
        : e.kind === "footprint_poly"
          ? [e.outerRingMm, ...e.holeRingsMm]
          : [
              foundationStripSegmentFootprintQuadMm(
                e.axisStart,
                e.axisEnd,
                e.outwardNormalX,
                e.outwardNormalY,
                e.sideOutMm,
                e.sideInMm,
              ),
            ];
    for (const ring of rings) {
      if (ring.length < 2) {
        continue;
      }
      const shifted = ring.map((p) => shift(p, dxMm, dyMm));
      strokeQuad(g, shifted, t, 0, 0);
    }
    return;
  }

  if (target.kind === "opening") {
    const o = project.openings.find((x) => x.id === target.id);
    if (!o || !isOpeningPlacedOnWall(o)) {
      return;
    }
    const wall = project.walls.find((w) => w.id === o.wallId);
    if (!wall) {
      return;
    }
    const q = openingSlotCornersMm(wall, o.offsetFromStartMm, o.widthMm, 0);
    if (!q) {
      return;
    }
    const shifted = q.map((p) => shift(p, dxMm, dyMm));
    strokeQuad(g, shifted, t, 0, 0);
  }
}
