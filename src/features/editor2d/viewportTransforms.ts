export interface ViewportTransform {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoomPixelsPerMm: number;
  readonly panXMm: number;
  readonly panYMm: number;
}

export function worldToScreen(
  worldXMm: number,
  worldYMm: number,
  t: ViewportTransform,
): { readonly x: number; readonly y: number } {
  return {
    x: t.centerX + (worldXMm - t.panXMm) * t.zoomPixelsPerMm,
    y: t.centerY - (worldYMm - t.panYMm) * t.zoomPixelsPerMm,
  };
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  t: ViewportTransform,
): { readonly x: number; readonly y: number } {
  return {
    x: (screenX - t.centerX) / t.zoomPixelsPerMm + t.panXMm,
    y: -(screenY - t.centerY) / t.zoomPixelsPerMm + t.panYMm,
  };
}

export function buildViewportTransform(
  widthPx: number,
  heightPx: number,
  panXMm: number,
  panYMm: number,
  zoomPixelsPerMm: number,
): ViewportTransform {
  return {
    centerX: widthPx / 2,
    centerY: heightPx / 2,
    zoomPixelsPerMm,
    panXMm,
    panYMm,
  };
}
