import type { ReportPrimDimensionLine, ReportPrimitive } from "../types";

/** Свая для размеров. */
export interface FoundationPileDim {
  readonly centerX: number;
  readonly centerY: number;
  readonly capHalfMm: number;
}

const TICK_MM = 10;
const OUTER_ROW_MM = 560;
const INNER_ROW_MM = 365;

const DIM_STROKE_MM = 0.12;
const DIM_STROKE_DIAG_MM = 0.1;
const LABEL_FS_MM = 5.55;
/** Шаг между параллельными размерными рядами слева (мм). */
const DIM_STACK_STEP_MM = 118;
/** Дополнительный вертикальный шаг только для нижних рядов (частные / суммарный / общий). */
const BOTTOM_DIM_STACK_STEP_MM = 175;
/** Отступ размерной линии габарита сваи от кромки квадрата (мм). */
const PILE_CAP_DIM_OFFSET_H = 40;
const PILE_CAP_DIM_OFFSET_V = 40;
/** Смещение подписи от размерной линии (мир Y вверх): больше по модулю — дальше от линии. */
const OFF_H = -42;
const OFF_V = -40;
/** Краевой зазор «ленты» (наружу от оси); отдельно не подписываем — включается в суммарный размер. */
const STRIP_EDGE_GAP_MM = 150;
const EDGE_GAP_TOL_MM = 12;

function labelGapForText(label: string): number {
  return Math.min(46, 7 + label.length * 2.2);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clusterRows(
  piles: readonly FoundationPileDim[],
  tolMm: number,
): { readonly y: number; readonly piles: FoundationPileDim[] }[] {
  if (piles.length === 0) {
    return [];
  }
  const sorted = [...piles].sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
  const rows: { y: number; piles: FoundationPileDim[] }[] = [];
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

function clusterCols(
  piles: readonly FoundationPileDim[],
  tolMm: number,
): { readonly x: number; readonly piles: FoundationPileDim[] }[] {
  if (piles.length === 0) {
    return [];
  }
  const sorted = [...piles].sort((a, b) => a.centerX - b.centerX || a.centerY - b.centerY);
  const cols: { x: number; piles: FoundationPileDim[] }[] = [];
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

function findBottomRow(rows: ReturnType<typeof clusterRows>) {
  if (rows.length === 0) {
    return null;
  }
  return rows.reduce((best, r) => {
    const my = Math.min(...r.piles.map((p) => p.centerY));
    const by = Math.min(...best.piles.map((p) => p.centerY));
    return my < by ? r : best;
  });
}

function findLeftCol(cols: ReturnType<typeof clusterCols>) {
  if (cols.length === 0) {
    return null;
  }
  return cols.reduce((best, c) => {
    const mx = Math.min(...c.piles.map((p) => p.centerX));
    const bx = Math.min(...best.piles.map((p) => p.centerX));
    return mx < bx ? c : best;
  });
}

/** Уникальные координаты по оси, без дублей (мм). */
function uniqSorted1D(values: readonly number[], eps = 0.75): number[] {
  const s = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]!) > eps) {
      out.push(v);
    }
  }
  return out;
}

/**
 * На нижней/левой цепочке убирает промежуточную точку на краю, если шаг ≈ толщина ленты (150 мм),
 * чтобы суммарный размер шёл от внешнего угла без отдельной подписи «150».
 */
function mergeEdgeStripWidthGaps(coords: readonly number[], gapMm: number, tolMm: number): number[] {
  const s = uniqSorted1D([...coords]);
  if (s.length < 3) {
    return s;
  }
  const skip = new Set<number>();
  if (Math.abs(s[1]! - s[0]! - gapMm) <= tolMm) {
    skip.add(1);
  }
  if (Math.abs(s[s.length - 1]! - s[s.length - 2]! - gapMm) <= tolMm) {
    skip.add(s.length - 2);
  }
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (skip.has(i)) {
      continue;
    }
    out.push(s[i]!);
  }
  return uniqSorted1D(out);
}

function horizontalDimension(
  x1: number,
  yObj: number,
  x2: number,
  dimY: number,
  label: string,
  labelYOffset: number,
  strokeMm: number = DIM_STROKE_MM,
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
    strokeMm: strokeMm,
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
  strokeMm: number = DIM_STROKE_MM,
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
    strokeMm: strokeMm,
    labelFontSizeMm: LABEL_FS_MM,
  };
}

function pickSamplePileForCapDims(piles: readonly FoundationPileDim[]): FoundationPileDim {
  let best = piles[0]!;
  let score = best.centerX + best.centerY;
  for (const p of piles) {
    const s = p.centerX + p.centerY;
    if (s > score) {
      score = s;
      best = p;
    }
  }
  return best;
}

/** Два ортогональных размера стороны квадрата сваи (без словесных подписей). */
function pileCapDimensionPrimitives(p: FoundationPileDim): ReportPrimDimensionLine[] {
  const h = p.capHalfMm;
  const side = Math.round(h * 2);
  const label = `${side}`;
  const xL = p.centerX - h;
  const xR = p.centerX + h;
  const yB = p.centerY - h;
  const yT = p.centerY + h;
  const yDimH = yB - PILE_CAP_DIM_OFFSET_H;
  const xDimV = xL - PILE_CAP_DIM_OFFSET_V;
  return [
    horizontalDimension(xL, yB, xR, yDimH, label, OFF_H),
    verticalDimension(xL, yB, yT, xDimV, label, OFF_V),
  ];
}

function diagonalDimension(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  offsetAlongNormal: number,
  label: string,
  labelAlongOffset: number,
): ReportPrimDimensionLine {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return horizontalDimension(x1, y1, x2, y1 - 80, label, OFF_H, DIM_STROKE_MM);
  }
  const nx = -dy / len;
  const ny = dx / len;
  const ox = nx * offsetAlongNormal;
  const oy = ny * offsetAlongNormal;
  const d1x = x1 + ox;
  const d1y = y1 + oy;
  const d2x = x2 + ox;
  const d2y = y2 + oy;
  const gap = labelGapForText(label);
  const lx = (d1x + d2x) / 2 - nx * labelAlongOffset;
  const ly = (d1y + d2y) / 2 - ny * labelAlongOffset;
  return {
    kind: "dimensionLine",
    anchor1Xmm: x1,
    anchor1Ymm: y1,
    anchor2Xmm: x2,
    anchor2Ymm: y2,
    dimLineX1mm: d1x,
    dimLineY1mm: d1y,
    dimLineX2mm: d2x,
    dimLineY2mm: d2y,
    labelXmm: lx,
    labelYmm: ly,
    label,
    tickMm: TICK_MM,
    centerGapMm: gap,
    strokeMm: DIM_STROKE_DIAG_MM,
    labelFontSizeMm: LABEL_FS_MM,
  };
}

export interface FoundationDimensionInput {
  readonly outline: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  readonly piles: readonly FoundationPileDim[];
  readonly showDiagonal: boolean;
  readonly overallOnly: boolean;
}

export interface FoundationDimensionResult {
  readonly primitives: readonly ReportPrimitive[];
  readonly messages: readonly string[];
}

/**
 * Габариты по контуру; при наличии свай — нижняя и левая цепочки «угол → центры → угол»;
 * общие размеры w/h не дублируются (убирает лишний габарит вроде «5595»).
 */
export function buildFoundationDimensionPrimitives(input: FoundationDimensionInput): FoundationDimensionResult {
  const { outline, piles, showDiagonal, overallOnly } = input;
  const messages: string[] = [];
  const primitives: ReportPrimitive[] = [];

  const { minX, minY, maxX, maxY } = outline;
  const w = Math.round(maxX - minX);
  const h = Math.round(maxY - minY);

  const yOuter = minY - OUTER_ROW_MM;
  const yInner = minY - INNER_ROW_MM;
  const xOuter = minX - OUTER_ROW_MM;
  const xInner = minX - INNER_ROW_MM;

  if (overallOnly || piles.length === 0) {
    primitives.push(horizontalDimension(minX, minY, maxX, yOuter, `${w}`, OFF_H));
    primitives.push(verticalDimension(minX, minY, maxY, xOuter, `${h}`, OFF_V));
  } else {
    const rowTol = 160;
    const colTol = 160;
    const rows = clusterRows(piles, rowTol);
    const cols = clusterCols(piles, colTol);

    const bottomRow = findBottomRow(rows);
    let didBottomChain = false;
    if (bottomRow != null && bottomRow.piles.length >= 1) {
      const sorted = [...bottomRow.piles].sort((a, b) => a.centerX - b.centerX);
      const xs = mergeEdgeStripWidthGaps(
        [minX, ...sorted.map((p) => p.centerX), maxX],
        STRIP_EDGE_GAP_MM,
        EDGE_GAP_TOL_MM,
      );
      for (let i = 0; i < xs.length - 1; i++) {
        const xa = xs[i]!;
        const xb = xs[i + 1]!;
        const seg = Math.round(Math.abs(xb - xa));
        if (seg < 1) {
          continue;
        }
        primitives.push(horizontalDimension(xa, minY, xb, yInner, `${seg}`, OFF_H));
      }
      const yDimCum = minY - INNER_ROW_MM - BOTTOM_DIM_STACK_STEP_MM;
      const yDimTotal = minY - INNER_ROW_MM - 2 * BOTTOM_DIM_STACK_STEP_MM;
      if (xs.length >= 4) {
        const xa0 = xs[0]!;
        const xa1 = xs[xs.length - 2]!;
        primitives.push(horizontalDimension(xa0, minY, xa1, yDimCum, `${Math.round(xa1 - xa0)}`, OFF_H));
      }
      if (xs.length >= 2) {
        primitives.push(horizontalDimension(minX, minY, maxX, yDimTotal, `${w}`, OFF_H));
      }
      didBottomChain = true;
    }

    const leftCol = findLeftCol(cols);
    let didLeftChain = false;
    if (leftCol != null && leftCol.piles.length >= 1) {
      const sorted = [...leftCol.piles].sort((a, b) => a.centerY - b.centerY);
      const ys = mergeEdgeStripWidthGaps(
        [minY, ...sorted.map((p) => p.centerY), maxY],
        STRIP_EDGE_GAP_MM,
        EDGE_GAP_TOL_MM,
      );
      for (let i = 0; i < ys.length - 1; i++) {
        const ya = ys[i]!;
        const yb = ys[i + 1]!;
        const seg = Math.round(Math.abs(yb - ya));
        if (seg < 1) {
          continue;
        }
        primitives.push(verticalDimension(minX, ya, yb, xInner, `${seg}`, OFF_V));
      }
      const xDimCum = minX - INNER_ROW_MM - DIM_STACK_STEP_MM;
      const xDimTotal = minX - INNER_ROW_MM - 2 * DIM_STACK_STEP_MM;
      if (ys.length >= 4) {
        const y0 = ys[0]!;
        const y1 = ys[ys.length - 2]!;
        primitives.push(verticalDimension(minX, y0, y1, xDimCum, `${Math.round(y1 - y0)}`, OFF_V));
      }
      if (ys.length >= 2) {
        primitives.push(verticalDimension(minX, minY, maxY, xDimTotal, `${h}`, OFF_V));
      }
      didLeftChain = true;
    }

    if (!didBottomChain) {
      primitives.push(horizontalDimension(minX, minY, maxX, yOuter, `${w}`, OFF_H));
    }
    if (!didLeftChain) {
      primitives.push(verticalDimension(minX, minY, maxY, xOuter, `${h}`, OFF_V));
    }

    primitives.push(...pileCapDimensionPrimitives(pickSamplePileForCapDims(piles)));
  }

  if (showDiagonal) {
    const d = Math.round(dist({ x: minX, y: minY }, { x: maxX, y: maxY }));
    primitives.push(diagonalDimension(minX, minY, maxX, maxY, OUTER_ROW_MM * 0.85 + 40, `${d}`, 88));
  } else if (piles.length >= 2) {
    messages.push("Для диагонали задайте одно ортогональное кольцо ленты.");
  }

  return { primitives, messages };
}
