/**
 * Запись о том, что по скатам выполнен расчёт кровли для 3D.
 * Геометрия в 3D строится заново из `roofPlanes` + профиля; 2D-скаты не изменяются.
 */
export interface RoofAssemblyCalculation {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Идентификаторы скатов (`RoofPlaneEntity.id`), включённых в этот расчётный узел. */
  readonly roofPlaneIds: readonly string[];
}
