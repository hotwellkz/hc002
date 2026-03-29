import type { Point2D } from "../geometry/types";

export interface Dimension {
  readonly id: string;
  readonly a: Point2D;
  readonly b: Point2D;
  readonly offsetMm?: number;
}
