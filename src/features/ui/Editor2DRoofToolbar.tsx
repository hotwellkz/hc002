import { Calculator, Link2, Mountain } from "lucide-react";

import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./editor2d-plan-toolbar.css";

/** Инструменты режима «Крыша» на 2D-плане. */
export function Editor2DRoofToolbar() {
  const openPlane = useAppStore((s) => s.openAddRoofPlaneModal);
  const openCalc = useAppStore((s) => s.openRoofCalculationModal);
  const startJoin = useAppStore((s) => s.startRoofContourJoinTool);
  const cancelJoin = useAppStore((s) => s.cancelRoofContourJoinTool);
  const planeToolActive =
    useAppStore((s) => s.roofPlanePlacementSession != null || s.roofSystemPlacementSession != null);
  const joinToolActive = useAppStore((s) => s.roofContourJoinSession != null);
  const selectedRoofCount = useAppStore((s) => {
    const sel = new Set(s.selectedEntityIds);
    return s.currentProject.roofPlanes.filter((r) => sel.has(r.id)).length;
  });

  return (
    <div className="e2dpt" role="toolbar" aria-label="Крыша">
      <button
        type="button"
        className="e2dpt-btn"
        title={planeToolActive ? "Параметры плоскости (добавить ещё)" : "Плоскость крыши"}
        aria-label={planeToolActive ? "Параметры плоскости крыши" : "Плоскость крыши"}
        aria-pressed={planeToolActive}
        data-active={planeToolActive}
        onClick={() => openPlane()}
      >
        <LucideToolIcon icon={Mountain} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={
          joinToolActive
            ? "Соединить контур (активно) — клик для отмены"
            : "Соединить контур скатов по линии стыка"
        }
        aria-label="Соединить контур"
        aria-pressed={joinToolActive}
        data-active={joinToolActive}
        onClick={() => (joinToolActive ? cancelJoin() : startJoin())}
      >
        <LucideToolIcon icon={Link2} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={selectedRoofCount === 0 ? "Выберите скаты для расчёта" : "Рассчитать крышу в 3D"}
        aria-label="Рассчитать"
        disabled={selectedRoofCount === 0}
        onClick={() => openCalc()}
      >
        <LucideToolIcon icon={Calculator} className="e2dpt-icon" />
      </button>
    </div>
  );
}
