/**
 * Отчёт «Крыша — План скатов»: контуры скатов в плане, коньки из roofSystems,
 * подписи (номер, угол, направление стока), площади, размеры.
 */

import type { Project } from "../../domain/project";
import type { RoofSystemEntity } from "../../domain/roofSystem";
import {
  roofPlaneDrainUnitPlanMm,
  roofPlanePolygonMm,
  roofPlanePreferredEaveEdgeVertexIndicesMm,
} from "../../domain/roofPlane";
import { outerAxisAlignedBoundingBoxOfWallsMm } from "../../domain/rectangleWallDimensions";
import { layerIdsForSnapGeometry } from "../../geometry/snap2dPrimitives";
import type { Point2D } from "../../geometry/types";
import { parallelSegmentDimension } from "../dimensionRules/sipStartingBoardDimensions";
import {
  buildRoofPlanHierarchyDimensions,
  buildRoofSlopeLocalDimensionPrimitives,
  buildRoofWallToRoofOverhangDimensions,
  type RoofSlopeDimSegment,
} from "../dimensionRules/roofPlanDimensions";
import type { ReportPrimitive } from "../types";

const OUTLINE_STROKE_MM = 0.22;
const RIDGE_STROKE_MM = 0.2;
const ARROW_STROKE_MM = 0.24;
const LABEL_FS_MM = 3.25;
const LABEL_LH_MM = 3.55;
const RIDGE_DIM_BASE_OFFSET_MM = 268;
const RIDGE_DIM_STEP_MM = 88;
/** Подпись ската: вверх по стоку от центра, чтобы не пересекаться со стрелкой (направлена вниз по стоку). */
const LABEL_UPSTREAM_ALONG_DRAIN_MM = 318;
/** Лёгкий сдвиг подписей соседних скатов перпендикулярно стоку. */
const LABEL_PERP_STAGGER_MM = 48;
const OVERALL_DIM_DEDUPE_TOL_MM = 12;
const RIDGE_LEN_DEDUPE_TOL_MM = 15;

export interface RoofSlopePlanWorldBuild {
  readonly primitives: readonly ReportPrimitive[];
  readonly worldBounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } | null;
  readonly messages: readonly string[];
}

function polygonAreaAbsMm2(poly: readonly Point2D[]): number {
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) * 0.5;
}

function polygonCentroid(poly: readonly Point2D[]): Point2D {
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  const n = poly.length;
  return { x: sx / n, y: sy / n };
}

function unionBoundsFromPolys(polys: readonly (readonly Point2D[])[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let b: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const poly of polys) {
    for (const p of poly) {
      if (!b) {
        b = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
      } else {
        b.minX = Math.min(b.minX, p.x);
        b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x);
        b.maxY = Math.max(b.maxY, p.y);
      }
    }
  }
  return b;
}

function roofSystemKindNote(kind: RoofSystemEntity["roofKind"]): string | null {
  switch (kind) {
    case "hip":
      return "вальма";
    case "gable":
      return "двускатная";
    case "mono":
      return "односкатная";
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

function formatAreaM2(mm2: number): string {
  const m2 = mm2 / 1_000_000;
  const s = m2.toFixed(2).replace(".", ",");
  return `${s} м²`;
}

function slopeArrowPrimitives(cx: number, cy: number, ux: number, uy: number): readonly ReportPrimitive[] {
  const headLen = 145;
  const tailLen = 105;
  const wingAlong = 48;
  const wingSide = 40;
  const tipX = cx + ux * headLen;
  const tipY = cy + uy * headLen;
  const baseX = cx - ux * tailLen;
  const baseY = cy - uy * tailLen;
  const px = -uy;
  const py = ux;
  const wing1x = tipX - ux * wingAlong + px * wingSide;
  const wing1y = tipY - uy * wingAlong + py * wingSide;
  const wing2x = tipX - ux * wingAlong - px * wingSide;
  const wing2y = tipY - uy * wingAlong - py * wingSide;
  return [
    { kind: "line", x1Mm: baseX, y1Mm: baseY, x2Mm: tipX, y2Mm: tipY, strokeMm: ARROW_STROKE_MM },
    { kind: "line", x1Mm: wing1x, y1Mm: wing1y, x2Mm: tipX, y2Mm: tipY, strokeMm: ARROW_STROKE_MM },
    { kind: "line", x1Mm: wing2x, y1Mm: wing2y, x2Mm: tipX, y2Mm: tipY, strokeMm: ARROW_STROKE_MM },
  ];
}

function drainSpanSegmentAlongDrainMm(
  poly: readonly Point2D[],
  uxn: number,
  uyn: number,
  cx: number,
  cy: number,
): { ax: number; ay: number; bx: number; by: number; spanMm: number } | null {
  let minDot = Infinity;
  let maxDot = -Infinity;
  for (const p of poly) {
    const d = p.x * uxn + p.y * uyn;
    minDot = Math.min(minDot, d);
    maxDot = Math.max(maxDot, d);
  }
  const span = maxDot - minDot;
  if (span < 1) {
    return null;
  }
  const cDot = cx * uxn + cy * uyn;
  const ax = cx + uxn * (minDot - cDot);
  const ay = cy + uyn * (minDot - cDot);
  const bx = ax + uxn * span;
  const by = ay + uyn * span;
  return { ax, ay, bx, by, spanMm: span };
}

function dedupeSlopeDimensionSegments(
  segments: readonly RoofSlopeDimSegment[],
  overallW: number,
  overallH: number,
): RoofSlopeDimSegment[] {
  const out: RoofSlopeDimSegment[] = [];
  const seenGeom = new Set<string>();
  for (const s of segments) {
    const n = parseInt(s.label, 10);
    if (
      Number.isFinite(n) &&
      (Math.abs(n - overallW) <= OVERALL_DIM_DEDUPE_TOL_MM || Math.abs(n - overallH) <= OVERALL_DIM_DEDUPE_TOL_MM)
    ) {
      continue;
    }
    const key = `${s.label}|${Math.round(s.ax / 8)}|${Math.round(s.ay / 8)}|${Math.round(s.bx / 8)}|${Math.round(s.by / 8)}`;
    if (seenGeom.has(key)) {
      continue;
    }
    seenGeom.add(key);
    out.push(s);
  }
  return out;
}

export function buildRoofSlopePlanWorld(project: Project): RoofSlopePlanWorldBuild {
  const messages: string[] = [];
  const layerIds = layerIdsForSnapGeometry(project);
  const planes = project.roofPlanes
    .filter((rp) => layerIds.has(rp.layerId))
    .slice()
    .sort((a, b) => a.slopeIndex - b.slopeIndex);

  if (planes.length === 0) {
    return {
      primitives: [],
      worldBounds: null,
      messages: ["Нет скатов крыши на видимых слоях."],
    };
  }

  const polys: readonly Point2D[][] = planes.map((rp) => [...roofPlanePolygonMm(rp)]);
  const unionBbox = unionBoundsFromPolys(polys);
  if (!unionBbox) {
    return { primitives: [], worldBounds: null, messages: ["Не удалось построить контуры скатов."] };
  }

  const cxU = (unionBbox.minX + unionBbox.maxX) / 2;
  const cyU = (unionBbox.minY + unionBbox.maxY) / 2;
  const overallW = Math.round(unionBbox.maxX - unionBbox.minX);
  const overallH = Math.round(unionBbox.maxY - unionBbox.minY);

  const wallsForOverhang = project.walls.filter((w) => layerIds.has(w.layerId));
  const wallBbox = outerAxisAlignedBoundingBoxOfWallsMm(wallsForOverhang);

  const primitives: ReportPrimitive[] = [];

  for (const poly of polys) {
    primitives.push({
      kind: "polyline",
      pointsMm: poly,
      closed: true,
      strokeMm: OUTLINE_STROKE_MM,
    });
  }

  const systemsOnLayers = project.roofSystems.filter((s) => layerIds.has(s.layerId));
  let ridgeSegCount = 0;
  for (const sys of systemsOnLayers) {
    for (const seg of sys.ridgeSegmentsPlanMm) {
      ridgeSegCount += 1;
      primitives.push({
        kind: "line",
        x1Mm: seg.ax,
        y1Mm: seg.ay,
        x2Mm: seg.bx,
        y2Mm: seg.by,
        strokeMm: RIDGE_STROKE_MM,
        dashMm: [7, 5],
      });
    }
  }
  if (ridgeSegCount === 0 && systemsOnLayers.length > 0) {
    messages.push("В модели нет сегментов конька в плане (ridgeSegmentsPlanMm) — линии конька на листе отсутствуют.");
  }

  const localSegments: RoofSlopeDimSegment[] = [];
  for (let pi = 0; pi < planes.length; pi++) {
    const rp = planes[pi]!;
    const poly = polys[pi]!;
    const { uxn, uyn } = roofPlaneDrainUnitPlanMm(rp);
    const centroid = polygonCentroid(poly);
    const perpX = -uyn;
    const perpY = uxn;
    const perpStagger = (pi - (planes.length - 1) / 2) * LABEL_PERP_STAGGER_MM;
    const lx = centroid.x - uxn * LABEL_UPSTREAM_ALONG_DRAIN_MM + perpX * perpStagger;
    const ly = centroid.y - uyn * LABEL_UPSTREAM_ALONG_DRAIN_MM + perpY * perpStagger;

    const sys = rp.roofSystemId ? project.roofSystems.find((s) => s.id === rp.roofSystemId) : undefined;
    const kindLine = sys ? roofSystemKindNote(sys.roofKind) : null;
    const areaPlan = polygonAreaAbsMm2(poly);
    const angRad = (rp.angleDeg * Math.PI) / 180;
    const cosA = Math.cos(angRad);
    const cosClamped = Math.max(0.08, Math.abs(cosA));
    const areaSlope = areaPlan / cosClamped;

    const lines: string[] = [
      `${Math.round(rp.angleDeg)}°`,
      `Скат ${rp.slopeIndex}`,
      `S = ${formatAreaM2(areaSlope)}`,
    ];
    if (kindLine) {
      lines.push(kindLine);
    }

    primitives.push(...slopeArrowPrimitives(centroid.x, centroid.y, uxn, uyn));

    primitives.push({
      kind: "textBlock",
      xMm: lx,
      yMm: ly,
      lines,
      fontSizeMm: LABEL_FS_MM,
      lineHeightMm: LABEL_LH_MM,
      anchor: "middle",
    });

    const eaveIx = roofPlanePreferredEaveEdgeVertexIndicesMm(poly, uxn, uyn);
    if (eaveIx) {
      const a = poly[eaveIx.i0]!;
      const b = poly[eaveIx.i1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 5) {
        localSegments.push({
          ax: a.x,
          ay: a.y,
          bx: b.x,
          by: b.y,
          label: `${Math.round(len)}`,
        });
      }
    }

    const spanSeg = drainSpanSegmentAlongDrainMm(poly, uxn, uyn, centroid.x, centroid.y);
    if (spanSeg && spanSeg.spanMm > 5) {
      localSegments.push({
        ax: spanSeg.ax,
        ay: spanSeg.ay,
        bx: spanSeg.bx,
        by: spanSeg.by,
        label: `${Math.round(spanSeg.spanMm)}`,
      });
    }
  }

  const localDeduped = dedupeSlopeDimensionSegments(localSegments, overallW, overallH);
  primitives.push(
    ...buildRoofSlopeLocalDimensionPrimitives(localDeduped, cxU, cyU, 0),
    ...buildRoofWallToRoofOverhangDimensions(unionBbox, wallBbox),
    ...buildRoofPlanHierarchyDimensions(unionBbox, { enableMidRow: false }),
  );

  let r = 0;
  const seenRidgeKey = new Set<string>();
  for (const sys of systemsOnLayers) {
    for (const seg of sys.ridgeSegmentsPlanMm) {
      const mx = (seg.ax + seg.bx) / 2;
      const my = (seg.ay + seg.by) / 2;
      const dx = seg.bx - seg.ax;
      const dy = seg.by - seg.ay;
      const len = Math.hypot(dx, dy);
      if (len < 5) {
        continue;
      }
      const lenR = Math.round(len);
      if (
        Math.abs(lenR - overallW) <= RIDGE_LEN_DEDUPE_TOL_MM ||
        Math.abs(lenR - overallH) <= RIDGE_LEN_DEDUPE_TOL_MM
      ) {
        continue;
      }
      const rKey = `${lenR}|${Math.round(mx / 25)}|${Math.round(my / 25)}`;
      if (seenRidgeKey.has(rKey)) {
        continue;
      }
      seenRidgeKey.add(rKey);
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const vx = mx - cxU;
      const vy = my - cyU;
      const side = vx * nx + vy * ny >= 0 ? 1 : -1;
      const off = side * (RIDGE_DIM_BASE_OFFSET_MM + r * RIDGE_DIM_STEP_MM);
      r += 1;
      primitives.push(parallelSegmentDimension(seg.ax, seg.ay, seg.bx, seg.by, off, `${lenR}`));
    }
  }

  messages.push(`Скатов на листе: ${planes.length}.`);

  return {
    primitives,
    worldBounds: unionBbox,
    messages,
  };
}
