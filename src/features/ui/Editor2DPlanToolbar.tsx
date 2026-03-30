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
  const openCalc = useAppStore((s) => s.openWallCalculationModal);
  const wallToolActive = useAppStore((s) => s.wallPlacementSession != null);
  const jointModalOpen = useAppStore((s) => s.wallJointParamsModalOpen);
  const jointSession = useAppStore((s) => s.wallJointSession);
  const selectedWallCount = useAppStore((s) => {
    const sel = new Set(s.selectedEntityIds);
    return s.currentProject.walls.filter((w) => sel.has(w.id)).length;
  });

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
        title="Добавить окно"
        aria-label="Добавить окно"
        onClick={() => openWindow()}
      >
        <IconWindowAdd />
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
