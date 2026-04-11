/**
 * Пока открыто окно ручного ввода координат (Пробел), холст не должен обновлять превью и реагировать на ЛКМ.
 * Единая проверка для всех вариантов модалки координат на 2D.
 */
export function isSceneCoordinateModalBlocking(store: {
  readonly wallCoordinateModalOpen: boolean;
  readonly wallAnchorCoordinateModalOpen: boolean;
  readonly wallMoveCopyCoordinateModalOpen: boolean;
  readonly lengthChangeCoordinateModalOpen: boolean;
  readonly projectOriginCoordinateModalOpen: boolean;
}): boolean {
  return (
    store.wallCoordinateModalOpen ||
    store.wallAnchorCoordinateModalOpen ||
    store.wallMoveCopyCoordinateModalOpen ||
    store.lengthChangeCoordinateModalOpen ||
    store.projectOriginCoordinateModalOpen
  );
}
