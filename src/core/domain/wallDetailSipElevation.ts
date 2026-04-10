/**
 * Единая модель SIP на фасаде «Вид стены»: прямоугольники отрисовки и размеры для таблицы
 * совпадают (spec = draw). Высота полноразмерных панелей = высота стены, не высота ядра между обвязками.
 */

import type { Opening } from "./opening";
import type { SipPanelRegion } from "./wallCalculation";
import type { Wall } from "./wall";

/** Координаты стены на листе (y вниз). */
export interface WallDetailSipSheetFrameMm {
  readonly wallTopMm: number;
  readonly wallBottomMm: number;
  readonly wallHeightMm: number;
}

/** Колонка SIP вдоль стены на всю высоту стены (как в спецификации OSB/SIP по фасаду). */
export interface WallDetailSipFacadeSliceColumn {
  readonly kind: "column";
  readonly region: SipPanelRegion;
  readonly drawX0: number;
  readonly drawX1: number;
  readonly drawY0: number;
  readonly drawY1: number;
  readonly specWidthMm: number;
  readonly specHeightMm: number;
}

/** Полоса SIP над световым проёмом (ширина = ширина проёма по оси стены). */
export interface WallDetailSipFacadeSliceAbove {
  readonly kind: "above_opening";
  readonly openingId: string;
  readonly drawX0: number;
  readonly drawX1: number;
  readonly drawY0: number;
  readonly drawY1: number;
  readonly specWidthMm: number;
  readonly specHeightMm: number;
}

export type WallDetailSipFacadeSlice = WallDetailSipFacadeSliceColumn | WallDetailSipFacadeSliceAbove;

/**
 * Верх светового проёма на листе (нижняя граница полосы SIP «над» проёмом).
 * Дверь: `heightMm` — от низа стены до низа перемычки (как в sipWallLayout).
 */
export function openingTopSheetYMm(o: Opening, wallBottomMm: number): number {
  if (o.offsetFromStartMm == null) {
    return wallBottomMm;
  }
  if (o.kind === "door") {
    return wallBottomMm - o.heightMm;
  }
  const sill = Math.max(0, o.sillHeightMm ?? o.position?.sillLevelMm ?? 0);
  return wallBottomMm - sill - o.heightMm;
}

/**
 * Слева направо: колонки sipRegions до проёма → полоса над проёмом → колонки после.
 * spec* совпадает с draw* (мм листа).
 */
export function buildWallDetailSipFacadeSlices(
  regions: readonly SipPanelRegion[],
  openings: readonly Opening[],
  wall: Wall,
  frame: WallDetailSipSheetFrameMm,
): WallDetailSipFacadeSlice[] {
  const wallTop = frame.wallTopMm;
  const wallBottom = frame.wallBottomMm;
  const H = frame.wallHeightMm;

  const flex = openings
    .filter(
      (o): o is Opening & { offsetFromStartMm: number } =>
        o.wallId === wall.id &&
        o.offsetFromStartMm != null &&
        (o.kind === "door" || o.kind === "window"),
    )
    .sort((a, b) => a.offsetFromStartMm - b.offsetFromStartMm);

  const sortedRegs = [...regions].sort((a, b) => a.startOffsetMm - b.startOffsetMm || a.index - b.index);

  const out: WallDetailSipFacadeSlice[] = [];
  let ri = 0;
  const eps = 0.5;

  const pushColumn = (r: SipPanelRegion) => {
    const w = r.endOffsetMm - r.startOffsetMm;
    out.push({
      kind: "column",
      region: r,
      drawX0: r.startOffsetMm,
      drawX1: r.endOffsetMm,
      drawY0: wallTop,
      drawY1: wallBottom,
      specWidthMm: w,
      specHeightMm: H,
    });
  };

  for (const o of flex) {
    const lo = o.offsetFromStartMm;
    while (ri < sortedRegs.length && sortedRegs[ri]!.endOffsetMm <= lo + eps) {
      pushColumn(sortedRegs[ri]!);
      ri++;
    }
    const x0 = o.offsetFromStartMm;
    const x1 = o.offsetFromStartMm + o.widthMm;
    const yOpenTop = openingTopSheetYMm(o, wallBottom);
    const stripHeight = yOpenTop - wallTop;
    if (stripHeight > 1 && x1 - x0 > 1) {
      out.push({
        kind: "above_opening",
        openingId: o.id,
        drawX0: x0,
        drawX1: x1,
        drawY0: wallTop,
        drawY1: yOpenTop,
        specWidthMm: o.widthMm,
        specHeightMm: stripHeight,
      });
    }
  }
  while (ri < sortedRegs.length) {
    pushColumn(sortedRegs[ri]!);
    ri++;
  }
  return out;
}

/**
 * Уникальные вертикали границ панелей на фасаде (края листов + стыки joint_board).
 */
export function wallDetailSipVerticalBoundaryXsMm(
  facadeSlices: readonly WallDetailSipFacadeSlice[],
  jointSeamCentersAlongMm: readonly number[],
): number[] {
  const s = new Set<number>();
  for (const c of jointSeamCentersAlongMm) {
    s.add(c);
  }
  for (const sl of facadeSlices) {
    s.add(sl.drawX0);
    s.add(sl.drawX1);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Горизонтальные размеры ширины SIP на «Вид стены»: стыки OSB + внешние границы проёмов,
 * чтобы не показывать одну ширину через дверной проём (напр. 3137 через зазор).
 */
export function sipPanelHorizontalDimensionSegmentsWallDetailMm(
  sipShellX0Mm: number,
  sipShellX1Mm: number,
  seamCentersAlongMm: readonly number[],
  openingsOnWall: readonly Opening[],
): { a: number; b: number; text: string }[] {
  const left = Math.min(sipShellX0Mm, sipShellX1Mm);
  const right = Math.max(sipShellX0Mm, sipShellX1Mm);
  const eps = 0.5;
  const cut = new Set<number>([left, right]);
  for (const x of seamCentersAlongMm) {
    if (x > left + eps && x < right - eps) {
      cut.add(x);
    }
  }
  for (const o of openingsOnWall) {
    if (o.offsetFromStartMm == null) {
      continue;
    }
    if (o.kind !== "door" && o.kind !== "window") {
      continue;
    }
    const lo = o.offsetFromStartMm;
    const hi = lo + o.widthMm;
    if (hi <= left + eps || lo >= right - eps) {
      continue;
    }
    cut.add(Math.max(left, lo));
    cut.add(Math.min(right, hi));
  }
  const boundaries = [...cut].sort((a, b) => a - b);
  const out: { a: number; b: number; text: string }[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i]!;
    const b = boundaries[i + 1]!;
    if (b - a < 0.5) {
      continue;
    }
    out.push({ a, b, text: `${Math.round(b - a)}` });
  }
  return out;
}
