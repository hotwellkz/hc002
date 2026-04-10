import type { ViewportTransform } from "./viewportTransforms";

/**
 * «Горизонтальная» стена на плане: вдоль оси X сильнее, чем вдоль Y (|Δx| ≥ |Δy|).
 * Для таких стен подпись проёма остаётся без поворота.
 */
export function isWallAxisMostlyHorizontalWorld(dx: number, dy: number): boolean {
  return Math.abs(dx) >= Math.abs(dy);
}

/**
 * Угол поворота подписи проёма на 2D-плане (радианы, система Pixi / экран).
 * Горизонтальная стена → 0. Вертикальная → вдоль направления стены, без «перевёрнутого» текста.
 */
export function openingPlanLabelRotationRad(
  wallDxWorld: number,
  wallDyWorld: number,
  t: ViewportTransform,
): number {
  if (isWallAxisMostlyHorizontalWorld(wallDxWorld, wallDyWorld)) {
    return 0;
  }
  const sx = wallDxWorld * t.zoomPixelsPerMm;
  const sy = -wallDyWorld * t.zoomPixelsPerMm;
  if (Math.hypot(sx, sy) < 1e-9) {
    return 0;
  }
  let rot = Math.atan2(sy, sx);
  if (rot <= -Math.PI / 2 + 1e-9) {
    rot += Math.PI;
  } else if (rot > Math.PI / 2 - 1e-9) {
    rot -= Math.PI;
  }
  return rot;
}
