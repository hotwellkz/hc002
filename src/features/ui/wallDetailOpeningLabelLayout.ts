/**
 * Адаптивная подпись проёма на «Вид стены»: одна строка или марка + размеры на двух.
 * Ширина оценивается через Canvas (как CSS font-size + font-family).
 */

export const WD_OPEN_LABEL_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const DEFAULT_FONT_SIZE_PX = 12;
const MIN_FONT_SIZE_PX = 9;
const LINE_HEIGHT_FACTOR = 1.2;
/** Горизонтальный отступ подписи от кромки проёма, px (экран). */
const PAD_H_PX = 6;
const PAD_V_PX = 4;

function measureTextWidthPx(text: string, fontSizePx: number): number {
  if (typeof document === "undefined") {
    return text.length * fontSizePx * 0.52;
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return text.length * fontSizePx * 0.52;
  }
  ctx.font = `${fontSizePx}px ${WD_OPEN_LABEL_FONT_STACK}`;
  return ctx.measureText(text).width;
}

export type WallDetailOpeningLabelLayout =
  | { readonly mode: "one"; readonly fontSizePx: number; readonly text: string }
  | { readonly mode: "two"; readonly fontSizePx: number; readonly line1: string; readonly line2: string };

/**
 * Подпись помещается в одну строку при 12px — оставляем одну; иначе две строки (марка / размеры).
 * При нехватке места по ширине или высоте слегка уменьшаем кегль в пределах [MIN, DEFAULT].
 */
export function computeWallDetailOpeningLabelLayout(
  mark: string,
  widthMm: number,
  heightMm: number,
  openingWidthPx: number,
  openingHeightPx: number,
): WallDetailOpeningLabelLayout {
  const sizeText = `${Math.round(widthMm)}/${Math.round(heightMm)}`;
  const fullSingle = `${mark} ${sizeText}`;
  const maxW = Math.max(0, openingWidthPx - 2 * PAD_H_PX);
  const maxH = Math.max(0, openingHeightPx - 2 * PAD_V_PX);

  let fs = DEFAULT_FONT_SIZE_PX;
  while (fs >= MIN_FONT_SIZE_PX) {
    const singleW = measureTextWidthPx(fullSingle, fs);
    const singleLineH = fs * LINE_HEIGHT_FACTOR;
    if (singleW <= maxW && singleLineH <= maxH) {
      return { mode: "one", fontSizePx: fs, text: fullSingle };
    }

    const w1 = measureTextWidthPx(mark, fs);
    const w2 = measureTextWidthPx(sizeText, fs);
    const blockH = 2 * fs * LINE_HEIGHT_FACTOR;
    if (w1 <= maxW && w2 <= maxW && blockH <= maxH) {
      return { mode: "two", fontSizePx: fs, line1: mark, line2: sizeText };
    }

    fs -= 0.5;
  }

  return { mode: "two", fontSizePx: MIN_FONT_SIZE_PX, line1: mark, line2: sizeText };
}

export function openingLabelLineHeightPx(fontSizePx: number): number {
  return fontSizePx * LINE_HEIGHT_FACTOR;
}
