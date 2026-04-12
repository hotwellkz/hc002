import type { Point2D } from "../geometry/types";

/**
 * Продольный прогон вдоль конька (несущий брус под опорой стропил).
 */
export interface RoofPurlinEntity {
  readonly id: string;
  readonly type: "roofPurlin";
  readonly layerId: string;
  readonly roofSystemId: string;
  readonly profileId: string;
  /** Ломаная в плане вдоль линии конька, мм. */
  readonly polylinePlanMm: readonly Point2D[];
  /** Отметка оси прогона (центр сечения) в каждой вершине полилинии, мм (мир). */
  readonly vertexAxisElevationMm: readonly number[];
  readonly sectionOrientation: "edge";
  readonly createdAt: string;
  readonly updatedAt: string;
}
