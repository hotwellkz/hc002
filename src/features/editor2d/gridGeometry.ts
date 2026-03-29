import type { ViewportTransform } from "./viewportTransforms";
import { screenToWorld, worldToScreen } from "./viewportTransforms";

export interface GridLine {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * Линии сетки в экранных координатах (обрезка по видимому миру с запасом).
 */
export function buildScreenGridLines(
  widthPx: number,
  heightPx: number,
  t: ViewportTransform,
  stepMm: number,
): GridLine[] {
  if (stepMm <= 0) {
    return [];
  }
  const corners = [
    screenToWorld(0, 0, t),
    screenToWorld(widthPx, 0, t),
    screenToWorld(widthPx, heightPx, t),
    screenToWorld(0, heightPx, t),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const pad = stepMm * 4;
  const gx0 = Math.floor((minX - pad) / stepMm) * stepMm;
  const gx1 = Math.ceil((maxX + pad) / stepMm) * stepMm;
  const gy0 = Math.floor((minY - pad) / stepMm) * stepMm;
  const gy1 = Math.ceil((maxY + pad) / stepMm) * stepMm;

  const lines: GridLine[] = [];
  for (let x = gx0; x <= gx1; x += stepMm) {
    const a = worldToScreen(x, minY - pad, t);
    const b = worldToScreen(x, maxY + pad, t);
    lines.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  for (let y = gy0; y <= gy1; y += stepMm) {
    const a = worldToScreen(minX - pad, y, t);
    const b = worldToScreen(maxX + pad, y, t);
    lines.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  return lines;
}
