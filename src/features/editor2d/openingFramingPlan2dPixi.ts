import { Graphics } from "pixi.js";

import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";
import { boardCoreNormalOffsetsMm } from "@/core/domain/wallLumberBoard2dOffsets";
import { isOpeningPlacedOnWall } from "@/core/domain/opening";

import { quadCornersAlongWallMm } from "./wallPlanGeometry2d";
import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

/** Обрамление проёма в плане: только полоса «ядра» SIP, без подписей. */
const FRAMING_PLAN_FILL = 0x7a6b52;
const FRAMING_PLAN_ALPHA = 0.42;

function wallLengthMm(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

function coreOffsetsMm(wall: Wall, project: Project): { readonly offStartMm: number; readonly offEndMm: number } {
  const calc = project.wallCalculations.find((c) => c.wallId === wall.id);
  if (calc) {
    return boardCoreNormalOffsetsMm(wall, calc, project);
  }
  const T = wall.thicknessMm;
  const inset = T * 0.22;
  return { offStartMm: -T / 2 + inset, offEndMm: T / 2 - inset };
}

function studHalfAlongMm(project: Project, profileId: string): number {
  const p = getProfileById(project, profileId);
  const w = p?.layers[0]?.thicknessMm ?? 45;
  return Math.max(18, Math.min(55, w / 2));
}

function wallSegmentEndpoints(
  wall: Wall,
  s0: number,
  s1: number,
  lengthMm: number,
): { readonly sx: number; readonly sy: number; readonly ex: number; readonly ey: number } {
  const t0 = s0 / lengthMm;
  const t1 = s1 / lengthMm;
  return {
    sx: wall.start.x + (wall.end.x - wall.start.x) * t0,
    sy: wall.start.y + (wall.end.y - wall.start.y) * t0,
    ex: wall.start.x + (wall.end.x - wall.start.x) * t1,
    ey: wall.start.y + (wall.end.y - wall.start.y) * t1,
  };
}

function fillQuadMm(
  g: Graphics,
  corners: readonly { readonly x: number; readonly y: number }[],
  t: ViewportTransform,
  color: number,
  alpha: number,
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
  g.fill({ color, alpha });
}

function clampAlongOnWall(lo: number, hi: number, L: number): { lo: number; hi: number } | null {
  const a = Math.max(0, lo);
  const b = Math.min(L, hi);
  if (b - a < 8) {
    return null;
  }
  return { lo: a, hi: b };
}

/**
 * Геометрия обрамления окна на плане (в полосе ядра SIP). Без текстовых меток деталей.
 */
export function drawOpeningFramingPlan2d(
  g: Graphics,
  project: Project,
  visibleWallIds: ReadonlySet<string>,
  t: ViewportTransform,
): void {
  const wallById = new Map(project.walls.map((w) => [w.id, w]));
  const kindIndex = new Map<string, number>();

  for (const piece of project.openingFramingPieces) {
    if (!visibleWallIds.has(piece.wallId)) {
      continue;
    }
    const wall = wallById.get(piece.wallId);
    const opening = project.openings.find((o) => o.id === piece.openingId);
    if (!wall || !opening || !isOpeningPlacedOnWall(opening)) {
      continue;
    }
    const L = wallLengthMm(wall);
    if (L < 1) {
      continue;
    }
    const core = coreOffsetsMm(wall, project);
    const o0 = opening.offsetFromStartMm;
    const o1 = o0 + opening.widthMm;
    const uC = (o0 + o1) / 2;
    const halfAlong = studHalfAlongMm(project, piece.profileId);
    const k = `${piece.openingId}:${piece.kind}`;
    const idx = kindIndex.get(k) ?? 0;
    kindIndex.set(k, idx + 1);

    let a0 = o0;
    let a1 = o1;

    if (
      piece.kind === "above" ||
      piece.kind === "below" ||
      piece.kind === "lintel_top" ||
      piece.kind === "lintel_bottom"
    ) {
      const halfSpan = Math.min(piece.lengthMm / 2, L / 2);
      const seg = clampAlongOnWall(uC - halfSpan, uC + halfSpan, L);
      if (!seg) {
        continue;
      }
      a0 = seg.lo;
      a1 = seg.hi;
    } else if (piece.kind === "side_left" || piece.kind === "side_fix_left") {
      const pack = halfAlong + idx * 28;
      const seg = clampAlongOnWall(o0 - pack - halfAlong, o0 - pack + halfAlong, L);
      if (!seg) {
        continue;
      }
      a0 = seg.lo;
      a1 = seg.hi;
    } else if (piece.kind === "side_right" || piece.kind === "side_fix_right") {
      const pack = halfAlong + idx * 28;
      const seg = clampAlongOnWall(o1 + pack - halfAlong, o1 + pack + halfAlong, L);
      if (!seg) {
        continue;
      }
      a0 = seg.lo;
      a1 = seg.hi;
    }

    const seg = wallSegmentEndpoints(wall, a0, a1, L);
    const corners = quadCornersAlongWallMm(seg.sx, seg.sy, seg.ex, seg.ey, core.offStartMm, core.offEndMm);
    if (corners) {
      fillQuadMm(g, corners, t, FRAMING_PLAN_FILL, FRAMING_PLAN_ALPHA);
    }
  }
}
