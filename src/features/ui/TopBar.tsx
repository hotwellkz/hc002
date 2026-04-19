import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Keyboard, List, MoreHorizontal, Redo2, Save, Undo2 } from "lucide-react";

import { useAuth } from "@/features/auth/AuthProvider";
import { Editor2DScopeToolbar } from "@/features/ui/Editor2DScopeToolbar";
import { Editor3DToolbar } from "@/features/ui/Editor3DToolbar";
import { LayerToolbar } from "@/features/ui/LayerToolbar";
import { ThemeMenu } from "@/features/ui/ThemeMenu";
import { TopBarMobile } from "@/features/ui/TopBarMobile";
import { WorkspaceModeTabs } from "@/features/ui/WorkspaceModeTabs";
import { projectCommands } from "@/features/project/commands";
import { APP_NAME } from "@/shared/constants";
import { computeAnchoredPopoverPosition } from "@/shared/ui/computeAnchoredPopoverPosition";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useMobileLayout } from "@/shared/hooks/useMobileLayout";
import { useAppStore } from "@/store/useAppStore";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";

import "./top-bar.css";

type TopBarMode = "wide" | "comfortable" | "medium" | "narrow" | "compact";

type OverflowAction = {
  id: string;
  label: string;
  onClick: () => void;
};

/**
 * Desktop-first: при сужении окна поэтапно ужимаем отступы → прячем вторичные действия в «Ещё» →
 * скролл центральной колонки (CSS) — без наложения блоков.
 */
function getTopBarMode(width: number): TopBarMode {
  if (width < 920) {
    return "compact";
  }
  if (width < 1140) {
    return "narrow";
  }
  if (width < 1320) {
    return "medium";
  }
  if (width < 1520) {
    return "comfortable";
  }
  return "wide";
}

function TopBarOverflowMenu({
  open,
  onOpenChange,
  actions,
}: {
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
  readonly actions: OverflowAction[];
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const reposition = useCallback(() => {
    const btn = triggerRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) {
      return;
    }
    const anchor = btn.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    setPos(computeAnchoredPopoverPosition(anchor, w, h, window.innerWidth, window.innerHeight));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    reposition();
  }, [open, reposition, actions.length]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const menu = menuRef.current;
    const ro = menu ? new ResizeObserver(() => reposition()) : null;
    if (menu && ro) {
      ro.observe(menu);
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <div className="tb-overflow-wrap">
        <button
          ref={triggerRef}
          type="button"
          className="tb-overflow-trigger"
          title="Ещё"
          aria-label="Ещё"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <LucideToolIcon icon={MoreHorizontal} className="tb-overflow-icon" />
        </button>
      </div>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="tb-overflow-popover tb-overflow-popover--portal"
              style={{ left: pos.left, top: pos.top }}
              role="menu"
              aria-label="Дополнительные действия"
            >
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className="tb-overflow-item"
                  onClick={() => {
                    action.onClick();
                    onOpenChange(false);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function TopBar() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const cloudWorkspace = useAppStore((s) => s.cloudWorkspace);
  const cloudManualSavePhase = useAppStore((s) => s.cloudManualSavePhase);
  const isMobile = useMobileLayout();
  if (isMobile) {
    return <TopBarMobile />;
  }

  const name = useAppStore((s) => s.currentProject.meta.name);
  const dirty = useAppStore((s) => s.dirty);
  const activeTab = useAppStore((s) => s.activeTab);
  const openProfiles = useAppStore((s) => s.openProfilesModal);
  const openHotkeys = useEditorShortcutsStore((s) => s.openShortcutsSettings);
  const canUndo = useAppStore((s) => s.history.past.length > 0);
  const canRedo = useAppStore((s) => s.history.future.length > 0);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const [mode, setMode] = useState<TopBarMode>(() =>
    typeof window === "undefined" ? "wide" : getTopBarMode(window.innerWidth),
  );
  const [overflowOpen, setOverflowOpen] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setMode((prev) => {
          const next = getTopBarMode(window.innerWidth);
          return prev === next ? prev : next;
        });
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const effectiveUid = user?.uid ?? profile?.id ?? null;

  const cloudStatusText = (() => {
    if (!cloudWorkspace) {
      return null;
    }
    if (cloudManualSavePhase === "saving") {
      return "Сохраняем…";
    }
    if (cloudManualSavePhase === "error") {
      return "Ошибка сохранения";
    }
    if (dirty) {
      return "Есть несохранённые изменения";
    }
    return "Сохранено";
  })();

  const onCloudSave = () => {
    if (!effectiveUid) {
      return;
    }
    void useAppStore.getState().saveCurrentProjectToCloud(effectiveUid, profile?.activeCompanyId ?? null);
  };

  const saveFileLabel = cloudWorkspace ? "Сохранить файл" : "Сохранить…";

  const overflowActions: OverflowAction[] = [];
  if (mode === "medium" || mode === "narrow" || mode === "compact") {
    overflowActions.push({
      id: "projects",
      label: "Проекты",
      onClick: () => navigate("/app/projects"),
    });
    overflowActions.push({
      id: "new",
      label: "Новый",
      onClick: () => projectCommands.createNew(),
    });
    overflowActions.push({
      id: "open",
      label: "Открыть…",
      onClick: () => void projectCommands.open(),
    });
    overflowActions.push({
      id: "demo",
      label: "Демо",
      onClick: () => projectCommands.bootstrapDemo(),
    });
    if (cloudWorkspace && effectiveUid) {
      overflowActions.push({
        id: "cloudSave",
        label: "Сохранить в облако",
        onClick: onCloudSave,
      });
    }
  }
  if (mode === "compact") {
    overflowActions.push({
      id: "hotkeys",
      label: "Горячие клавиши",
      onClick: () => openHotkeys(),
    });
    overflowActions.push({
      id: "profiles",
      label: "Профили",
      onClick: () => openProfiles(),
    });
  }
  const showOverflow = overflowActions.length > 0;
  const showLayerToolbar = mode === "wide" || mode === "comfortable" || mode === "medium";
  const showTextFileButtons = mode === "wide" || mode === "comfortable";
  const saveAsIconOnly = mode === "compact";
  const showHotkeysAndProfiles = mode !== "compact";
  const showCloudExtras = mode === "wide" || mode === "comfortable";

  return (
    <header className="shell-top shell-top--with-mode-tabs" data-topbar-mode={mode}>
      <div className="shell-top-main">
      <div className="shell-top-left row tb-group tb-group--left">
        <strong>{APP_NAME}</strong>
        <span className="muted">·</span>
        <span className="tb-project-name">
          {name}
          {dirty ? " *" : ""}
        </span>
      </div>
      <div className="shell-top-center shell-top-tools tb-group tb-group--center">
        {activeTab === "2d" ? (
          <>
            <Editor2DScopeToolbar />
            {showLayerToolbar ? <LayerToolbar /> : null}
          </>
        ) : activeTab === "3d" ? (
          <Editor3DToolbar />
        ) : null}
      </div>
      <div className="shell-top-right row tb-group tb-group--right">
        {showCloudExtras ? (
          <Link className="btn tb-cloud-link" to="/app/projects">
            Проекты
          </Link>
        ) : null}
        {showCloudExtras && cloudWorkspace && cloudStatusText ? (
          <span className="tb-cloud-status" title={cloudStatusText}>
            {cloudStatusText}
          </span>
        ) : null}
        {showCloudExtras && cloudWorkspace && effectiveUid ? (
          <button type="button" className="btn tb-cloud-save" onClick={onCloudSave}>
            Сохранить в облако
          </button>
        ) : null}
        <button
          type="button"
          className="tb-prof-btn"
          title="Отменить (Cmd+Z / Ctrl+Z)"
          aria-label="Отменить"
          disabled={!canUndo}
          onClick={() => undo()}
        >
          <LucideToolIcon icon={Undo2} className="tb-keys-icon" />
        </button>
        <button
          type="button"
          className="tb-prof-btn"
          title="Повторить (Cmd+Shift+Z / Ctrl+Y / Ctrl+Shift+Z)"
          aria-label="Повторить"
          disabled={!canRedo}
          onClick={() => redo()}
        >
          <LucideToolIcon icon={Redo2} className="tb-keys-icon" />
        </button>
        {showHotkeysAndProfiles ? (
          <button
            type="button"
            className="tb-prof-btn"
            title="Горячие клавиши"
            aria-label="Горячие клавиши"
            onClick={() => openHotkeys()}
          >
            <LucideToolIcon icon={Keyboard} className="tb-keys-icon" />
          </button>
        ) : null}
        <ThemeMenu />
        {showHotkeysAndProfiles ? (
          <button
            type="button"
            className="tb-prof-btn"
            title="Профили"
            aria-label="Профили"
            onClick={() => openProfiles()}
          >
            <LucideToolIcon icon={List} className="tb-prof-icon" />
          </button>
        ) : null}
        {showTextFileButtons ? (
          <>
            <button type="button" className="btn" onClick={() => projectCommands.createNew()}>
              Новый
            </button>
            <button type="button" className="btn" onClick={() => void projectCommands.open()}>
              Открыть…
            </button>
          </>
        ) : null}
        {saveAsIconOnly ? (
          <button
            type="button"
            className="tb-prof-btn"
            title={saveFileLabel}
            aria-label={saveFileLabel}
            onClick={() => void projectCommands.save()}
          >
            <LucideToolIcon icon={Save} className="tb-keys-icon" />
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => void projectCommands.save()}>
            {saveFileLabel}
          </button>
        )}
        {showTextFileButtons ? (
          <button type="button" className="btn" onClick={() => projectCommands.bootstrapDemo()}>
            Демо
          </button>
        ) : null}
        {showOverflow ? (
          <TopBarOverflowMenu open={overflowOpen} onOpenChange={setOverflowOpen} actions={overflowActions} />
        ) : null}
      </div>
      </div>
      <WorkspaceModeTabs />
    </header>
  );
}
