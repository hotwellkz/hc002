import type { Opening3dMeshKind } from "./opening3dAssemblySpecs";

/** Тип интерактивного объекта 3D (расширяемо). */
export type Editor3dPickKind =
  | "opening"
  | "foundationPile"
  | "foundationStrip"
  | "slab"
  | "wall"
  | "floorBeam"
  | "roofPlane"
  | "roofBatten"
  | "calc";

/**
 * Метаданные для raycast / picking.
 * entityId: id сущности в проекте (стена, плита, проём и т.д.).
 */
export interface Editor3dPickPayload {
  readonly kind: Editor3dPickKind;
  readonly entityId: string;
  readonly reactKey: string;
  /** Для kind === "opening": часть блока (стекло не текстурируется). */
  readonly openingMeshKind?: Opening3dMeshKind;
}
