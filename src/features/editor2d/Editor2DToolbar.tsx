import type { ReactNode } from "react";
import {
  Hand,
  MousePointer2,
  PenLine,
  Ruler,
  SquarePen,
  StretchHorizontal,
  Trash2,
} from "lucide-react";

import { Editor2DToolbarMobile } from "@/features/editor2d/Editor2DToolbarMobile";
import { projectCommands } from "@/features/project/commands";
import { useMobileLayout } from "@/shared/hooks/useMobileLayout";
import { formatShortcutCodesList } from "@/shared/editorToolShortcuts/formatShortcutLabel";
import { getResolvedShortcutCodes } from "@/shared/editorToolShortcuts/resolveEditorShortcutCodes";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";

import "./editor2d-toolbar.css";

function shortcutHint(id: Parameters<typeof getResolvedShortcutCodes>[0], custom: Parameters<typeof getResolvedShortcutCodes>[1]): string {
  const codes = getResolvedShortcutCodes(id, custom);
  if (codes.length === 0) {
    return "";
  }
  return ` (${formatShortcutCodesList(codes)})`;
}

function Kbd({ codes }: { readonly codes: readonly string[] }): ReactNode {
  if (codes.length === 0) {
    return null;
  }
  return <span className="ed2d-toolbtn__kbd">{formatShortcutCodesList(codes)}</span>;
}

export function Editor2DToolbar() {
  const isMobile = useMobileLayout();
  if (isMobile) {
    return <Editor2DToolbarMobile />;
  }

  const activeTool = useAppStore((s) => s.activeTool);
  const selectedCount = useAppStore((s) => s.selectedEntityIds.length);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const customCodes = useEditorShortcutsStore((s) => s.customCodes);

  const sk = (id: Parameters<typeof getResolvedShortcutCodes>[0]) => shortcutHint(id, customCodes);
  const escSk = formatShortcutCodesList(getResolvedShortcutCodes("editorReset", customCodes));

  const deleteDisabled = selectedCount === 0;
  const editDisabled = selectedCount !== 1;
  const editTitle =
    selectedCount === 0
      ? `Редактировать — сначала выберите объект${sk("editSelectedObject")}`
      : selectedCount > 1
        ? `Редактировать — только один объект${sk("editSelectedObject")}`
        : `Редактировать${sk("editSelectedObject")}`;

  return (
    <div className="ed2d-toolbar" role="toolbar" aria-label="Инструменты 2D плана">
      <button
        type="button"
        className="ed2d-toolbtn"
        title={`Выделение${sk("toolSelect")}`}
        aria-label={`Выделение${sk("toolSelect")}`}
        aria-pressed={activeTool === "select"}
        data-active={activeTool === "select"}
        onClick={() => setActiveTool("select")}
      >
        <LucideToolIcon icon={MousePointer2} className="ed2d-icon ed2d-icon--stroke" />
        <Kbd codes={getResolvedShortcutCodes("toolSelect", customCodes)} />
      </button>
      <button
        type="button"
        className="ed2d-toolbtn"
        title={`Панорама (перемещение вида)${sk("toolPan")}`}
        aria-label={`Панорама${sk("toolPan")}`}
        aria-pressed={activeTool === "pan"}
        data-active={activeTool === "pan"}
        onClick={() => setActiveTool("pan")}
      >
        <LucideToolIcon icon={Hand} className="ed2d-icon ed2d-icon--stroke" />
        <Kbd codes={getResolvedShortcutCodes("toolPan", customCodes)} />
      </button>
      <button
        type="button"
        className="ed2d-toolbtn"
        title={`Изменение длины${sk("toolChangeLengthToggle")}`}
        aria-label={`Изменение длины${sk("toolChangeLengthToggle")}`}
        aria-pressed={activeTool === "changeLength"}
        data-active={activeTool === "changeLength"}
        onClick={() => setActiveTool(activeTool === "changeLength" ? "select" : "changeLength")}
      >
        <LucideToolIcon icon={StretchHorizontal} className="ed2d-icon ed2d-icon--stroke" />
        <Kbd codes={getResolvedShortcutCodes("toolChangeLengthToggle", customCodes)} />
      </button>
      <button
        type="button"
        className="ed2d-toolbtn"
        title={`Линейка — замер расстояний (мм). ${escSk} — сброс`}
        aria-label={`Линейка${sk("toolRuler")}`}
        aria-pressed={activeTool === "ruler"}
        data-active={activeTool === "ruler"}
        onClick={() => setActiveTool("ruler")}
      >
        <LucideToolIcon icon={Ruler} className="ed2d-icon ed2d-icon--stroke" />
        <Kbd codes={getResolvedShortcutCodes("toolRuler", customCodes)} />
      </button>
      <button
        type="button"
        className="ed2d-toolbtn"
        title={`Линия — вспомогательный отрезок на плане${sk("toolLine")}`}
        aria-label={`Линия${sk("toolLine")}`}
        aria-pressed={activeTool === "line"}
        data-active={activeTool === "line"}
        onClick={() => setActiveTool("line")}
      >
        <LucideToolIcon icon={PenLine} className="ed2d-icon ed2d-icon--stroke" />
        <Kbd codes={getResolvedShortcutCodes("toolLine", customCodes)} />
      </button>
      <button
        type="button"
        className="ed2d-toolbtn"
        title={editTitle}
        aria-label={editTitle}
        disabled={editDisabled}
        onClick={() => projectCommands.openSelectedObjectEditor()}
      >
        <LucideToolIcon icon={SquarePen} className="ed2d-icon ed2d-icon--stroke" />
        <Kbd codes={getResolvedShortcutCodes("editSelectedObject", customCodes)} />
      </button>
      <button
        type="button"
        className="ed2d-toolbtn ed2d-toolbtn--danger"
        title={`Удалить${sk("deleteSelected")}`}
        aria-label={`Удалить${sk("deleteSelected")}`}
        disabled={deleteDisabled}
        onClick={() => projectCommands.deleteSelected()}
      >
        <LucideToolIcon icon={Trash2} className="ed2d-icon ed2d-icon--stroke" />
        <Kbd codes={getResolvedShortcutCodes("deleteSelected", customCodes)} />
      </button>
    </div>
  );
}
