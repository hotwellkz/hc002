import type { ReactNode } from "react";

/**
 * Размерные линии для режима «Вид стены» (SVG).
 * Засечки и отступы подписей в пикселях экрана — стабильная читаемость при любом zoom.
 */

/** Совпадает с `.wd-dim-text` / `.wd-dim-text-out` для measureText. */
const WD_DIM_TEXT_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Горизонтальный зазор между bbox соседних подписей на одной линии, px. */
const WD_DIM_LABEL_GAP_PX = 5;
/** Насколько подпись может выходить за границы своего сегмента по X (если не конфликтует с соседями), px. */
const WD_DIM_LABEL_OUTSIDE_SEGMENT_PX = 64;
/** Доп. поля к измеренной ширине текста (визуальный bbox). */
const WD_DIM_LABEL_H_PAD_PX = 6;

export function measureHorizontalDimTextWidthPx(text: string): number {
  if (typeof document === "undefined") {
    return text.length * 8.5;
  }
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) {
    return text.length * 8.5;
  }
  ctx.font = `14px ${WD_DIM_TEXT_FONT_STACK}`;
  return ctx.measureText(text).width;
}

interface DimSegLayoutItem {
  readonly segIndex: number;
  readonly L: number;
  readonly R: number;
  readonly mid: number;
  readonly w: number;
}

type DimLabelPlacement = { readonly kind: "inline"; readonly cx: number } | { readonly kind: "leader" };

/**
 * Подписи на одной горизонтальной размерной линии: сначала общий ряд с учётом соседей,
 * выноска только если не удаётся уложить без пересечений.
 */
export function layoutHorizontalDimLabelsForRowPx(items: readonly DimSegLayoutItem[]): Map<number, DimLabelPlacement> {
  const result = new Map<number, DimLabelPlacement>();
  const OUT = WD_DIM_LABEL_OUTSIDE_SEGMENT_PX;
  const GAP = WD_DIM_LABEL_GAP_PX;
  const EPS = 0.5;

  const tryPack = (queue: DimSegLayoutItem[]): { left: number[] } | null => {
    const n = queue.length;
    if (n === 0) {
      return { left: [] };
    }
    if (n === 1) {
      const it = queue[0]!;
      if (it.w > it.R - it.L + 2 * OUT + 1) {
        return null;
      }
      const lo = clamp(it.mid - it.w / 2, it.L - OUT, it.R + OUT - it.w);
      return { left: [lo] };
    }

    const left = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const it = queue[i]!;
      if (it.w > it.R - it.L + 2 * OUT + 1) {
        return null;
      }
      let lo = it.mid - it.w / 2;
      lo = clamp(lo, it.L - OUT, it.R + OUT - it.w);
      if (i > 0) {
        lo = Math.max(lo, left[i - 1]! + queue[i - 1]!.w + GAP);
      }
      left[i] = lo;
    }

    for (let i = n - 2; i >= 0; i--) {
      const maxL = left[i + 1]! - GAP - queue[i]!.w;
      if (left[i]! > maxL) {
        left[i] = maxL;
      }
      const it = queue[i]!;
      left[i] = clamp(left[i]!, it.L - OUT, it.R + OUT - it.w);
    }

    for (let i = 1; i < n; i++) {
      const need = left[i - 1]! + queue[i - 1]!.w + GAP;
      if (left[i]! < need) {
        left[i] = need;
      }
    }

    for (let i = 0; i < n; i++) {
      const it = queue[i]!;
      if (left[i]! < it.L - OUT - EPS) {
        return null;
      }
      if (left[i]! + it.w > it.R + OUT + EPS) {
        return null;
      }
      if (i > 0 && left[i]! < left[i - 1]! + queue[i - 1]!.w + GAP - EPS) {
        return null;
      }
    }

    return { left: [...left] };
  };

  let queue = [...items].sort((a, b) => a.L - b.L);

  while (queue.length > 0) {
    const packed = tryPack(queue);
    if (packed != null) {
      for (let k = 0; k < queue.length; k++) {
        const it = queue[k]!;
        const cx = packed.left[k]! + it.w / 2;
        result.set(it.segIndex, { kind: "inline", cx });
      }
      break;
    }
    const victim = queue.reduce((a, b) => {
      const da = a.R - a.L;
      const db = b.R - b.L;
      if (Math.abs(da - db) > EPS) {
        return da < db ? a : b;
      }
      return a.segIndex < b.segIndex ? a : b;
    });
    result.set(victim.segIndex, { kind: "leader" });
    queue = queue.filter((x) => x.segIndex !== victim.segIndex);
  }

  return result;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Половина длины поперечной засечки (полная ~10px). */
export const WD_DIM_TICK_HALF_PX = 5;
/** Зазор центра подписи от оси размерной линии (вертикальные размеры). */
export const WD_DIM_V_LABEL_GAP_PX = 12;
/** Дополнительный зазор для узких вертикальных цепочек (напр. толщина в «Вид сверху»). */
export const WD_DIM_V_LABEL_GAP_EXTRA_PX = 4;
/** Горизонтальные размеры: зазор подписи от оси линии (подпись ниже линии — в сторону белого поля). */
export const WD_DIM_H_TEXT_GAP_PX = 16;
/** Вынос короткого сегмента (px). */
export const WD_DIM_SHORT_LEADER_RUN_PX = 24;
export const WD_DIM_SHORT_LEADER_RISE_PX = 18;

/** Вертикальная размерная цепочка: линия, засечки ⟂ линии, подпись rotate(−90°). */
export function VerticalDimensionMm({
  xLineMm,
  y0Mm,
  y1Mm,
  text,
  sx,
  sy,
  labelGapPx = WD_DIM_V_LABEL_GAP_PX,
}: {
  readonly xLineMm: number;
  readonly y0Mm: number;
  readonly y1Mm: number;
  readonly text: string;
  readonly sx: (mm: number) => number;
  readonly sy: (mm: number) => number;
  /** Дополнительный отступ подписи от линии (px). */
  readonly labelGapPx?: number;
}) {
  const yLo = Math.min(y0Mm, y1Mm);
  const yHi = Math.max(y0Mm, y1Mm);
  const xL = sx(xLineMm);
  const yT = sy(yLo);
  const yB = sy(yHi);
  const tick = WD_DIM_TICK_HALF_PX;
  const labelX = xL - tick - labelGapPx;
  const labelY = (yT + yB) / 2;
  return (
    <g className="wd-dim-group wd-dim-group--vertical" pointerEvents="none">
      <line x1={xL} y1={yT} x2={xL} y2={yB} className="wd-dim-line" vectorEffect="non-scaling-stroke" />
      <line x1={xL - tick} y1={yT} x2={xL + tick} y2={yT} className="wd-dim-cap" vectorEffect="non-scaling-stroke" />
      <line x1={xL - tick} y1={yB} x2={xL + tick} y2={yB} className="wd-dim-cap" vectorEffect="non-scaling-stroke" />
      <text transform={`translate(${labelX},${labelY}) rotate(-90)`} className="wd-dim-text-v">
        {text}
      </text>
    </g>
  );
}

export interface DrawDimensionLevelOptions {
  /** Все сегменты на одной базовой линии (без «шахматного» смещения по Y). */
  readonly singleBaseline?: boolean;
  /**
   * Расстояние от оси размерной линии до верха подписи (px), `dominant-baseline: hanging`.
   * По умолчанию: засечка + {@link WD_DIM_H_TEXT_GAP_PX}.
   */
  readonly horizontalLabelBelowLinePx?: number;
}

interface DimSegWork {
  readonly i: number;
  readonly s: { a: number; b: number; text: string };
  readonly x0: number;
  readonly x1: number;
  readonly minX: number;
  readonly maxX: number;
  readonly row: number;
  readonly yLine: number;
}

/**
 * Горизонтальные размерные цепочки (фасад: длины сегментов).
 */
export function drawDimensionLevel(
  segments: readonly { a: number; b: number; text: string }[],
  yMm: number,
  sx: (x: number) => number,
  sy: (y: number) => number,
  dimRowStackStepMm: number,
  options?: DrawDimensionLevelOptions,
): ReactNode[] {
  const placed: { x0: number; x1: number; row: number }[] = [];
  const tick = WD_DIM_TICK_HALF_PX;
  const textBelowLinePx = options?.horizontalLabelBelowLinePx ?? tick + WD_DIM_H_TEXT_GAP_PX;
  const singleBaseline = options?.singleBaseline === true;

  const works: DimSegWork[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const x0 = sx(s.a);
    const x1 = sx(s.b);
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    let row = 0;
    if (!singleBaseline) {
      while (
        placed.some((p) => {
          if (p.row !== row) return false;
          const overlap = Math.min(maxX, p.x1) - Math.max(minX, p.x0);
          return overlap > 0.5;
        })
      ) {
        row += 1;
      }
    }
    placed.push({ x0: minX, x1: maxX, row });
    const yLine = sy(yMm + row * dimRowStackStepMm);
    works.push({ i, s, x0, x1, minX, maxX, row, yLine });
  }

  const byRow = new Map<number, DimSegWork[]>();
  for (const w of works) {
    const list = byRow.get(w.row) ?? [];
    list.push(w);
    byRow.set(w.row, list);
  }

  const placementBySeg = new Map<number, DimLabelPlacement>();
  for (const group of byRow.values()) {
    const items: DimSegLayoutItem[] = group.map((w) => {
      const tw = measureHorizontalDimTextWidthPx(w.s.text) + WD_DIM_LABEL_H_PAD_PX;
      return {
        segIndex: w.i,
        L: w.minX,
        R: w.maxX,
        mid: (w.minX + w.maxX) / 2,
        w: tw,
      };
    });
    const rowPl = layoutHorizontalDimLabelsForRowPx(items);
    for (const [idx, pl] of rowPl) {
      placementBySeg.set(idx, pl);
    }
  }

  return works.map((w) => {
    const { s, x0, x1, minX, maxX, row, yLine } = w;
    const rightX = maxX;
    const pl = placementBySeg.get(w.i) ?? { kind: "inline", cx: (minX + maxX) / 2 };
    return (
      <g key={`dim-${w.i}-${row}`} className="wd-dim-group wd-dim-group--horizontal" pointerEvents="none">
        <line x1={x0} y1={yLine} x2={x1} y2={yLine} className="wd-dim-line" vectorEffect="non-scaling-stroke" />
        <line x1={x0} y1={yLine - tick} x2={x0} y2={yLine + tick} className="wd-dim-cap" vectorEffect="non-scaling-stroke" />
        <line x1={x1} y1={yLine - tick} x2={x1} y2={yLine + tick} className="wd-dim-cap" vectorEffect="non-scaling-stroke" />
        {pl.kind === "leader" ? (
          <>
            <line
              x1={rightX}
              y1={yLine}
              x2={rightX + WD_DIM_SHORT_LEADER_RUN_PX}
              y2={yLine + Math.min(WD_DIM_SHORT_LEADER_RISE_PX, Math.max(tick, textBelowLinePx + 2))}
              className="wd-dim-line"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={rightX + WD_DIM_SHORT_LEADER_RUN_PX + 6}
              y={yLine + Math.min(WD_DIM_SHORT_LEADER_RISE_PX, Math.max(tick, textBelowLinePx + 2)) + 3}
              className="wd-dim-text-out wd-dim-text-h-below"
            >
              {s.text}
            </text>
          </>
        ) : (
          <text x={pl.cx} y={yLine + textBelowLinePx} className="wd-dim-text wd-dim-text-h-below">
            {s.text}
          </text>
        )}
      </g>
    );
  });
}
