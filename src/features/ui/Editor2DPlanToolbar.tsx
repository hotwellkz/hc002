import { useAppStore } from "@/store/useAppStore";

import "./editor2d-plan-toolbar.css";

function IconWallAdd() {
  return (
    <svg className="e2dpt-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 20V10l8-5 8 5v10h-2v-8.5l-6-3.75-6 3.75V20H4zm9 0v-4h-2v4h2zm4-7V6h2v7h-2zM4 8V4h2v4H4z"
      />
    </svg>
  );
}

function IconAnchorPoint() {
  return (
    <svg className="e2dpt-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M11 2h2v7h7v2h-7v7h-2v-7H4v-2h7V2z" opacity="0.45" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  );
}

function IconWindowAdd() {
  return (
    <svg className="e2dpt-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h8v2H4v-2z"
        opacity="0.35"
      />
      <path
        fill="currentColor"
        d="M13 11h8v11h-2v-4h-4v4h-2V11zm2 2v5h4v-5h-4z"
      />
    </svg>
  );
}

function IconDoorAdd() {
  return (
    <svg className="e2dpt-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M5 4h12a1 1 0 0 1 1 1v15h-2V6H7v14H5V4zm4 7h2v2H9v-2z" />
      <path fill="currentColor" d="M19 9h2v10h-2z" opacity="0.45" />
    </svg>
  );
}

function IconCalculate() {
  return (
    <svg className="e2dpt-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h2v2H7V7zm4 0h6v2h-6V7zM7 11h2v2H7v-2zm4 0h6v2h-6v-2zm-4 4h2v2H7v-2zm4 0h6v2h-6v-2z"
      />
    </svg>
  );
}

function IconMoveOpening() {
  return (
    <svg className="e2dpt-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 3l3 3h-2v4h-2V6H9l3-3zm0 18l-3-3h2v-4h2v4h2l-3 3zM3 12l3-3v2h4v2H6v2l-3-3zm18 0l-3 3v-2h-4v-2h4V9l3 3z" />
    </svg>
  );
}

function IconWallJoint() {
  return (
    <svg className="e2dpt-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 20h16v-2H4v2zm0-8h10v-2H4v2zm0-6h6V4H4v2z" opacity="0.35" />
      <path
        fill="currentColor"
        d="M18 4v10h-2V7.5L9.5 4H18zm-1.5 12c.8 0 1.5.7 1.5 1.5S17.3 19 16.5 19 15 18.3 15 17.5 15.7 16 16.5 16z"
      />
    </svg>
  );
}

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
        <IconWallAdd />
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
        <IconAnchorPoint />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title="Добавить окно"
        aria-label="Добавить окно"
        onClick={() => openWindow()}
      >
        <IconWindowAdd />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title="Добавить дверь"
        aria-label="Добавить дверь"
        onClick={() => openDoor()}
      >
        <IconDoorAdd />
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
        <IconWallJoint />
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
        <IconMoveOpening />
      </button>
      <button
        type="button"
        className="e2dpt-btn"
        title={selectedWallCount === 0 ? "Выберите стену" : "Рассчитать"}
        aria-label="Рассчитать"
        disabled={selectedWallCount === 0}
        onClick={() => openCalc()}
      >
        <IconCalculate />
      </button>
    </div>
  );
}
