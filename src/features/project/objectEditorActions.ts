import { isOpeningPlacedOnWall } from "@/core/domain/opening";
import type { Project } from "@/core/domain/project";
import { useAppStore } from "@/store/useAppStore";

export type ResolvedObjectEditorAction =
  | { readonly kind: "wall"; readonly wallId: string }
  | { readonly kind: "door"; readonly openingId: string }
  | { readonly kind: "window"; readonly openingId: string }
  | { readonly kind: "slab"; readonly slabId: string }
  | { readonly kind: "roofSystem"; readonly roofSystemId: string }
  | { readonly kind: "manualRoofPlane"; readonly roofPlaneId: string }
  | { readonly kind: "hint"; readonly message: string };

/**
 * Определяет, какой редактор открыть для текущего выделения на 2D-плане.
 * Один источник правды для кнопки «Редактировать», двойного клика и хоткеев.
 */
export function resolveObjectEditorForSelection(
  selectedEntityIds: readonly string[],
  project: Project,
): ResolvedObjectEditorAction {
  if (selectedEntityIds.length === 0) {
    return { kind: "hint", message: "Сначала выберите объект." };
  }
  if (selectedEntityIds.length > 1) {
    return { kind: "hint", message: "Редактирование доступно только для одного объекта." };
  }
  const id = selectedEntityIds[0]!;
  if (project.planLines.some((l) => l.id === id)) {
    return { kind: "hint", message: "Линия чертежа: удаление и выделение; отдельного редактора нет." };
  }
  if (project.foundationStrips.some((s) => s.id === id)) {
    return { kind: "hint", message: "Лента фундамента: удаление, выделение и перемещение на плане." };
  }
  if (project.foundationPiles.some((p) => p.id === id)) {
    return { kind: "hint", message: "Свая: параметры задаются при установке; удаление и перетаскивание на плане." };
  }
  if (project.slabs.some((s) => s.id === id)) {
    return { kind: "slab", slabId: id };
  }
  const roofPlane = project.roofPlanes.find((r) => r.id === id);
  if (roofPlane) {
    if (roofPlane.roofSystemId) {
      const sys = project.roofSystems.find((s) => s.id === roofPlane.roofSystemId);
      if (sys) {
        return { kind: "roofSystem", roofSystemId: sys.id };
      }
    }
    return { kind: "manualRoofPlane", roofPlaneId: roofPlane.id };
  }
  if (project.floorBeams.some((b) => b.id === id)) {
    return { kind: "hint", message: "Балка перекрытия: параметры задаются при создании; удаление — Del или контекстное меню." };
  }
  const wall = project.walls.find((w) => w.id === id);
  if (wall) {
    return { kind: "wall", wallId: id };
  }
  const o = project.openings.find((x) => x.id === id);
  if (!o) {
    return { kind: "hint", message: "Для этого объекта редактирование пока не реализовано." };
  }
  if (!isOpeningPlacedOnWall(o)) {
    return { kind: "hint", message: "Сначала разместите проём на стене." };
  }
  if (o.kind === "door") {
    return { kind: "door", openingId: id };
  }
  if (o.kind === "window") {
    return { kind: "window", openingId: id };
  }
  return { kind: "hint", message: "Для этого объекта редактирование пока не реализовано." };
}

export function applyResolvedObjectEditor(resolved: ResolvedObjectEditorAction): void {
  const store = useAppStore.getState();
  if (resolved.kind === "hint") {
    useAppStore.setState({ lastError: resolved.message });
    return;
  }
  if (resolved.kind === "wall") {
    store.openWallDetail(resolved.wallId);
    return;
  }
  if (resolved.kind === "door") {
    store.openDoorEditModal(resolved.openingId, "form");
    return;
  }
  if (resolved.kind === "slab") {
    store.openSlabEditModal(resolved.slabId);
    return;
  }
  if (resolved.kind === "roofSystem") {
    store.openRoofSystemEditModal(resolved.roofSystemId);
    return;
  }
  if (resolved.kind === "manualRoofPlane") {
    store.openRoofPlaneEditModal(resolved.roofPlaneId);
    return;
  }
  store.openWindowEditModal(resolved.openingId, "form");
}

/** Кнопка «Редактировать» и явные команды UI. */
export function openSelectedObjectEditor(): void {
  const { selectedEntityIds, currentProject } = useAppStore.getState();
  applyResolvedObjectEditor(resolveObjectEditorForSelection(selectedEntityIds, currentProject));
}

/**
 * Двойной клик по размещённому проёму: открыть модалку по фактическому kind в проекте
 * (без подмены «other» на окно).
 */
export function openPlacedOpeningObjectEditorFromHit(openingId: string): void {
  const { currentProject } = useAppStore.getState();
  const o = currentProject.openings.find((x) => x.id === openingId);
  if (!o || !isOpeningPlacedOnWall(o)) {
    return;
  }
  if (o.kind === "door") {
    useAppStore.getState().openDoorEditModal(openingId, "form");
    return;
  }
  if (o.kind === "window") {
    useAppStore.getState().openWindowEditModal(openingId, "form");
    return;
  }
  useAppStore.setState({ lastError: "Для этого объекта редактирование пока не реализовано." });
}

export function openWallObjectEditorFromHit(wallId: string): void {
  useAppStore.getState().openWallDetail(wallId);
}
