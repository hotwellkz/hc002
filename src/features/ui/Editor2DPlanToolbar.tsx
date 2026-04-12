import { AppWindow, Calculator, Crosshair, DoorOpen, GitBranch, House, LocateFixed, Move } from "lucide-react";

import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./editor2d-plan-toolbar.css";

export function Editor2DPlanToolbar() {
  const open = useAppStore((s) => s.openAddWallModal);
  const openWindow = useAppStore((s) => s.openAddWindowModal);
  const openJoint = useAppStore((s) => s.openWallJointParamsModal);
  const openDoor = useAppStore((s) => s.openAddDoorModal);
  const openCalc = useAppStore((s) => s.openWallCalculationModal);
  const wallToolActive = useAppStore((s) => s.wallPlacementSession != null);
  const anchorMode = useAppStore((s) => s.wallAnchorPlacementModeActive);
  const toggleAnchorMode = useAppStore((s) => s.toggleWallAnchorPlacementMode);
  const jointModalOpen = useAppStore((s) => s.wallJointParamsModalOpen);
  const jointSession = useAppStore((s) => s.wallJointSession);
  const selectedWallCount = useAppStore((s) => {
    const sel = new Set(s.selectedEntityIds);
    return s.currentProject.walls.filter((w) => sel.has(w.id)).length;
  });
  const selectedOpeningCount = useAppStore((s) => {
    const sel = new Set(s.selectedEntityIds);
    return s.currentProject.openings.filter((o) => sel.has(o.id) && (o.kind === "window" || o.kind === "door")).length;
  });
  const openingMoveModeActive = useAppStore((s) => s.openingMoveModeActive);
  const toggleOpeningMoveMode = useAppStore((s) => s.toggleOpeningMoveMode);
  const projectOriginMoveToolActive = useAppStore((s) => s.projectOriginMoveToolActive);
  const toggleProjectOriginMoveTool = useAppStore((s) => s.toggleProjectOriginMoveTool);

  return (
    <div className="e2dpt" role="toolbar" aria-label="Построение плана">
      <button
        type="button"
        className="e2dpt-btn"
        title={wallToolActive ? "Параметры стены (добавить ещё)" : "Добавить стену"}
        aria-label={wallToolActive ? "Параметры стены" : "Добавить стену"}
        aria-pressed={wallToolActive}
        data-active={wallToolActive}
        onClick={() => open()}
      >
        <LucideToolIcon icon={House} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={
          !wallToolActive
            ? "Сначала включите «Добавить стену»"
            : anchorMode
              ? "Выключить точку привязки"
              : "Точка привязки — опорная точка и смещение начала стены"
        }
        aria-label="Точка привязки"
        aria-pressed={anchorMode}
        data-active={anchorMode}
        disabled={!wallToolActive}
        onClick={() => toggleAnchorMode()}
      >
        <LucideToolIcon icon={Crosshair} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title="Добавить окно"
        aria-label="Добавить окно"
        onClick={() => openWindow()}
      >
        <LucideToolIcon icon={AppWindow} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title="Добавить дверь"
        aria-label="Добавить дверь"
        onClick={() => openDoor()}
      >
        <LucideToolIcon icon={DoorOpen} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title="Угловое соединение"
        aria-label="Угловое соединение"
        aria-pressed={jointModalOpen || jointSession != null}
        data-active={jointModalOpen || jointSession != null}
        onClick={() => openJoint()}
      >
        <LucideToolIcon icon={GitBranch} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={selectedOpeningCount === 1 ? "Переместить" : "Выберите одно окно или дверь"}
        aria-label="Переместить"
        aria-pressed={openingMoveModeActive}
        data-active={openingMoveModeActive}
        disabled={selectedOpeningCount !== 1}
        onClick={() => toggleOpeningMoveMode()}
      >
        <LucideToolIcon icon={Move} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title="Перенести базу плана (0,0) — клик на плане или Пробел для ввода координат"
        aria-label="Базовая точка плана"
        aria-pressed={projectOriginMoveToolActive}
        data-active={projectOriginMoveToolActive}
        onClick={() => toggleProjectOriginMoveTool()}
      >
        <LucideToolIcon icon={LocateFixed} className="e2dpt-icon" />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={selectedWallCount === 0 ? "Выберите стену" : "Рассчитать"}
        aria-label="Рассчитать"
        disabled={selectedWallCount === 0}
        onClick={() => openCalc()}
      >
        <LucideToolIcon icon={Calculator} className="e2dpt-icon" />
      </button>
    </div>
  );
}
