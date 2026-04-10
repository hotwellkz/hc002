/**
 * Единый визуальный стиль размерных линий: вкладка «Вид стены» (SVG) и 2D-план (Pixi).
 * Логика геометрии размеров в домене не задаётся здесь — только токены оформления.
 */

import { cssHexToPixiNumber } from "@/shared/cssColor";

/** Совпадает с подписью в measureDimensionLabelTextWidthPx и с Pixi Text. */
export const DIMENSION_TEXT_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Как `.wd-dim-text` / `.wd-dim-text-out` в wall-detail-workspace.css */
export const DIMENSION_FONT_SIZE_PX = 14;

/** Вертикальные размеры проёмов на вкладке «Вид стены» (`.wd-dim-text-v`). */
export const DIMENSION_FONT_SIZE_WALL_DETAIL_VERTICAL_PX = 12;

/** Половина длины поперечной засечки на конце размерной линии (полная ≈ 10px). */
export const DIMENSION_TICK_HALF_PX = 5;

/** Горизонтальный зазор между bbox соседних подписей на одной линии, px. */
export const DIMENSION_LABEL_GAP_PX = 5;

/** Насколько подпись может выходить за границы сегмента по X при раскладке, px. */
export const DIMENSION_LABEL_OUTSIDE_SEGMENT_PX = 64;

/** Доп. поля к измеренной ширине текста (визуальный bbox). */
export const DIMENSION_LABEL_H_PAD_PX = 6;

/**
 * Дополнительный отступ размерной линии от контура при отрисовке 2D-плана (мм).
 * Суммируется с `Dimension.offsetMm` (или дефолтом 420 мм) только в рендере Pixi — значения размеров и привязка к точкам a/b не меняются.
 * ~ один шаг сетки при gridStepMm = 100.
 */
export const PLAN_2D_DIMENSION_OFFSET_EXTRA_MM = 100;

/** Зазор подписи от оси размерной линии (подпись «снаружи» цепочки). */
export const DIMENSION_H_TEXT_GAP_PX = 16;

/** Зазор центра подписи от оси размерной линии (вертикальные размеры SVG). */
export const DIMENSION_V_LABEL_GAP_PX = 12;

/** Доп. зазор для вертикалей у проёмов (не прижимать подпись к линии). */
export const DIMENSION_V_LABEL_GAP_OPENING_EXTRA_PX = 3;

export const DIMENSION_V_LABEL_GAP_EXTRA_PX = 4;

/** Вынос короткого сегмента (px). */
export const DIMENSION_SHORT_LEADER_RUN_PX = 24;
export const DIMENSION_SHORT_LEADER_RISE_PX = 18;

/** Расстояние от оси линии до «верха» подписи (аналог tick + H_TEXT_GAP). */
export function dimensionLabelOffsetFromDimAxisPx(): number {
  return DIMENSION_TICK_HALF_PX + DIMENSION_H_TEXT_GAP_PX;
}

/** Ширина подписи размера в px (согласовано с Pixi Text и SVG «Вид стены»). */
export function measureDimensionLabelTextWidthPx(
  text: string,
  fontSizePx: number = DIMENSION_FONT_SIZE_PX,
): number {
  if (typeof document === "undefined") {
    return text.length * (fontSizePx * 0.55);
  }
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) {
    return text.length * (fontSizePx * 0.55);
  }
  ctx.font = `${fontSizePx}px ${DIMENSION_TEXT_FONT_STACK}`;
  return ctx.measureText(text).width;
}

/** Цвета из theme.css — те же, что используют `.wd-dim-line` / `.wd-dim-text` через переменные. */
export function readDimensionStyleColors(): { readonly line: number; readonly text: number } {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const line = cs.getPropertyValue("--color-dimension-line").trim() || "#64748b";
  const text = cs.getPropertyValue("--color-dimension-text").trim() || "#1f2937";
  return { line: cssHexToPixiNumber(line), text: cssHexToPixiNumber(text) };
}
