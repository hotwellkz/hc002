import type { Point2D } from "../geometry/types";

/**
 * Подкос: диагональное усиление между стойкой и стропилом (или зоной прогона).
 */
export interface RoofStrutEntity {
  readonly id: string;
  readonly type: "roofStrut";
  readonly layerId: string;
  readonly roofSystemId: string;
  readonly profileId: string;
  readonly startPlanMm: Point2D;
  readonly startElevationMm: number;
  readonly endPlanMm: Point2D;
  readonly endElevationMm: number;
  readonly roofPostId: string;
  readonly roofRafterId: string;
  readonly sectionOrientation: "edge";
  readonly createdAt: string;
  readonly updatedAt: string;
}
