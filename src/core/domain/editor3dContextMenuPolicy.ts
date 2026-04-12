import type { Editor3dPickPayload } from "./editor3dPickPayload";

/**
 * Сущности, которые можно удалить из 3D через общий {@link deleteEntitiesFromProject}.
 * Детали расчёта (kind === "calc") привязаны к стене и отдельно не удаляются — только через 2D/расчёт.
 */
export function editor3dPickSupportsContextDelete(pick: Editor3dPickPayload): boolean {
  return pick.kind !== "calc" && pick.kind !== "roofBatten";
}

export function editor3dContextDeleteTargetLabelRu(pick: Editor3dPickPayload): string {
  switch (pick.kind) {
    case "wall":
      return "стену";
    case "slab":
      return "плиту";
    case "foundationStrip":
      return "ленту фундамента";
    case "foundationPile":
      return "сваю";
    case "opening":
      return "проём";
    case "floorBeam":
      return "балку перекрытия";
    default:
      return "объект";
  }
}
