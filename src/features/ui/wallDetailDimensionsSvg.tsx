import type { ReactNode } from "react";

/**
 * Размерные линии для режима «Вид стены» (SVG).
 * Засечки и отступы подписей в пикселях экрана — стабильная читаемость при любом zoom.
 */

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

  return segments.map((s, i) => {
    const x0 = sx(s.a);
    const x1 = sx(s.b);
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    let row = 0;
    if (!singleBaseline) {
      while (
        placed.some((p) => {
          if (p.row !== row) return false;
          /** Пересечение по X в пикселях: только реальное перекрытие, не касание границ. */
          const overlap = Math.min(maxX, p.x1) - Math.max(minX, p.x0);
          return overlap > 0.5;
        })
      ) {
        row += 1;
      }
    }
    placed.push({ x0: minX, x1: maxX, row });
    const yLine = sy(yMm + row * dimRowStackStepMm);
    const mid = (x0 + x1) / 2;
    const short = Math.abs(x1 - x0) < s.text.length * 9 + 22;
    return (
      <g key={`dim-${i}-${row}`} className="wd-dim-group wd-dim-group--horizontal" pointerEvents="none">
        <line x1={x0} y1={yLine} x2={x1} y2={yLine} className="wd-dim-line" vectorEffect="non-scaling-stroke" />
        <line x1={x0} y1={yLine - tick} x2={x0} y2={yLine + tick} className="wd-dim-cap" vectorEffect="non-scaling-stroke" />
        <line x1={x1} y1={yLine - tick} x2={x1} y2={yLine + tick} className="wd-dim-cap" vectorEffect="non-scaling-stroke" />
        {short ? (
          <>
            <line
              x1={x1}
              y1={yLine}
              x2={x1 + WD_DIM_SHORT_LEADER_RUN_PX}
              y2={yLine + Math.min(WD_DIM_SHORT_LEADER_RISE_PX, Math.max(tick, textBelowLinePx + 2))}
              className="wd-dim-line"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x1 + WD_DIM_SHORT_LEADER_RUN_PX + 6}
              y={yLine + Math.min(WD_DIM_SHORT_LEADER_RISE_PX, Math.max(tick, textBelowLinePx + 2)) + 3}
              className="wd-dim-text-out wd-dim-text-h-below"
            >
              {s.text}
            </text>
          </>
        ) : (
          <text x={mid} y={yLine + textBelowLinePx} className="wd-dim-text wd-dim-text-h-below">
            {s.text}
          </text>
        )}
      </g>
    );
  });
}
