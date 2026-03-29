import type { Point2D } from "../geometry/types";

export interface Wall {
  readonly id: string;
  readonly layerId: string;
  /** Профиль сечения из project.profiles (обязателен для стен, созданных из инструмента). */
  readonly profileId?: string;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly thicknessMm: number;
  readonly heightMm: number;
  /** Отметка низа стены от нуля проекта по Z, мм. */
  readonly baseElevationMm?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  /** Одинаковый id для стен, созданных одной операцией (например, контур прямоугольника). */
  readonly placementGroupId?: string;
}
