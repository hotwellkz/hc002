import { Menu, Redo2, Save, Undo2 } from "lucide-react";

import { projectCommands } from "@/features/project/commands";
import { APP_NAME } from "@/shared/constants";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./top-bar.css";

/**
 * Компактная шапка для телефона: меню, проект, undo/redo/save.
 * Инструменты плана и тема — в мобильном меню (bottom sheet).
 */
export function TopBarMobile() {
  const name = useAppStore((s) => s.currentProject.meta.name);
  const dirty = useAppStore((s) => s.dirty);
  const canUndo = useAppStore((s) => s.history.past.length > 0);
  const canRedo = useAppStore((s) => s.history.future.length > 0);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const openMobileSheet = useAppStore((s) => s.openMobileSheet);

  return (
    <header className="shell-top shell-top--mobile">
      <div className="shell-top-mobile-row">
        <button
          type="button"
          className="tb-mobile-icon-btn"
          aria-label="Открыть меню"
          title="Меню"
          onClick={() => openMobileSheet("mainMenu")}
        >
          <LucideToolIcon icon={Menu} className="tb-keys-icon" />
        </button>
        <div className="tb-mobile-title" title={`${APP_NAME} — ${name}`}>
          <span className="tb-mobile-brand">{APP_NAME}</span>
          <span className="tb-mobile-project">
            {name}
            {dirty ? " *" : ""}
          </span>
        </div>
        <div className="tb-mobile-actions">
          <button
            type="button"
            className="tb-mobile-icon-btn"
            title="Отменить"
            aria-label="Отменить"
            disabled={!canUndo}
            onClick={() => undo()}
          >
            <LucideToolIcon icon={Undo2} className="tb-keys-icon" />
          </button>
          <button
            type="button"
            className="tb-mobile-icon-btn"
            title="Повторить"
            aria-label="Повторить"
            disabled={!canRedo}
            onClick={() => redo()}
          >
            <LucideToolIcon icon={Redo2} className="tb-keys-icon" />
          </button>
          <button
            type="button"
            className="tb-mobile-icon-btn tb-mobile-icon-btn--accent"
            title="Сохранить"
            aria-label="Сохранить"
            onClick={() => void projectCommands.save()}
          >
            <LucideToolIcon icon={Save} className="tb-keys-icon" />
          </button>
        </div>
      </div>
    </header>
  );
}
