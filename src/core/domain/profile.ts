/**
 * Профиль сечения/конструкции (стена SIP, брус, труба и т.д.).
 * Хранится в проекте; в будущем сущности (стена) смогут ссылаться на profileId.
 */

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
  readonly notes?: string;
  readonly layers: readonly ProfileLayer[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
