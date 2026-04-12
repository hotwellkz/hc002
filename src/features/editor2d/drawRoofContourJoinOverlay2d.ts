import { Graphics } from "pixi.js";

import type { RoofContourJoinSession } from "@/core/domain/roofContourJoin";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import { roofJoinArrowUnitWorldMm } from "@/core/domain/roofContourJoinGeometry";
import type { Point2D } from "@/core/geometry/types";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";
import { worldToScreen } from "@/core/geometry/viewportTransform";

const RED = 0xef4444;
const GREEN = 0x22c55e;
const BLUE = 0x3b82f6;
const EDGE_ARROW = 0x1e40af;

/** Стрелка в экранных пикселях: направление (dirSx, dirSy), центр в середине ребра. */
function drawJoinNormalArrowPx(
  g: Graphics,
  midSx: number,
  midSy: number,
  dirSx: number,
  dirSy: number,
  color: number,
): void {
  const len = Math.hypot(dirSx, dirSy);
  if (len < 4) {
    return;
  }
  const ux = dirSx / len;
  const uy = dirSy / len;
  const half = Math.min(38, Math.max(18, len * 0.45));
  const tail = 0.35;
  const x1 = midSx - ux * half * tail;
  const y1 = midSy - uy * half * tail;
  const x2 = midSx + ux * half * (1 - tail);
  const y2 = midSy + uy * half * (1 - tail);
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke({ width: 1.25, color, alpha: 0.95, cap: "round" });
  const head = Math.min(8, half * 0.38);
  const bx2 = x2 - ux * head;
  const by2 = y2 - uy * head;
  const px = -uy * (head * 0.48);
  const py = ux * (head * 0.48);
  g.moveTo(x2, y2);
  g.lineTo(bx2 + px, by2 + py);
  g.lineTo(bx2 - px, by2 - py);
  g.closePath();
  g.fill({ color, alpha: 0.92 });
}

function drawPolyOutlinePx(
  g: Graphics,
  poly: readonly Point2D[],
  t: ViewportTransform,
  strokeW: number,
  color: number,
  alpha: number,
): void {
  if (poly.length < 2) {
    return;
  }
  const p0 = worldToScreen(poly[0]!.x, poly[0]!.y, t);
  g.moveTo(p0.x, p0.y);
  for (let i = 1; i < poly.length; i++) {
    const p = worldToScreen(poly[i]!.x, poly[i]!.y, t);
    g.lineTo(p.x, p.y);
  }
  g.closePath();
  g.stroke({ width: strokeW, color, alpha, cap: "round", join: "round" });
}

function drawCornerNodesPx(
  g: Graphics,
  poly: readonly Point2D[],
  t: ViewportTransform,
  rPx: number,
): void {
  for (const p of poly) {
    const s = worldToScreen(p.x, p.y, t);
    g.circle(s.x, s.y, rPx);
    g.fill({ color: BLUE, alpha: 0.92 });
    g.stroke({ width: 0.9, color: 0xffffff, alpha: 0.35 });
  }
}

function drawEdgeAccentPx(
  g: Graphics,
  poly: readonly Point2D[],
  edgeIndex: number,
  t: ViewportTransform,
  width: number,
  color: number,
  towardWorld: Point2D | null,
): void {
  const n = poly.length;
  if (edgeIndex < 0 || edgeIndex >= n) {
    return;
  }
  const a = poly[edgeIndex]!;
  const b = poly[(edgeIndex + 1) % n]!;
  const sa = worldToScreen(a.x, a.y, t);
  const sb = worldToScreen(b.x, b.y, t);
  g.moveTo(sa.x, sa.y);
  g.lineTo(sb.x, sb.y);
  g.stroke({ width, color, alpha: 0.95, cap: "round" });
  const arrowCol = color === GREEN ? 0x15803d : EDGE_ARROW;
  const dirW = roofJoinArrowUnitWorldMm(poly, edgeIndex, towardWorld);
  if (!dirW) {
    return;
  }
  const midWx = (a.x + b.x) * 0.5;
  const midWy = (a.y + b.y) * 0.5;
  const stepMm = 520;
  const tip = worldToScreen(midWx + dirW.x * stepMm, midWy + dirW.y * stepMm, t);
  const midS = worldToScreen(midWx, midWy, t);
  drawJoinNormalArrowPx(g, midS.x, midS.y, tip.x - midS.x, tip.y - midS.y, arrowCol);
}

function edgeMidpointMm(poly: readonly Point2D[], edgeIndex: number): Point2D {
  const n = poly.length;
  const p0 = poly[edgeIndex % n]!;
  const p1 = poly[(edgeIndex + 1) % n]!;
  return { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
}

/** Подсветка инструмента «Соединить контур» поверх плоскостей крыши. */
export function drawRoofContourJoinOverlay2d(
  g: Graphics,
  session: RoofContourJoinSession,
  planes: readonly RoofPlaneEntity[],
  t: ViewportTransform,
): void {
  g.clear();
  const map = new Map(planes.map((p) => [p.id, p]));

  const drawPlaneState = (
    id: string,
    mode: "red" | "green",
    edgeHi: number | null,
    edgeBold: boolean,
    towardWorld: Point2D | null,
  ): void => {
    const rp = map.get(id);
    if (!rp) {
      return;
    }
    const poly = roofPlanePolygonMm(rp);
    if (poly.length < 3) {
      return;
    }
    const col = mode === "green" ? GREEN : RED;
    const baseW = mode === "green" ? 1.85 : 1.65;
    drawPolyOutlinePx(g, poly, t, baseW, col, mode === "green" ? 0.88 : 0.82);
    drawCornerNodesPx(g, poly, t, 3.2);
    if (edgeHi != null && edgeHi >= 0 && edgeHi < poly.length) {
      const ec = mode === "green" ? GREEN : RED;
      drawEdgeAccentPx(g, poly, edgeHi, t, edgeBold ? 3.1 : 2.35, ec, towardWorld);
    }
  };

  if (session.phase === "pickSourceEdge") {
    if (session.hoverPlaneId) {
      drawPlaneState(session.hoverPlaneId, "red", session.hoverEdgeIndex, true, null);
    }
    return;
  }

  const tgtRp = session.targetHoverPlaneId ? map.get(session.targetHoverPlaneId) : undefined;
  let towardForSource: Point2D | null = null;
  if (tgtRp && session.targetHoverEdgeIndex != null) {
    const polyT = roofPlanePolygonMm(tgtRp);
    if (session.targetHoverEdgeIndex < polyT.length) {
      towardForSource = edgeMidpointMm(polyT, session.targetHoverEdgeIndex);
    }
  }

  let towardForTarget: Point2D | null = null;
  if (session.sourcePlaneId && session.sourceEdgeIndex != null) {
    const srcRp = map.get(session.sourcePlaneId);
    if (srcRp) {
      const polyS = roofPlanePolygonMm(srcRp);
      if (session.sourceEdgeIndex < polyS.length) {
        towardForTarget = edgeMidpointMm(polyS, session.sourceEdgeIndex);
      }
    }
  }

  if (session.sourcePlaneId) {
    drawPlaneState(session.sourcePlaneId, "green", session.sourceEdgeIndex, false, towardForSource);
  }
  if (session.targetHoverPlaneId) {
    drawPlaneState(
      session.targetHoverPlaneId,
      "red",
      session.targetHoverEdgeIndex,
      Boolean(session.targetHoverEdgeIndex != null),
      towardForTarget,
    );
  }
}
