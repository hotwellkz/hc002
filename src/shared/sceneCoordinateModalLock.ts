/**
 * Пока открыто окно ручного ввода координат (Пробел), холст не должен обновлять превью и реагировать на ЛКМ.
 * Единая проверка для всех вариантов модалки координат на 2D.
 */
export function isSceneCoordinateModalBlocking(store: {
  readonly wallCoordinateModalOpen: boolean;
  readonly floorBeamPlacementCoordinateModalOpen: boolean;
  readonly wallAnchorCoordinateModalOpen: boolean;
  readonly wallMoveCopyCoordinateModalOpen: boolean;
  readonly floorBeamMoveCopyCoordinateModalOpen: boolean;
  readonly lengthChangeCoordinateModalOpen: boolean;
  readonly projectOriginCoordinateModalOpen: boolean;
  readonly openingAlongMoveNumericModalOpen: boolean;
  readonly slabCoordinateModalOpen: boolean;
  readonly entityCopyCoordinateModalOpen: boolean;
  readonly entityCopyParamsModal: unknown | null;
  readonly roofPlaneEdgeOffsetModal: unknown | null;
}): boolean {
  return (
    store.wallCoordinateModalOpen ||
    store.floorBeamPlacementCoordinateModalOpen ||
    store.wallAnchorCoordinateModalOpen ||
    store.wallMoveCopyCoordinateModalOpen ||
    store.floorBeamMoveCopyCoordinateModalOpen ||
    store.lengthChangeCoordinateModalOpen ||
    store.projectOriginCoordinateModalOpen ||
    store.openingAlongMoveNumericModalOpen ||
    store.slabCoordinateModalOpen ||
    store.entityCopyCoordinateModalOpen ||
    store.entityCopyParamsModal != null ||
    store.roofPlaneEdgeOffsetModal != null
  );
}
