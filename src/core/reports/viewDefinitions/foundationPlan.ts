import type { Point2D } from "../../geometry/types";
import type { FoundationPileEntity } from "../../domain/foundationPile";
import type { FoundationStripEntity, FoundationStripOrthoRingEntity } from "../../domain/foundationStrip";
import {
  foundationStripOrthoRingFootprintContoursFromEntityMm,
  foundationStripOrthoRingOuterBoundsMm,
  foundationStripSegmentFootprintQuadMm,
  pointInFoundationStripOrthoRingMm,
} from "../../domain/foundationStripGeometry";
import type { Project } from "../../domain/project";
import { outerAxisAlignedBoundingBoxOfWallsMm } from "../../domain/rectangleWallDimensions";
import type { ReportPrimRect, ReportPrimitive, ReportPrimText } from "../types";
import { buildFoundationDimensionPrimitives } from "../dimensionRules/foundationDimensions";
import {
  computeFoundationInnerCourtyardAreaMm2,
  innerCourtyardLabelCenterMm,
} from "./foundationPlanArea";

export interface FoundationPlanWorldBuild {
  readonly primitives: readonly ReportPrimitive[];
  readonly worldBounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } | null;
  readonly messages: readonly string[];
  readonly hasFoundationData: boolean;
  readonly usedWallFallback: boolean;
}

/** Наружный контур ленты — основной, контрастный на печати. */
const STROKE_OUTER_MM = 0.62;
/** Лёгкая заливка тела ленты (читается как бетон, не перебивает линии). */
const STRIP_CONCRETE_FILL = "#ebe8e4";
const STROKE_PILE_MM = 0.18;
const STROKE_WALL_FB_MM = 0.32;
/** Внутренняя грань ленты: прямоугольник внутрь от наружного bbox контура (не оси свай). */
const INNER_FACE_INSET_FROM_OUTER_MM = 300;
const STROKE_INNER_FACE_MM = 0.22;
/** Стыковка свай в ряд/колонку — как в размерах (кластер по центрам). */
const PILE_LINK_TOL_MM = 160;
const STROKE_PILE_LINK_MM = 0.11;

/** Не рисовать пунктир свая, если основная часть отрезка проходит по телу ленты (орто-кольцо). */
function segmentMostlyInsideOrthoRingStrip(
  x1Mm: number,
  y1Mm: number,
  x2Mm: number,
  y2Mm: number,
  orthoRings: readonly FoundationStripOrthoRingEntity[],
): boolean {
  if (orthoRings.length === 0) {
    return false;
  }
  const innerSamples = 5;
  let inStrip = 0;
  for (let k = 1; k <= innerSamples; k++) {
    const t = k / (innerSamples + 1);
    const x = x1Mm + (x2Mm - x1Mm) * t;
    const y = y1Mm + (y2Mm - y1Mm) * t;
    const p = { x, y };
    if (orthoRings.some((e) => pointInFoundationStripOrthoRingMm(p, e))) {
      inStrip++;
    }
  }
  return inStrip >= 3;
}

function clusterPileRowsForLinks(
  piles: readonly FoundationPileEntity[],
  tolMm: number,
): { readonly y: number; readonly piles: FoundationPileEntity[] }[] {
  if (piles.length === 0) {
    return [];
  }
  const sorted = [...piles].sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
  const rows: { y: number; piles: FoundationPileEntity[] }[] = [];
  for (const p of sorted) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(p.centerY - last.y) > tolMm) {
      rows.push({ y: p.centerY, piles: [p] });
    } else {
      last.piles.push(p);
    }
  }
  for (const r of rows) {
    r.piles.sort((a, b) => a.centerX - b.centerX);
  }
  return rows;
}

function clusterPileColsForLinks(
  piles: readonly FoundationPileEntity[],
  tolMm: number,
): { readonly x: number; readonly piles: FoundationPileEntity[] }[] {
  if (piles.length === 0) {
    return [];
  }
  const sorted = [...piles].sort((a, b) => a.centerX - b.centerX || a.centerY - b.centerY);
  const cols: { x: number; piles: FoundationPileEntity[] }[] = [];
  for (const p of sorted) {
    const last = cols[cols.length - 1];
    if (!last || Math.abs(p.centerX - last.x) > tolMm) {
      cols.push({ x: p.centerX, piles: [p] });
    } else {
      last.piles.push(p);
    }
  }
  for (const c of cols) {
    c.piles.sort((a, b) => a.centerY - b.centerY);
  }
  return cols;
}

/**
 * Пунктир от середины ребра к соседней свае; по телу орто-ленты отрезки не рисуем.
 */
function pileFacingNeighborGuideLines(
  piles: readonly FoundationPileEntity[],
  orthoRings: readonly FoundationStripOrthoRingEntity[],
): ReportPrimitive[] {
  if (piles.length < 2) {
    return [];
  }
  const tol = PILE_LINK_TOL_MM;
  /** Длинные штрихи и заметный зазор — не «точечный» мелкий пунктир. */
  const dashMm: readonly number[] = [14, 7];
  const out: ReportPrimitive[] = [];

  for (const row of clusterPileRowsForLinks(piles, tol)) {
    const ps = row.piles;
    if (ps.length < 2) {
      continue;
    }
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i]!;
      const b = ps[i + 1]!;
      const ha = a.capSizeMm / 2;
      const hb = b.capSizeMm / 2;
      const x1 = a.centerX + ha;
      const y1 = a.centerY;
      const x2 = b.centerX - hb;
      const y2 = b.centerY;
      if (segmentMostlyInsideOrthoRingStrip(x1, y1, x2, y2, orthoRings)) {
        continue;
      }
      out.push({
        kind: "line",
        x1Mm: x1,
        y1Mm: y1,
        x2Mm: x2,
        y2Mm: y2,
        strokeMm: STROKE_PILE_LINK_MM,
        dashMm,
        muted: true,
      });
    }
  }

  for (const col of clusterPileColsForLinks(piles, tol)) {
    const ps = col.piles;
    if (ps.length < 2) {
      continue;
    }
    for (let i = 0; i < ps.length - 1; i++) {
      const lo = ps[i]!;
      const hi = ps[i + 1]!;
      const hl = lo.capSizeMm / 2;
      const hh = hi.capSizeMm / 2;
      const x1 = lo.centerX;
      const y1 = lo.centerY + hl;
      const x2 = hi.centerX;
      const y2 = hi.centerY - hh;
      if (segmentMostlyInsideOrthoRingStrip(x1, y1, x2, y2, orthoRings)) {
        continue;
      }
      out.push({
        kind: "line",
        x1Mm: x1,
        y1Mm: y1,
        x2Mm: x2,
        y2Mm: y2,
        strokeMm: STROKE_PILE_LINK_MM,
        dashMm,
        muted: true,
      });
    }
  }

  return out;
}

function expandBounds(
  b: { minX: number; minY: number; maxX: number; maxY: number } | null,
  p: Point2D,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!b) {
    return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  }
  return {
    minX: Math.min(b.minX, p.x),
    minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x),
    maxY: Math.max(b.maxY, p.y),
  };
}

function boundsFromPoints(points: readonly Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (points.length === 0) {
    return null;
  }
  let b = expandBounds(null, points[0]!);
  for (let i = 1; i < points.length; i++) {
    b = expandBounds(b, points[i]!);
  }
  return b;
}

function unionBounds(
  a: { minX: number; minY: number; maxX: number; maxY: number } | null,
  b: { minX: number; minY: number; maxX: number; maxY: number } | null,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function rectBounds(x: number, y: number, w: number, h: number) {
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

/** Заливка кольца ленты четырьмя полосами между внешним и внутренним прямоугольниками (мир, Y вверх). */
function pushOrthoRingConcreteFillRects(
  primitives: ReportPrimitive[],
  outer: readonly Point2D[],
  inner: readonly Point2D[],
): void {
  const bo = boundsFromPoints(outer);
  const bi = boundsFromPoints(inner);
  if (bo == null || bi == null) {
    return;
  }
  const iw = bi.maxX - bi.minX;
  const ih = bi.maxY - bi.minY;
  if (iw < 2 || ih < 2) {
    return;
  }
  const ox = bo.minX;
  const oy = bo.minY;
  const oX = bo.maxX;
  const oY = bo.maxY;
  const ix = bi.minX;
  const iy = bi.minY;
  const iX = bi.maxX;
  const iY = bi.maxY;
  const fill = STRIP_CONCRETE_FILL;
  const noStroke = 0;

  const hb = iy - oy;
  if (hb > 0.5) {
    const r: ReportPrimRect = {
      kind: "rect",
      xMm: ox,
      yMm: oy,
      widthMm: oX - ox,
      heightMm: hb,
      strokeMm: noStroke,
      fill,
    };
    primitives.push(r);
  }
  const ht = oY - iY;
  if (ht > 0.5) {
    primitives.push({
      kind: "rect",
      xMm: ox,
      yMm: iY,
      widthMm: oX - ox,
      heightMm: ht,
      strokeMm: noStroke,
      fill,
    });
  }
  const wl = ix - ox;
  if (wl > 0.5) {
    primitives.push({
      kind: "rect",
      xMm: ox,
      yMm: iy,
      widthMm: wl,
      heightMm: iY - iy,
      strokeMm: noStroke,
      fill,
    });
  }
  const wr = oX - iX;
  if (wr > 0.5) {
    primitives.push({
      kind: "rect",
      xMm: iX,
      yMm: iy,
      widthMm: wr,
      heightMm: iY - iy,
      strokeMm: noStroke,
      fill,
    });
  }
}

function stripPrimitives(strip: FoundationStripEntity): {
  primitives: ReportPrimitive[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
} {
  const primitives: ReportPrimitive[] = [];
  let b: ReturnType<typeof boundsFromPoints> = null;

  if (strip.kind === "ortho_ring") {
    const { outer, inner } = foundationStripOrthoRingFootprintContoursFromEntityMm(strip);
    pushOrthoRingConcreteFillRects(primitives, outer, inner);
    primitives.push({
      kind: "polyline",
      pointsMm: [...outer],
      closed: true,
      strokeMm: STROKE_OUTER_MM,
    });
    b = boundsFromPoints(outer);
    if (b != null) {
      const inset = INNER_FACE_INSET_FROM_OUTER_MM;
      const iw = b.maxX - b.minX - 2 * inset;
      const ih = b.maxY - b.minY - 2 * inset;
      if (iw > 8 && ih > 8) {
        const innerFace: Point2D[] = [
          { x: b.minX + inset, y: b.minY + inset },
          { x: b.maxX - inset, y: b.minY + inset },
          { x: b.maxX - inset, y: b.maxY - inset },
          { x: b.minX + inset, y: b.maxY - inset },
        ];
        primitives.push({
          kind: "polyline",
          pointsMm: innerFace,
          closed: true,
          strokeMm: STROKE_INNER_FACE_MM,
          muted: true,
        });
      }
    }
  } else if (strip.kind === "footprint_poly") {
    primitives.push({
      kind: "polyline",
      pointsMm: [...strip.outerRingMm],
      closed: true,
      strokeMm: STROKE_OUTER_MM,
    });
    b = boundsFromPoints(strip.outerRingMm);
    for (const h of strip.holeRingsMm) {
      primitives.push({
        kind: "polyline",
        pointsMm: [...h],
        closed: true,
        strokeMm: 0.14,
        dashMm: [12, 6],
        muted: true,
      });
      b = unionBounds(b, boundsFromPoints(h));
    }
  } else {
    const quad = foundationStripSegmentFootprintQuadMm(
      strip.axisStart,
      strip.axisEnd,
      strip.outwardNormalX,
      strip.outwardNormalY,
      strip.sideOutMm,
      strip.sideInMm,
    );
    primitives.push({
      kind: "polyline",
      pointsMm: [...quad],
      closed: true,
      strokeMm: STROKE_OUTER_MM,
    });
    b = boundsFromPoints(quad);
  }

  return { primitives, bounds: b };
}

function wallFallbackPolyline(project: Project): { primitives: ReportPrimitive[]; bounds: ReturnType<typeof boundsFromPoints> } {
  const bbox = outerAxisAlignedBoundingBoxOfWallsMm(project.walls);
  if (!bbox) {
    return { primitives: [], bounds: null };
  }
  const { minX, minY, maxX, maxY } = bbox;
  const rect: Point2D[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  return {
    primitives: [
      {
        kind: "polyline",
        pointsMm: rect,
        closed: true,
        strokeMm: STROKE_WALL_FB_MM,
        dashMm: [18, 9],
      },
    ],
    bounds: bbox,
  };
}

/**
 * Собирает примитивы плана фундамента в мировых мм и размерные линии.
 */
export function buildFoundationPlanWorld(project: Project): FoundationPlanWorldBuild {
  const messages: string[] = [];
  const primitives: ReportPrimitive[] = [];
  let worldBounds: ReturnType<typeof boundsFromPoints> = null;
  let stripOnlyBounds: ReturnType<typeof boundsFromPoints> = null;

  for (const strip of project.foundationStrips) {
    const { primitives: ps, bounds: sb } = stripPrimitives(strip);
    primitives.push(...ps);
    worldBounds = unionBounds(worldBounds, sb);
    stripOnlyBounds = unionBounds(stripOnlyBounds, sb);
  }

  const piles = project.foundationPiles;
  for (const pile of piles) {
    const half = pile.capSizeMm / 2;
    const x = pile.centerX - half;
    const y = pile.centerY - half;
    const pb = rectBounds(x, y, pile.capSizeMm, pile.capSizeMm);
    const r: ReportPrimRect = {
      kind: "rect",
      xMm: x,
      yMm: y,
      widthMm: pile.capSizeMm,
      heightMm: pile.capSizeMm,
      strokeMm: STROKE_PILE_MM,
    };
    primitives.push(r);
    worldBounds = unionBounds(worldBounds, pb);
  }

  if (piles.length >= 2) {
    const orthoRings = project.foundationStrips.filter((s): s is FoundationStripOrthoRingEntity => s.kind === "ortho_ring");
    primitives.push(...pileFacingNeighborGuideLines(piles, orthoRings));
  }

  const hasFoundationData = project.foundationStrips.length > 0 || piles.length > 0;
  let usedWallFallback = false;

  if (!hasFoundationData) {
    const fb = wallFallbackPolyline(project);
    if (fb.bounds) {
      primitives.push(...fb.primitives);
      worldBounds = unionBounds(worldBounds, fb.bounds);
      usedWallFallback = true;
      messages.push("Фундамент и сваи не заданы — показан ориентировочный контур по стенам.");
    }
  }

  if (worldBounds == null) {
    return {
      primitives: [],
      worldBounds: null,
      messages: ["Нет данных для плана: добавьте ленту/сваи или стены."],
      hasFoundationData: false,
      usedWallFallback: false,
    };
  }

  const areaMm2 = computeFoundationInnerCourtyardAreaMm2(project);
  const labelCenter = innerCourtyardLabelCenterMm(project);
  if (areaMm2 != null && areaMm2 > 1e-3 && labelCenter != null) {
    const m2 = areaMm2 / 1_000_000;
    const t: ReportPrimText = {
      kind: "text",
      xMm: labelCenter.x,
      yMm: labelCenter.y,
      text: `Площадь засыпки ПГС: ${m2.toFixed(2)} м²`,
      fontSizeMm: 6.75,
      anchor: "middle",
    };
    primitives.push(t);
  }

  const orthoRings = project.foundationStrips.filter((s) => s.kind === "ortho_ring");
  const showDiagonal = orthoRings.length === 1;

  let outlineForDims = stripOnlyBounds;
  const firstOrtho = project.foundationStrips.find((s) => s.kind === "ortho_ring");
  if (firstOrtho != null) {
    outlineForDims = foundationStripOrthoRingOuterBoundsMm(firstOrtho);
  }
  if (outlineForDims == null) {
    let pb: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
    for (const pile of piles) {
      const half = pile.capSizeMm / 2;
      pb = unionBounds(pb, rectBounds(pile.centerX - half, pile.centerY - half, pile.capSizeMm, pile.capSizeMm));
    }
    outlineForDims = pb ?? worldBounds;
  }

  const dim = buildFoundationDimensionPrimitives({
    outline: outlineForDims,
    piles: piles.map((p) => ({
      centerX: p.centerX,
      centerY: p.centerY,
      capHalfMm: p.capSizeMm / 2,
    })),
    showDiagonal,
    overallOnly: piles.length === 0,
  });
  primitives.push(...dim.primitives);
  messages.push(...dim.messages);

  return {
    primitives,
    worldBounds,
    messages,
    hasFoundationData,
    usedWallFallback,
  };
}
