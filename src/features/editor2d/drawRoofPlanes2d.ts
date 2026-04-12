import { Graphics } from "pixi.js";

import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePerpCcWMm, roofPlanePolygonMm } from "@/core/domain/roofPlane";
import type { Point2D } from "@/core/geometry/types";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";
import { worldToScreen } from "@/core/geometry/viewportTransform";

import type { RoofLabelLayout2d } from "./roofPlaneLabelLayout2d";

const STROKE = 0x64748b;
const STROKE_ALPHA = 0.92;
const STROKE_WIDTH = 1.2;

const SEL_STROKE = 0x3b82f6;
const SEL_ALPHA = 0.95;

const PREVIEW = 0x0ea5e9;
const ARROW = 0x475569;

function drawArrowOnSegmentPx(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  color: number,
  alpha: number,
  width: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 4) {
    return;
  }
  const ux = dx / len;
  const uy = dy / len;
  const midX = (ax + bx) * 0.5;
  const midY = (ay + by) * 0.5;
  const half = Math.min(len * 0.38, 56);
  const x1 = midX - ux * half;
  const y1 = midY - uy * half;
  const x2 = midX + ux * half;
  const y2 = midY + uy * half;
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke({ width, color, alpha, cap: "round" });

  const head = Math.min(11, half * 0.45);
  const bx2 = x2 - ux * head;
  const by2 = y2 - uy * head;
  const px = -uy * (head * 0.55);
  const py = ux * (head * 0.55);
  g.moveTo(x2, y2);
  g.lineTo(bx2 + px, by2 + py);
  g.lineTo(bx2 - px, by2 - py);
  g.closePath();
  g.fill({ color, alpha });
}

/** Стрелка направления стока (slopeDirection): к низу ската, не в сторону выдавливания. */
export function drawRoofPlaneSlopeArrowPx(
  g: Graphics,
  rp: RoofPlaneEntity,
  t: ViewportTransform,
  opts?: { readonly color?: number; readonly alpha?: number; readonly width?: number },
  layout?: RoofLabelLayout2d | null,
): void {
  const line = layout?.arrowLinePx ?? null;
  if (line) {
    drawArrowOnSegmentPx(
      g,
      line.x1,
      line.y1,
      line.x2,
      line.y2,
      opts?.color ?? ARROW,
      opts?.alpha ?? 0.88,
      opts?.width ?? 1.15,
    );
    return;
  }
  const poly = roofPlanePolygonMm(rp);
  if (poly.length < 3) {
    return;
  }
  const fall = rp.slopeDirection;
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;
  let minX = poly[0]!.x;
  let maxX = poly[0]!.x;
  let minY = poly[0]!.y;
  let maxY = poly[0]!.y;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const arrowLenMm = Math.min(rp.depthMm * 0.55, Math.max(span * 0.22, 600));
  const ax = cx - fall.x * arrowLenMm * 0.42;
  const ay = cy - fall.y * arrowLenMm * 0.42;
  const bx = cx + fall.x * arrowLenMm * 0.58;
  const by = cy + fall.y * arrowLenMm * 0.58;
  const a = worldToScreen(ax, ay, t);
  const b = worldToScreen(bx, by, t);
  drawArrowOnSegmentPx(
    g,
    a.x,
    a.y,
    b.x,
    b.y,
    opts?.color ?? ARROW,
    opts?.alpha ?? 0.88,
    opts?.width ?? 1.15,
  );
}

export function drawRoofPlanes2d(
  g: Graphics,
  planes: readonly RoofPlaneEntity[],
  t: ViewportTransform,
  selectedIds: ReadonlySet<string>,
  opts?: {
    readonly clear?: boolean;
    /** Общая раскладка подписей/стрелок по id плоскости (стрелка совпадает с текстовым блоком). */
    readonly labelLayoutByPlaneId?: ReadonlyMap<string, RoofLabelLayout2d>;
  },
): void {
  if (opts?.clear !== false) {
    g.clear();
  }
  for (const rp of planes) {
    const poly = roofPlanePolygonMm(rp);
    if (poly.length < 3) {
      continue;
    }
    const sel = selectedIds.has(rp.id);
    const col = sel ? SEL_STROKE : STROKE;
    const al = sel ? SEL_ALPHA : STROKE_ALPHA;
    const w = sel ? 1.3 : STROKE_WIDTH;
    const p0 = worldToScreen(poly[0]!.x, poly[0]!.y, t);
    g.moveTo(p0.x, p0.y);
    for (let i = 1; i < poly.length; i++) {
      const p = worldToScreen(poly[i]!.x, poly[i]!.y, t);
      g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.stroke({ width: w, color: col, alpha: al, cap: "round", join: "round" });
    const layout = opts?.labelLayoutByPlaneId?.get(rp.id) ?? null;
    drawRoofPlaneSlopeArrowPx(g, rp, t, undefined, layout);
  }
}

export function drawRoofPlanePlacementPreview2d(
  g: Graphics,
  input: {
    readonly phase: "waitingSecondPoint" | "waitingDepth";
    readonly p1: Point2D;
    readonly p2OrPreview: Point2D;
    readonly depthNormal: Point2D | null;
    readonly depthMm: number | null;
  },
  t: ViewportTransform,
): void {
  g.clear();
  const { phase, p1 } = input;
  const p2e = input.p2OrPreview;
  const a0 = worldToScreen(p1.x, p1.y, t);
  const a1 = worldToScreen(p2e.x, p2e.y, t);
  g.moveTo(a0.x, a0.y);
  g.lineTo(a1.x, a1.y);
  g.stroke({ width: 1.35, color: PREVIEW, alpha: 0.9, cap: "round" });

  const nHint = roofPlanePerpCcWMm(p1, p2e);
  if (nHint && phase === "waitingSecondPoint") {
    const mid = { x: (p1.x + p2e.x) * 0.5, y: (p1.y + p2e.y) * 0.5 };
    const scMid = worldToScreen(mid.x, mid.y, t);
    const lenEdge = Math.hypot(p2e.x - p1.x, p2e.y - p1.y);
    const arrowLenMm = Math.min(Math.max(lenEdge * 0.22, 280), 1200);
    // Подсказка направления стока (против CCW-нормали), если затем тянуть в сторону +nHint.
    const fallHint = { x: -nHint.x, y: -nHint.y };
    const b = worldToScreen(mid.x + fallHint.x * arrowLenMm, mid.y + fallHint.y * arrowLenMm, t);
    drawArrowOnSegmentPx(g, scMid.x, scMid.y, b.x, b.y, ARROW, 0.82, 1.1);
  }

  if (phase === "waitingDepth" && input.depthNormal && input.depthMm != null && input.depthMm > 0.5) {
    const n = input.depthNormal;
    const d = input.depthMm;
    const poly: Point2D[] = [p1, p2e, { x: p2e.x + n.x * d, y: p2e.y + n.y * d }, { x: p1.x + n.x * d, y: p1.y + n.y * d }];
    const s0 = worldToScreen(poly[0]!.x, poly[0]!.y, t);
    g.moveTo(s0.x, s0.y);
    for (let i = 1; i < poly.length; i++) {
      const p = worldToScreen(poly[i]!.x, poly[i]!.y, t);
      g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.stroke({ width: 1.25, color: PREVIEW, alpha: 0.85, cap: "round", join: "round" });

    const midBase = { x: (p1.x + p2e.x) * 0.5, y: (p1.y + p2e.y) * 0.5 };
    const fallPrev = { x: -n.x, y: -n.y };
    const midRect = { x: midBase.x + n.x * d * 0.5, y: midBase.y + n.y * d * 0.5 };
    const edgeLen = Math.hypot(p2e.x - p1.x, p2e.y - p1.y);
    const arrowLenMm = Math.min(d * 0.55, Math.max(edgeLen * 0.25, 800));
    const ax = midRect.x - fallPrev.x * arrowLenMm * 0.42;
    const ay = midRect.y - fallPrev.y * arrowLenMm * 0.42;
    const bx = midRect.x + fallPrev.x * arrowLenMm * 0.58;
    const by = midRect.y + fallPrev.y * arrowLenMm * 0.58;
    const sa = worldToScreen(ax, ay, t);
    const sb = worldToScreen(bx, by, t);
    drawArrowOnSegmentPx(g, sa.x, sa.y, sb.x, sb.y, ARROW, 0.85, 1.1);
  }
}
