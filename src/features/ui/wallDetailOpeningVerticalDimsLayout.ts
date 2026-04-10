import {
  DIMENSION_FONT_SIZE_WALL_DETAIL_VERTICAL_PX,
  DIMENSION_TICK_HALF_PX,
  measureDimensionLabelTextWidthPx,
} from "@/shared/dimensionStyle";

/** Базовый отступ оси вертикального размера от правого края проёма (мм листа). */
export const WALL_DETAIL_OPENING_V_DIM_BASE_OFFSET_MM = 40;

/** Минимальный зазор между осями соседних столбцов при перекрытии по Y (мм), до пересчёта через zoom. */
const COLUMN_MIN_GAP_EXTRA_MM = 6;

/** Не совмещать ось размера с вертикалью стыка/стойки (мм). */
const OBSTACLE_CLEAR_MM = 9;
const OBSTACLE_NUDGE_MM = 14;
const MAX_OBSTACLE_NUDGE_STEPS = 24;

export interface OpeningVerticalDimColumnInput {
  readonly id: string;
  readonly x0: number;
  readonly x1: number;
  /** Верх зоны вертикальных подписей (верх проёма). */
  readonly yDimTopMm: number;
  /** Низ зоны (пол для окна — нижняя кромка стены; для двери — низ полотна). */
  readonly yDimBottomMm: number;
  /** Подписи размеров (для оценки ширины и минимального X). */
  readonly dimTexts: readonly string[];
}

function spanYMm(o: OpeningVerticalDimColumnInput): { y0: number; y1: number } {
  return {
    y0: Math.min(o.yDimTopMm, o.yDimBottomMm),
    y1: Math.max(o.yDimTopMm, o.yDimBottomMm),
  };
}

function spansOverlapY(
  a: { y0: number; y1: number },
  b: { y0: number; y1: number },
  epsMm = 3,
): boolean {
  return Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > epsMm;
}

/** Минимальная координата X оси размера (мм), чтобы подпись не заходила внутрь проёма. */
export function minVerticalOpeningDimLineXMm(
  openingRightMm: number,
  dimTexts: readonly string[],
  zoom: number,
  labelGapPx: number,
): number {
  const z = Math.max(zoom, 1e-6);
  const fs = DIMENSION_FONT_SIZE_WALL_DETAIL_VERTICAL_PX;
  let maxTw = 0;
  for (const t of dimTexts) {
    maxTw = Math.max(maxTw, measureDimensionLabelTextWidthPx(t, fs));
  }
  const leftPadMm = (DIMENSION_TICK_HALF_PX + labelGapPx + maxTw / 2 + fs / 2 + 6) / z;
  return openingRightMm + Math.max(WALL_DETAIL_OPENING_V_DIM_BASE_OFFSET_MM, leftPadMm + 4);
}

/** Горизонтальный шаг между столбцами (мм), чтобы подписи соседних проёмов не слипались на экране. */
export function verticalOpeningDimMinColumnDeltaMm(zoom: number, labelGapPx: number): number {
  const z = Math.max(zoom, 1e-6);
  const fs = DIMENSION_FONT_SIZE_WALL_DETAIL_VERTICAL_PX;
  const sampleW = measureDimensionLabelTextWidthPx("9999", fs);
  const stripPx = sampleW + DIMENSION_TICK_HALF_PX * 2 + labelGapPx * 2 + fs + 10;
  return stripPx / z + COLUMN_MIN_GAP_EXTRA_MM;
}

function nudgeAwayFromObstaclesMm(x: number, obstacleXsMm: readonly number[]): number {
  let cur = x;
  for (let step = 0; step < MAX_OBSTACLE_NUDGE_STEPS; step++) {
    const clash = obstacleXsMm.some((cx) => Math.abs(cur - cx) < OBSTACLE_CLEAR_MM);
    if (!clash) {
      return cur;
    }
    cur += OBSTACLE_NUDGE_MM;
  }
  return cur;
}

/**
 * Одна ось X на проём для всех вертикальных размеров (высота, подоконник и т.д.),
 * с разведением столбцов, если проёмы перекрываются по высоте, и сдвиг от вертикалей стыков/стоек.
 */
export function computeOpeningVerticalDimColumnXmm(
  openings: readonly OpeningVerticalDimColumnInput[],
  obstacleXsMm: readonly number[],
  zoom: number,
  labelGapPx: number,
): ReadonlyMap<string, number> {
  const sorted = [...openings].sort((a, b) => a.x0 - b.x0);
  const columnX = new Map<string, number>();
  const minDelta = verticalOpeningDimMinColumnDeltaMm(zoom, labelGapPx);

  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i]!;
    let x = minVerticalOpeningDimLineXMm(o.x1, o.dimTexts, zoom, labelGapPx);
    const spanO = spanYMm(o);

    for (let j = 0; j < i; j++) {
      const p = sorted[j]!;
      if (spansOverlapY(spanO, spanYMm(p))) {
        const prevX = columnX.get(p.id);
        if (prevX != null) {
          x = Math.max(x, prevX + minDelta);
        }
      }
    }

    x = nudgeAwayFromObstaclesMm(x, obstacleXsMm);
    columnX.set(o.id, x);
  }

  return columnX;
}
