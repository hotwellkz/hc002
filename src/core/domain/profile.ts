/**
 * Профиль сечения/конструкции (стена SIP, брус, труба и т.д.).
 * Хранится в проекте; в будущем сущности (стена) смогут ссылаться на profileId.
 */

import type { WallManufacturingSettings } from "./wallManufacturing";
import type { RoofProfileAssembly } from "./roofProfileAssembly";

export type ProfileCategory =
  | "wall"
  | "slab"
  | "roof"
  | "beam"
  | "pipe"
  | "board"
  | "custom";

export type ProfileCompositionMode = "layered" | "solid";

export type ProfileMaterialType =
  | "osb"
  | "eps"
  | "xps"
  | "wood"
  | "steel"
  | "gypsum"
  | "concrete"
  | "membrane"
  | "insulation"
  | "custom";

export interface ProfileLayer {
  readonly id: string;
  readonly orderIndex: number;
  readonly materialName: string;
  readonly materialType: ProfileMaterialType;
  readonly thicknessMm: number;
  readonly widthMm?: number;
  readonly heightMm?: number;
  readonly note?: string;
}

export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly category: ProfileCategory;
  readonly compositionMode: ProfileCompositionMode;
  readonly defaultHeightMm?: number;
  readonly defaultWidthMm?: number;
  /** Для solid — габарит по глубине/толщине сечения, мм */
  readonly defaultThicknessMm?: number;
  /**
   * Максимальная длина заготовки/сегмента для линейных элементов (балка, доска, труба и т.д.), мм.
   * Используется инструментом «Разделить» в перекрытии; при отсутствии — см. resolveLinearStockMaxLengthMm.
   */
  readonly linearStockMaxLengthMm?: number;
  /** SIP / производственный расчёт (категория wall). */
  /** Частичные переопределения; полный снимок даёт `resolveEffectiveWallManufacturing`. */
  readonly wallManufacturing?: Partial<WallManufacturingSettings>;
  readonly notes?: string;
  /**
   * Префикс автоматической маркировки стен (категория wall), например "1S".
   * Итоговая марка: {markPrefix}_{n}.
   */
  readonly markPrefix?: string;
  readonly layers: readonly ProfileLayer[];
  /** Параметры узла кровли (категория roof); не ломает остальные категории. */
  readonly roofAssembly?: RoofProfileAssembly;
  readonly createdAt: string;
  readonly updatedAt: string;
}
