import type { Point2D } from "../geometry/types";

/**
 * Экстремумы контура в осях стока û и перпендикуляра v̂ = (-ûy, ûx) в мм плана.
 * Длина ската по стоку (карниз→конёк) = maxU − minU — **не** сырой span по world Y.
 */
export function roofPlaneContourUvExtentsMm(
  poly: readonly Point2D[],
  uxn: number,
  uyn: number,
): {
  readonly minU: number;
  readonly maxU: number;
  readonly spanUMm: number;
  readonly minV: number;
  readonly maxV: number;
  readonly spanVMm: number;
} {
  const vx = -uyn;
  const vy = uxn;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    const u = p.x * uxn + p.y * uyn;
    const v = p.x * vx + p.y * vy;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  return {
    minU,
    maxU,
    spanUMm: maxU - minU,
    minV,
    maxV,
    spanVMm: maxV - minV,
  };
}
