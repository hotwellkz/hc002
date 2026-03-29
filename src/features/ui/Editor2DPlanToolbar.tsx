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

export function Editor2DPlanToolbar() {
  const open = useAppStore((s) => s.openAddWallModal);

  return (
    <div className="e2dpt" role="toolbar" aria-label="Построение плана">
      <button
        type="button"
        className="e2dpt-btn"
        title="Добавить стену"
        aria-label="Добавить стену"
        onClick={() => open()}
      >
        <IconWallAdd />
      </button>
    </div>
  );
}
