import type { Point2D } from "../geometry/types";

export interface Room {
  readonly id: string;
  readonly layerId: string;
  readonly name: string;
  /** Замкнутый контур в мм (этап 1 — опционально). */
  readonly polygonMm?: readonly Point2D[];
}
