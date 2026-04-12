import { Cylinder, PanelTop, Rows3 } from "lucide-react";

import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./editor2d-plan-toolbar.css";

/** Инструменты режима «Фундамент» на 2D-плане. */
export function Editor2DFoundationToolbar() {
  const openFoundationStrip = useAppStore((s) => s.openAddFoundationStripModal);
  const openFoundationPile = useAppStore((s) => s.openAddFoundationPileModal);
  const openSlab = useAppStore((s) => s.openAddSlabModal);
  const foundationStripToolActive = useAppStore((s) => s.foundationStripPlacementSession != null);
  const foundationPileToolActive = useAppStore((s) => s.foundationPilePlacementSession != null);
  const slabToolActive = useAppStore((s) => s.slabPlacementSession != null);

  return (
    <div className="e2dpt" role="toolbar" aria-label="Фундамент">
      <button
        type="button"
        className="e2dpt-btn"
        title={
          foundationStripToolActive ? "Параметры ленты (добавить ещё)" : "Добавить ленту фундамента"
        }
        aria-label={foundationStripToolActive ? "Параметры ленты" : "Добавить ленту"}
        aria-pressed={foundationStripToolActive}
        data-active={foundationStripToolActive}
        onClick={() => openFoundationStrip()}
      >
        <LucideToolIcon icon={Rows3} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={foundationPileToolActive ? "Параметры сваи (добавить ещё)" : "Добавить сваю"}
        aria-label={foundationPileToolActive ? "Параметры сваи" : "Добавить сваю"}
        aria-pressed={foundationPileToolActive}
        data-active={foundationPileToolActive}
        onClick={() => openFoundationPile()}
      >
        <LucideToolIcon icon={Cylinder} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={slabToolActive ? "Параметры плиты (добавить ещё)" : "Добавить плиту"}
        aria-label={slabToolActive ? "Параметры плиты" : "Добавить плиту"}
        aria-pressed={slabToolActive}
        data-active={slabToolActive}
        onClick={() => openSlab("foundation")}
      >
        <LucideToolIcon icon={PanelTop} className="e2dpt-icon" />
      </button>
    </div>
  );
}
