import {
  Hand,
  MoreHorizontal,
  MousePointer2,
  PenLine,
  Ruler,
  SquarePen,
  StretchHorizontal,
  Trash2,
} from "lucide-react";

import { projectCommands } from "@/features/project/commands";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./editor2d-toolbar.css";
import "./editor2d-toolbar-mobile.css";

type ToolBtnProps = {
  readonly label: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly icon: typeof MousePointer2;
  readonly variant?: "danger";
};

function ToolBtn({ label, pressed, disabled, onClick, icon, variant }: ToolBtnProps) {
  return (
    <button
      type="button"
      className={`ed2d-toolbtn-mobile${variant === "danger" ? " ed2d-toolbtn-mobile--danger" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      data-active={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <LucideToolIcon icon={icon} className="ed2d-icon ed2d-icon--stroke" />
      <span className="ed2d-toolbtn-mobile__label">{label}</span>
    </button>
  );
}

/** Первичные инструменты в доке + «Ещё» открывает полный список в sheet (store mobileSheet editorTools). */
export function Editor2DToolbarMobile() {
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const openMobileSheet = useAppStore((s) => s.openMobileSheet);

  return (
    <div className="ed2d-toolbar ed2d-toolbar--mobile-quick" role="toolbar" aria-label="Инструменты 2D">
      <ToolBtn
        label="Выделение"
        pressed={activeTool === "select"}
        icon={MousePointer2}
        onClick={() => setActiveTool("select")}
      />
      <ToolBtn label="Панорама" pressed={activeTool === "pan"} icon={Hand} onClick={() => setActiveTool("pan")} />
      <ToolBtn label="Линейка" pressed={activeTool === "ruler"} icon={Ruler} onClick={() => setActiveTool("ruler")} />
      <button
        type="button"
        className="ed2d-toolbtn-mobile ed2d-toolbtn-mobile--more"
        title="Все инструменты"
        aria-label="Все инструменты"
        onClick={() => openMobileSheet("editorTools")}
      >
        <LucideToolIcon icon={MoreHorizontal} className="ed2d-icon ed2d-icon--stroke" />
        <span className="ed2d-toolbtn-mobile__label">Ещё</span>
      </button>
    </div>
  );
}

/** Полный список инструментов для bottom sheet. */
export function Editor2DToolbarMobileSheet() {
  const activeTool = useAppStore((s) => s.activeTool);
  const selectedCount = useAppStore((s) => s.selectedEntityIds.length);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const closeMobileSheet = useAppStore((s) => s.closeMobileSheet);

  const deleteDisabled = selectedCount === 0;
  const editDisabled = selectedCount !== 1;

  const pick = (tool: typeof activeTool) => {
    setActiveTool(tool);
    closeMobileSheet();
  };

  return (
    <div className="ed2d-toolbar-sheet" role="list">
      <ToolBtn
        label="Выделение"
        pressed={activeTool === "select"}
        icon={MousePointer2}
        onClick={() => pick("select")}
      />
      <ToolBtn label="Панорама" pressed={activeTool === "pan"} icon={Hand} onClick={() => pick("pan")} />
      <ToolBtn
        label="Длина"
        pressed={activeTool === "changeLength"}
        icon={StretchHorizontal}
        onClick={() => pick(activeTool === "changeLength" ? "select" : "changeLength")}
      />
      <ToolBtn label="Линейка" pressed={activeTool === "ruler"} icon={Ruler} onClick={() => pick("ruler")} />
      <ToolBtn label="Линия" pressed={activeTool === "line"} icon={PenLine} onClick={() => pick("line")} />
      <ToolBtn
        label="Редактировать"
        disabled={editDisabled}
        icon={SquarePen}
        onClick={() => {
          void projectCommands.openSelectedObjectEditor();
          closeMobileSheet();
        }}
      />
      <ToolBtn
        label="Удалить"
        variant="danger"
        disabled={deleteDisabled}
        icon={Trash2}
        onClick={() => {
          projectCommands.deleteSelected();
          closeMobileSheet();
        }}
      />
    </div>
  );
}
