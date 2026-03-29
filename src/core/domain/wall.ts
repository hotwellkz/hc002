import type { Point2D } from "../geometry/types";

export interface Wall {
  readonly id: string;
  readonly layerId: string;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly thicknessMm: number;
  readonly heightMm: number;
}
