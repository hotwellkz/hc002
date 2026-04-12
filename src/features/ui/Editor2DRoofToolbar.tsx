import { Link2, Mountain } from "lucide-react";

import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./editor2d-plan-toolbar.css";

/** Инструменты режима «Крыша» на 2D-плане. */
export function Editor2DRoofToolbar() {
  const openPlane = useAppStore((s) => s.openAddRoofPlaneModal);
  const startJoin = useAppStore((s) => s.startRoofContourJoinTool);
  const cancelJoin = useAppStore((s) => s.cancelRoofContourJoinTool);
  const planeToolActive = useAppStore((s) => s.roofPlanePlacementSession != null);
  const joinToolActive = useAppStore((s) => s.roofContourJoinSession != null);

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
    </div>
  );
}
