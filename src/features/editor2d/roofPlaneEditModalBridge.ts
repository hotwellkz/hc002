/** Мост из модалки смещения ребра к ref-сессии перетаскивания в Editor2DWorkspace (без циклических импортов). */
export const roofPlaneEditModalBridge = {
  onEdgeOffsetApplied: null as (() => void) | null,
  onEdgeOffsetCancelled: null as (() => void) | null,
};
