import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Широкий столбец: обе панели могут быть открыты одновременно. */
export const REPORT_LAYOUT_WIDE_MIN_PX = 1400;
/** Узкий режим: по умолчанию обе панели свёрнуты; не держим обе открытыми одновременно. */
export const REPORT_LAYOUT_NARROW_MAX_PX = 1100;

const STORAGE_KEY = "sip-hd-reports-layout-v1";

/** Ширина колонок в px (совпадают с CSS-переменными). */
export const REPORT_LEFT_PANEL_OPEN_PX = 288;
export const REPORT_RIGHT_PANEL_OPEN_PX = 304;
export const REPORT_SIDE_RAIL_PX = 48;

function defaultPanelsForWidth(innerWidth: number): { leftCollapsed: boolean; rightCollapsed: boolean } {
  return {
    leftCollapsed: innerWidth < REPORT_LAYOUT_NARROW_MAX_PX,
    rightCollapsed: innerWidth < REPORT_LAYOUT_WIDE_MIN_PX,
  };
}

interface ReportsLayoutState {
  readonly leftCollapsed: boolean;
  readonly rightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
}

export const useReportsLayoutStore = create<ReportsLayoutState>()(
  persist(
    (set) => ({
      ...defaultPanelsForWidth(typeof window !== "undefined" ? window.innerWidth : REPORT_LAYOUT_WIDE_MIN_PX),
      toggleLeft: () =>
        set((s) => {
          const opening = s.leftCollapsed;
          const w = typeof window !== "undefined" ? window.innerWidth : REPORT_LAYOUT_WIDE_MIN_PX;
          if (opening && w < REPORT_LAYOUT_NARROW_MAX_PX && !s.rightCollapsed) {
            return { leftCollapsed: false, rightCollapsed: true };
          }
          return { leftCollapsed: !s.leftCollapsed };
        }),
      toggleRight: () =>
        set((s) => {
          const opening = s.rightCollapsed;
          const w = typeof window !== "undefined" ? window.innerWidth : REPORT_LAYOUT_WIDE_MIN_PX;
          if (opening && w < REPORT_LAYOUT_NARROW_MAX_PX && !s.leftCollapsed) {
            return { rightCollapsed: false, leftCollapsed: true };
          }
          return { rightCollapsed: !s.rightCollapsed };
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ leftCollapsed: s.leftCollapsed, rightCollapsed: s.rightCollapsed }),
    },
  ),
);

/** Если окно стало очень узким, не оставляем обе панели развёрнутыми — приоритет у превью. */
export function collapseOnePanelIfBothOpenNarrow(): void {
  const w = typeof window !== "undefined" ? window.innerWidth : REPORT_LAYOUT_WIDE_MIN_PX;
  if (w >= REPORT_LAYOUT_NARROW_MAX_PX) {
    return;
  }
  const { leftCollapsed, rightCollapsed } = useReportsLayoutStore.getState();
  if (!leftCollapsed && !rightCollapsed) {
    useReportsLayoutStore.setState({ rightCollapsed: true });
  }
}
