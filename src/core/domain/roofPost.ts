import type { Point2D } from "../geometry/types";

/**
 * Вертикальная стойка под прогоном (опора на перекрытие).
 */
export interface RoofPostEntity {
  readonly id: string;
  readonly type: "roofPost";
  readonly layerId: string;
  readonly roofSystemId: string;
  readonly profileId: string;
  readonly planCenterMm: Point2D;
  readonly bottomElevationMm: number;
  readonly topElevationMm: number;
  readonly supportingFloorBeamId: string;
  readonly sectionOrientation: "edge";
  readonly createdAt: string;
  readonly updatedAt: string;
}
