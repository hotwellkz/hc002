import { GripHorizontal, PanelTop, SquareSplitHorizontal } from "lucide-react";

import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./editor2d-plan-toolbar.css";

/** Инструменты режима «Перекрытие» на 2D-плане. */
export function Editor2DFloorStructureToolbar() {
  const openBeam = useAppStore((s) => s.openAddFloorBeamModal);
  const openSplit = useAppStore((s) => s.openFloorBeamSplitModal);
  const openSlab = useAppStore((s) => s.openAddSlabModal);
  const beamToolActive = useAppStore((s) => s.floorBeamPlacementSession != null);
  const slabToolActive = useAppStore((s) => s.slabPlacementSession != null);
  const splitModalOpen = useAppStore((s) => s.floorBeamSplitModalOpen);
  const splitAwaitingPick = useAppStore((s) => s.floorBeamSplitSession != null);

  return (
    <div className="e2dpt" role="toolbar" aria-label="Перекрытие">
      <button
        type="button"
        className="e2dpt-btn"
        title={beamToolActive ? "Параметры балки (добавить ещё)" : "Добавить балку"}
        aria-label={beamToolActive ? "Параметры балки" : "Добавить балку"}
        aria-pressed={beamToolActive}
        data-active={beamToolActive}
        onClick={() => openBeam()}
      >
        <LucideToolIcon icon={GripHorizontal} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={
          splitAwaitingPick
            ? "Разделить: клик по балке (ПКМ — отмена)"
            : splitModalOpen
              ? "Разделить (параметры открыты)"
              : "Разделить балку / профиль"
        }
        aria-label="Разделить"
        aria-pressed={splitModalOpen || splitAwaitingPick}
        data-active={splitModalOpen || splitAwaitingPick}
        onClick={() => openSplit()}
      >
        <LucideToolIcon icon={SquareSplitHorizontal} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={slabToolActive ? "Параметры плиты (добавить ещё)" : "Добавить плиту"}
        aria-label={slabToolActive ? "Параметры плиты" : "Добавить плиту"}
        aria-pressed={slabToolActive}
        data-active={slabToolActive}
        onClick={() => openSlab("overlap")}
      >
        <LucideToolIcon icon={PanelTop} className="e2dpt-icon" />
      </button>
    </div>
  );
}
