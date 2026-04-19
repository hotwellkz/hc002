import type { ReportPrimDimensionLine, ReportPrimitive } from "../types";
import { parallelSegmentDimension } from "./sipStartingBoardDimensions";

const TICK_MM = 10;
const DIM_STROKE_MM = 0.15;
const LABEL_FS_MM = 5.15;
/** Внешний ряд габаритов (ряд 3). */
const OUTER_ROW_MM = 520;
/** Средний ряд — составной размер по половине габарита (ряд 2), только если здание широкое. */
const MID_ROW_MM = 360;
/** Внутренний ряд — локальные размеры скатов (ряд 1). */
const INNER_BASE_OFFSET_MM = 195;
const INNER_STEP_MM = 95;
const OFF_H = -36;
const OFF_V = -34;

function labelGapForText(label: string): number {
  return Math.min(44, 6 + label.length * 2.05);
}

function horizontalDimension(
  x1: number,
  yObj: number,
  x2: number,
  dimY: number,
  label: string,
  labelYOffset: number,
): ReportPrimDimensionLine {
  const gap = labelGapForText(label);
  return {
    kind: "dimensionLine",
    anchor1Xmm: x1,
    anchor1Ymm: yObj,
    anchor2Xmm: x2,
    anchor2Ymm: yObj,
    dimLineX1mm: x1,
    dimLineY1mm: dimY,
    dimLineX2mm: x2,
    dimLineY2mm: dimY,
    labelXmm: (x1 + x2) / 2,
    labelYmm: dimY + labelYOffset,
    label,
    tickMm: TICK_MM,
    centerGapMm: gap,
    strokeMm: DIM_STROKE_MM,
    labelFontSizeMm: LABEL_FS_MM,
  };
}

function verticalDimension(
  xObj: number,
  y1: number,
  y2: number,
  dimX: number,
  label: string,
  labelXOffset: number,
): ReportPrimDimensionLine {
  const gap = labelGapForText(label);
  return {
    kind: "dimensionLine",
    anchor1Xmm: xObj,
    anchor1Ymm: y1,
    anchor2Xmm: xObj,
    anchor2Ymm: y2,
    dimLineX1mm: dimX,
    dimLineY1mm: y1,
    dimLineX2mm: dimX,
    dimLineY2mm: y2,
    labelXmm: dimX + labelXOffset,
    labelYmm: (y1 + y2) / 2,
    label,
    tickMm: TICK_MM,
    centerGapMm: gap,
    strokeMm: DIM_STROKE_MM,
    labelFontSizeMm: LABEL_FS_MM,
  };
}

export interface RoofPlanBbox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Ряд 3: общие габариты контура крыши в плане.
 * Промежуточный ряд «половинных» габаритов по умолчанию отключён — даёт лишние цепочки и дубли с локальными размерами.
 */
export function buildRoofPlanHierarchyDimensions(
  bbox: RoofPlanBbox,
  options?: { readonly enableMidRow?: boolean },
): readonly ReportPrimitive[] {
  const { minX, minY, maxX, maxY } = bbox;
  const w = Math.round(maxX - minX);
  const h = Math.round(maxY - minY);
  const yOuter = minY - OUTER_ROW_MM;
  const xOuter = minX - OUTER_ROW_MM;
  const out: ReportPrimitive[] = [
    horizontalDimension(minX, minY, maxX, yOuter, `${w}`, OFF_H),
    verticalDimension(minX, minY, maxY, xOuter, `${h}`, OFF_V),
  ];

  const mid = options?.enableMidRow === true && (w > 5500 || h > 5500);
  if (mid) {
    const yMid = minY - MID_ROW_MM;
    const xMid = minX - MID_ROW_MM;
    const mx = (minX + maxX) / 2;
    const my = (minY + maxY) / 2;
    out.push(horizontalDimension(minX, minY, mx, yMid, `${Math.round(mx - minX)}`, OFF_H));
    out.push(verticalDimension(minX, minY, my, xMid, `${Math.round(my - minY)}`, OFF_V));
  }

  return out;
}

/** Размерные линии свеса: от габарита стен до габарита кровли (мм). */
const OVERHANG_DIM_STEP_MM = 72;
const OVERHANG_BASE_BELOW_ROOF_MM = 268;

/**
 * Вылеты карниза по сторонам света в плане (ось X / ось Y).
 * При симметричных вылетах восток/запад или север/юг — одна размерная линия на пару.
 */
export function buildRoofWallToRoofOverhangDimensions(
  roofBbox: RoofPlanBbox,
  wallBbox: RoofPlanBbox | null,
): readonly ReportPrimitive[] {
  if (!wallBbox) {
    return [];
  }
  const rx = roofBbox.minX;
  const ry = roofBbox.minY;
  const rx2 = roofBbox.maxX;
  const ry2 = roofBbox.maxY;
  const wx = wallBbox.minX;
  const wy = wallBbox.minY;
  const wx2 = wallBbox.maxX;
  const wy2 = wallBbox.maxY;

  const eastOv = rx2 - wx2;
  const westOv = wx - rx;
  const northOv = ry2 - wy2;
  const southOv = wy - ry;

  const TOL = 35;
  const SYM = Math.max(45, 0.025 * Math.max(rx2 - rx, ry2 - ry));

  const out: ReportPrimitive[] = [];

  const yRefHoriz = Math.min(ry, wy) - 12;
  const xRefVert = Math.min(rx, wx) - 12;

  const eOk = eastOv > TOL;
  const wOk = westOv > TOL;
  if (eOk || wOk) {
    const symmetric = eOk && wOk && Math.abs(eastOv - westOv) <= SYM;
    const yDim0 = ry - OVERHANG_BASE_BELOW_ROOF_MM;
    if (symmetric) {
      const v = Math.round((eastOv + westOv) / 2);
      out.push(horizontalDimension(wx2, yRefHoriz, rx2, yDim0, `${v}`, OFF_H));
    } else {
      if (eOk) {
        out.push(horizontalDimension(wx2, yRefHoriz, rx2, yDim0, `${Math.round(eastOv)}`, OFF_H));
      }
      if (wOk) {
        const yDimW = ry - OVERHANG_BASE_BELOW_ROOF_MM - (eOk ? OVERHANG_DIM_STEP_MM : 0);
        out.push(horizontalDimension(rx, yRefHoriz, wx, yDimW, `${Math.round(westOv)}`, OFF_H));
      }
    }
  }

  const nOk = northOv > TOL;
  const sOk = southOv > TOL;
  if (nOk || sOk) {
    const symmetricNs = nOk && sOk && Math.abs(northOv - southOv) <= SYM;
    const xDim0 = rx - OVERHANG_BASE_BELOW_ROOF_MM;
    if (symmetricNs) {
      const v = Math.round((northOv + southOv) / 2);
      out.push(verticalDimension(xRefVert, wy2, ry2, xDim0, `${v}`, OFF_V));
    } else {
      if (nOk) {
        out.push(verticalDimension(xRefVert, wy2, ry2, xDim0, `${Math.round(northOv)}`, OFF_V));
      }
      if (sOk) {
        const xDimS = rx - OVERHANG_BASE_BELOW_ROOF_MM - (nOk ? OVERHANG_DIM_STEP_MM : 0);
        out.push(verticalDimension(xRefVert, ry, wy, xDimS, `${Math.round(southOv)}`, OFF_V));
      }
    }
  }

  return out;
}

export interface RoofSlopeDimSegment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly label: string;
}

/**
 * Ряд 1: локальные размеры скатов (карнизная сторона и размах вдоль стока), смещение наружу от центра контура.
 */
export function buildRoofSlopeLocalDimensionPrimitives(
  segments: readonly RoofSlopeDimSegment[],
  bboxCenterX: number,
  bboxCenterY: number,
  rowIndex: number,
): readonly ReportPrimitive[] {
  const base = INNER_BASE_OFFSET_MM + rowIndex * INNER_STEP_MM;
  const out: ReportPrimitive[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const mx = (s.ax + s.bx) / 2;
    const my = (s.ay + s.by) / 2;
    const vx = mx - bboxCenterX;
    const vy = my - bboxCenterY;
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      continue;
    }
    const nx = -dy / len;
    const ny = dx / len;
    const dot = vx * nx + vy * ny;
    const side = dot >= 0 ? 1 : -1;
    const offset = side * (base + i * 22);
    out.push(parallelSegmentDimension(s.ax, s.ay, s.bx, s.by, offset, s.label));
  }
  return out;
}
