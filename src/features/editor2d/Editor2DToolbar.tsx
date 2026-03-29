import { projectCommands } from "@/features/project/commands";
import { useAppStore } from "@/store/useAppStore";

import "./editor2d-toolbar.css";

function IconSelect() {
  return (
    <svg className="ed2d-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 3l12 9.5-5 .75L10.5 21 6 3zm2.2 3.4l3.8 8.1 1.65-4.4 3.2-.48L8.2 6.4z"
      />
    </svg>
  );
}

/** Панорамирование (четыре направления от центра). */
function IconPan() {
  return (
    <svg className="ed2d-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 4l2 3.5H10L12 4zm0 16l-2-3.5h4L12 20zM4 12l3.5-2v4L4 12zm16 0l-3.5 2v-4L20 12z"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="ed2d-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 3v1H4v2h1v13a2 2 0 002 2h10a2 2 0 002-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z"
      />
    </svg>
  );
}

export function Editor2DToolbar() {
  const activeTool = useAppStore((s) => s.activeTool);
  const selectedCount = useAppStore((s) => s.selectedEntityIds.length);
  const setActiveTool = useAppStore((s) => s.setActiveTool);

  const deleteDisabled = selectedCount === 0;

  return (
    <div className="ed2d-toolbar" role="toolbar" aria-label="Инструменты 2D плана">
      <button
        type="button"
        className="ed2d-toolbtn"
        title="Выделение"
        aria-label="Выделение"
        aria-pressed={activeTool === "select"}
        data-active={activeTool === "select"}
        onClick={() => setActiveTool("select")}
      >
        <IconSelect />
      </button>
      <button
        type="button"
        className="ed2d-toolbtn"
        title="Панорама"
        aria-label="Панорама"
        aria-pressed={activeTool === "pan"}
        data-active={activeTool === "pan"}
        onClick={() => setActiveTool("pan")}
      >
        <IconPan />
      </button>
      <button
        type="button"
        className="ed2d-toolbtn ed2d-toolbtn--danger"
        title="Удалить"
        aria-label="Удалить"
        disabled={deleteDisabled}
        onClick={() => projectCommands.deleteSelected()}
      >
        <IconTrash />
      </button>
    </div>
  );
}
