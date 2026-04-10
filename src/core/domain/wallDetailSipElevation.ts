/**
 * Единая модель SIP на фасаде «Вид стены»: прямоугольники отрисовки и размеры для таблицы
 * совпадают (spec = draw). Высота полноразмерных панелей = высота стены, не высота ядра между обвязками.
 */

import type { Opening } from "./opening";
import type { SipPanelRegion } from "./wallCalculation";
import type { Wall } from "./wall";
import { openingStripVerticalCutXsMm } from "./sipWallLayout";

export { openingStripVerticalCutXsMm };

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

/** Сегмент полосы SIP над световым проёмом (ширина — кусок по модульной сетке, не целиком проём). */
export interface WallDetailSipFacadeSliceAbove {
  readonly kind: "above_opening";
  readonly openingId: string;
  /** Порядковый индекс сегмента слева направо над этим проёмом (0…). */
  readonly segmentIndex: number;
  readonly drawX0: number;
  readonly drawX1: number;
  readonly drawY0: number;
  readonly drawY1: number;
  readonly specWidthMm: number;
  readonly specHeightMm: number;
}

/** Сегмент полосы SIP под окном; только для окон с подоконником > 0. */
export interface WallDetailSipFacadeSliceBelow {
  readonly kind: "below_opening";
  readonly openingId: string;
  readonly segmentIndex: number;
  readonly drawX0: number;
  readonly drawX1: number;
  readonly drawY0: number;
  readonly drawY1: number;
  readonly specWidthMm: number;
  readonly specHeightMm: number;
}

export type WallDetailSipFacadeSlice =
  | WallDetailSipFacadeSliceColumn
  | WallDetailSipFacadeSliceAbove
  | WallDetailSipFacadeSliceBelow;

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

/** Нижний край светового проёма на листе (граница под окном); ниже — зона SIP под проёмом. */
export function openingBottomSheetYMm(o: Opening, wallBottomMm: number): number {
  if (o.offsetFromStartMm == null) {
    return wallBottomMm;
  }
  return openingTopSheetYMm(o, wallBottomMm) + o.heightMm;
}

function inferPanelNominalWidthMmFromRegions(
  regions: readonly { readonly startOffsetMm: number; readonly endOffsetMm: number }[],
): number {
  let best = 0;
  for (const r of regions) {
    const w = Math.round(r.endOffsetMm - r.startOffsetMm);
    if (w > best) {
      best = w;
    }
  }
  return best > 0 ? best : 1250;
}

export interface BuildWallDetailSipFacadeSlicesOptions {
  /** Номинал ширины панели (мм), как в расчёте стены; иначе берётся эвристика по sipRegions. */
  readonly panelNominalWidthMm?: number;
}

/**
 * Слева направо: колонки sipRegions до проёма → сегменты полосы над проёмом → колонки после.
 * spec* совпадает с draw* (мм листа).
 */
export function buildWallDetailSipFacadeSlices(
  regions: readonly SipPanelRegion[],
  openings: readonly Opening[],
  wall: Wall,
  frame: WallDetailSipSheetFrameMm,
  options?: BuildWallDetailSipFacadeSlicesOptions,
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
  const panelNominalW =
    options?.panelNominalWidthMm != null && options.panelNominalWidthMm > 0
      ? Math.round(options.panelNominalWidthMm)
      : inferPanelNominalWidthMmFromRegions(sortedRegs);

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
      const cutsAbove = openingStripVerticalCutXsMm(x0, x1, sortedRegs, panelNominalW, eps);
      let seg = 0;
      for (let ci = 0; ci < cutsAbove.length - 1; ci++) {
        const xa = cutsAbove[ci]!;
        const xb = cutsAbove[ci + 1]!;
        if (xb - xa <= eps) {
          continue;
        }
        out.push({
          kind: "above_opening",
          openingId: o.id,
          segmentIndex: seg++,
          drawX0: xa,
          drawX1: xb,
          drawY0: wallTop,
          drawY1: yOpenTop,
          specWidthMm: xb - xa,
          specHeightMm: stripHeight,
        });
      }
    }
    const yOpenBottom = openingBottomSheetYMm(o, wallBottom);
    const belowHeight = wallBottom - yOpenBottom;
    if (o.kind === "window" && belowHeight > 1 && x1 - x0 > 1) {
      const cutsBelow = openingStripVerticalCutXsMm(x0, x1, sortedRegs, panelNominalW, eps);
      let segB = 0;
      for (let ci = 0; ci < cutsBelow.length - 1; ci++) {
        const xa = cutsBelow[ci]!;
        const xb = cutsBelow[ci + 1]!;
        if (xb - xa <= eps) {
          continue;
        }
        out.push({
          kind: "below_opening",
          openingId: o.id,
          segmentIndex: segB++,
          drawX0: xa,
          drawX1: xb,
          drawY0: yOpenBottom,
          drawY1: wallBottom,
          specWidthMm: xb - xa,
          specHeightMm: belowHeight,
        });
      }
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
 * Вертикали швов OSB на полную высоту листа: центры стыковочных досок + края полноразмерных колонок.
 * Границы между сегментами только над/под проёмом сюда не входят — пунктир не пересекает световой проём.
 */
export function wallDetailSipFullHeightOsbSeamXsMm(
  facadeSlices: readonly WallDetailSipFacadeSlice[],
  jointSeamCentersAlongMm: readonly number[],
): number[] {
  const s = new Set<number>();
  for (const c of jointSeamCentersAlongMm) {
    s.add(c);
  }
  for (const sl of facadeSlices) {
    if (sl.kind === "column") {
      s.add(sl.drawX0);
      s.add(sl.drawX1);
    }
  }
  return [...s].sort((a, b) => a - b);
}

/** Вертикальный штрихпунктир только в полосе SIP (мм листа, y вниз). */
export interface WallDetailSipVerticalSeamSegmentMm {
  readonly xMm: number;
  readonly y0Mm: number;
  readonly y1Mm: number;
}

/**
 * Внутренние вертикали между соседними сегментами `above_opening` / `below_opening` одного проёма.
 * Для пунктира стыка OSB только там, где есть панель (не через световой проём).
 */
export function wallDetailSipOpeningStripVerticalSeamSegmentsMm(
  facadeSlices: readonly WallDetailSipFacadeSlice[],
): WallDetailSipVerticalSeamSegmentMm[] {
  const eps = 0.5;
  const aboveByOpening = new Map<string, WallDetailSipFacadeSliceAbove[]>();
  const belowByOpening = new Map<string, WallDetailSipFacadeSliceBelow[]>();
  for (const sl of facadeSlices) {
    if (sl.kind === "above_opening") {
      const arr = aboveByOpening.get(sl.openingId) ?? [];
      arr.push(sl);
      aboveByOpening.set(sl.openingId, arr);
    } else if (sl.kind === "below_opening") {
      const arr = belowByOpening.get(sl.openingId) ?? [];
      arr.push(sl);
      belowByOpening.set(sl.openingId, arr);
    }
  }
  const out: WallDetailSipVerticalSeamSegmentMm[] = [];
  const pushSharedEdge = (
    left: WallDetailSipFacadeSliceAbove | WallDetailSipFacadeSliceBelow,
    right: WallDetailSipFacadeSliceAbove | WallDetailSipFacadeSliceBelow,
  ) => {
    const x = left.drawX1;
    if (Math.abs(x - right.drawX0) > eps) {
      return;
    }
    const y0 = Math.min(left.drawY0, left.drawY1);
    const y1 = Math.max(left.drawY0, left.drawY1);
    if (y1 - y0 > eps) {
      out.push({ xMm: x, y0Mm: y0, y1Mm: y1 });
    }
  };
  for (const arr of aboveByOpening.values()) {
    const sorted = [...arr].sort((a, b) => a.drawX0 - b.drawX0 || a.segmentIndex - b.segmentIndex);
    for (let i = 0; i < sorted.length - 1; i++) {
      pushSharedEdge(sorted[i]!, sorted[i + 1]!);
    }
  }
  for (const arr of belowByOpening.values()) {
    const sorted = [...arr].sort((a, b) => a.drawX0 - b.drawX0 || a.segmentIndex - b.segmentIndex);
    for (let i = 0; i < sorted.length - 1; i++) {
      pushSharedEdge(sorted[i]!, sorted[i + 1]!);
    }
  }
  return out;
}

/** Только вертикали границ листов/секций облицовки (без осей стоек каркаса). */
export function wallDetailSheetPanelVerticalBoundaryXsMm(facadeSlices: readonly WallDetailSipFacadeSlice[]): number[] {
  const s = new Set<number>();
  for (const sl of facadeSlices) {
    s.add(sl.drawX0);
    s.add(sl.drawX1);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Линии стыков листов по оси стены — граница между соседними sipRegions на одном участке (стык 1200|1200|остаток).
 */
export function sheetSeamCentersBetweenSipRegionsMm(
  regions: readonly { startOffsetMm: number; endOffsetMm: number }[],
): number[] {
  if (regions.length < 2) {
    return [];
  }
  const sorted = [...regions].sort((a, b) => a.startOffsetMm - b.startOffsetMm || a.endOffsetMm - b.endOffsetMm);
  const out: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (Math.abs(a.endOffsetMm - b.startOffsetMm) < 0.5) {
      out.push(a.endOffsetMm);
    }
  }
  return out;
}

/**
 * Все внутренние точки разреза вдоль стены по границам `sipRegions` (в т.ч. у проёма, где соседние листы не смежны).
 * Для ГКЛ с дверью нужно для размерной линии, иначе остаются только «стыки подряд» и добавляются срезы по световому
 * проёму — получается несогласованная ширина с таблицей листов.
 */
export function sheetInteriorCutXsAlongWallFromRegionsMm(
  regions: readonly { startOffsetMm: number; endOffsetMm: number }[],
  sipShellX0Mm: number,
  sipShellX1Mm: number,
): number[] {
  const left = Math.min(sipShellX0Mm, sipShellX1Mm);
  const right = Math.max(sipShellX0Mm, sipShellX1Mm);
  const eps = 0.5;
  const xs = new Set<number>();
  for (const r of regions) {
    for (const x of [r.startOffsetMm, r.endOffsetMm]) {
      if (x > left + eps && x < right - eps) {
        xs.add(x);
      }
    }
  }
  return [...xs].sort((a, b) => a - b);
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
  options?: { readonly omitClearOpeningCutsAlongWall?: boolean },
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
  if (!options?.omitClearOpeningCutsAlongWall) {
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
