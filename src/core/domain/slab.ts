import type { Point2D } from "../geometry/types";

/** Роль плиты при создании (общая геометрия; различаются пресеты UI и семантика модели). */
export type SlabStructuralPurpose = "overlap" | "foundation";

/**
 * Плита (монолитная плита перекрытия / фундаментная плита и т.п.): контур в плане + вертикальные параметры.
 * Геометрия — один замкнутый многоугольник (прямоугольник = 4 вершины).
 */
export interface SlabEntity {
  readonly id: string;
  readonly layerId: string;
  /** Вершины контура в плане (мм), замыкание не дублируется в конце массива. */
  readonly pointsMm: readonly Point2D[];
  /**
   * Локальная отметка верхней грани плиты (мм): над расчётным низом слоя (`computedBaseMm` стека слоёв).
   * Мировой верх: `slabWorldTopMm` в `layerVerticalStack`.
   */
  readonly levelMm: number;
  /** Толщина вниз от верхней грани, мм (> 0). */
  readonly depthMm: number;
  /** Если задано — плита создана из режима «Перекрытие» или «Фундамент». */
  readonly structuralPurpose?: SlabStructuralPurpose;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Категория плиты для видимости в 3D: лента/фундамент отдельно от перекрытия.
 * Без `structuralPurpose` считаем перекрытием (старые проекты и общий случай).
 */
export function slabStructuralCategoryFor3d(slab: SlabEntity): "foundation" | "overlap" {
  return slab.structuralPurpose === "foundation" ? "foundation" : "overlap";
}
