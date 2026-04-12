import type { ReportPrimitive } from "../types";

/** A4 альбомная ориентация, размеры в мм (ширина × высота). */
export const A4_LANDSCAPE_WIDTH_MM = 297;
export const A4_LANDSCAPE_HEIGHT_MM = 210;

/** Поля внутренней рамки. */
export const A4_LANDSCAPE_MARGIN_MM = 12;

/** Прямоугольник области чертежа (внутри рамки, под заголовком). */
export function a4LandscapeDrawingViewportMm(): {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
} {
  const m = A4_LANDSCAPE_MARGIN_MM;
  const titleBand = 22;
  const bottomNotes = 32;
  const x = m + 4;
  const y = m + titleBand;
  const w = A4_LANDSCAPE_WIDTH_MM - 2 * m - 8;
  const h = A4_LANDSCAPE_HEIGHT_MM - m - titleBand - bottomNotes - m;
  return { xMm: x, yMm: y, widthMm: w, heightMm: h };
}

/** Позиции поля примечаний (низ листа). */
export function a4LandscapeNotesRectMm(): { xMm: number; yMm: number; widthMm: number; heightMm: number } {
  const m = A4_LANDSCAPE_MARGIN_MM;
  return {
    xMm: m,
    yMm: A4_LANDSCAPE_HEIGHT_MM - m - 28,
    widthMm: A4_LANDSCAPE_WIDTH_MM - 2 * m,
    heightMm: 24,
  };
}

export interface A4LandscapeChromeParams {
  readonly projectName: string;
  readonly reportTitle: string;
  readonly scaleText: string;
  readonly dateText: string;
  readonly sheetLabel: string;
}

/** Рамка, заголовок и штамп в координатах листа (мм, Y вниз). */
export function buildA4LandscapeChrome(p: A4LandscapeChromeParams): readonly ReportPrimitive[] {
  const m = A4_LANDSCAPE_MARGIN_MM;
  const out: ReportPrimitive[] = [];
  out.push({
    kind: "rect",
    xMm: m,
    yMm: m,
    widthMm: A4_LANDSCAPE_WIDTH_MM - 2 * m,
    heightMm: A4_LANDSCAPE_HEIGHT_MM - 2 * m,
    strokeMm: 0.35,
  });
  const innerPad = 2;
  out.push({
    kind: "rect",
    xMm: m + innerPad,
    yMm: m + innerPad,
    widthMm: A4_LANDSCAPE_WIDTH_MM - 2 * m - 2 * innerPad,
    heightMm: A4_LANDSCAPE_HEIGHT_MM - 2 * m - 2 * innerPad,
    strokeMm: 0.18,
  });
  const titleY = m + 5;
  out.push({
    kind: "text",
    xMm: m + 8,
    yMm: titleY,
    text: p.projectName,
    fontSizeMm: 2.85,
    anchor: "start",
  });
  out.push({
    kind: "text",
    xMm: A4_LANDSCAPE_WIDTH_MM / 2,
    yMm: titleY,
    text: p.reportTitle,
    fontSizeMm: 3.1,
    anchor: "middle",
  });
  const metaY = A4_LANDSCAPE_HEIGHT_MM - m - 9;
  out.push({
    kind: "text",
    xMm: m + 8,
    yMm: metaY,
    text: `Масштаб ${p.scaleText} · ${p.dateText} · ${p.sheetLabel}`,
    fontSizeMm: 2.35,
    anchor: "start",
  });
  return out;
}
