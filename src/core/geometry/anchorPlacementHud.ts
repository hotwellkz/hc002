const ORTHO_TOL_MM = 0.8;

export type AnchorRelativeHud = {
  readonly dx: number;
  readonly dy: number;
  readonly d: number;
  /** Угол от оси +X против часовой стрелки, градусы, 0…360 */
  readonly angleDeg: number;
  /** Подпись, если направление почти ортогонально */
  readonly axisHint: string | null;
};

/**
 * Относительные координаты от опорной точки до текущей (мм) + угол и подсказка ортогонали.
 */
export function computeAnchorRelativeHud(anchorX: number, anchorY: number, px: number, py: number): AnchorRelativeHud {
  const dx = px - anchorX;
  const dy = py - anchorY;
  const d = Math.hypot(dx, dy);
  const rad = Math.atan2(dy, dx);
  let angleDeg = (rad * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;

  let axisHint: string | null = null;
  if (d < ORTHO_TOL_MM) {
    axisHint = "начало";
  } else if (Math.abs(dy) < ORTHO_TOL_MM) {
    axisHint = "горизонталь";
  } else if (Math.abs(dx) < ORTHO_TOL_MM) {
    axisHint = "вертикаль";
  }

  return { dx, dy, d, angleDeg, axisHint };
}
