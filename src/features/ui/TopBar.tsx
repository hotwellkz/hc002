import { useEffect, useRef, useState } from "react";

import { Editor2DPlanToolbar } from "@/features/ui/Editor2DPlanToolbar";
import { LayerToolbar } from "@/features/ui/LayerToolbar";
import { ThemeMenu } from "@/features/ui/ThemeMenu";
import { projectCommands } from "@/features/project/commands";
import { APP_NAME } from "@/shared/constants";
import { useAppStore } from "@/store/useAppStore";

import "./top-bar.css";

type TopBarMode = "wide" | "medium" | "narrow";

type OverflowAction = {
  id: string;
  label: string;
  onClick: () => void;
};

function getTopBarMode(width: number): TopBarMode {
  if (width < 1220) {
    return "narrow";
  }
  if (width < 1480) {
    return "medium";
  }
  return "wide";
}

function IconProfiles() {
  return (
    <svg className="tb-prof-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
        opacity="0.45"
      />
      <path fill="currentColor" d="M4 4h16v3H4V4zm0 6.5h16v3H4v-3zm0 6.5h16v3H4v-3z" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg className="tb-overflow-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="18" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function TopBar() {
  const name = useAppStore((s) => s.currentProject.meta.name);
  const dirty = useAppStore((s) => s.dirty);
  const activeTab = useAppStore((s) => s.activeTab);
  const openProfiles = useAppStore((s) => s.openProfilesModal);
  const [mode, setMode] = useState<TopBarMode>(() =>
    typeof window === "undefined" ? "wide" : getTopBarMode(window.innerWidth),
  );
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!overflowOpen) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

  const overflowActions: OverflowAction[] = [];
  if (mode !== "wide") {
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
  }
  if (mode === "medium") {
    overflowActions.push({
      id: "demo",
      label: "Демо",
      onClick: () => projectCommands.bootstrapDemo(),
    });
  }
  if (mode === "narrow") {
    overflowActions.push({
      id: "demo",
      label: "Демо",
      onClick: () => projectCommands.bootstrapDemo(),
    });
  }
  const showOverflow = overflowActions.length > 0;

  return (
    <header className="shell-top" data-topbar-mode={mode}>
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
            <Editor2DPlanToolbar />
            {mode !== "narrow" ? <LayerToolbar /> : null}
          </>
        ) : null}
      </div>
      <div className="shell-top-right row tb-group tb-group--right">
        <ThemeMenu />
        <button
          type="button"
          className="tb-prof-btn"
          title="Профили"
          aria-label="Профили"
          onClick={() => openProfiles()}
        >
          <IconProfiles />
        </button>
        {mode === "wide" ? (
          <>
            <button type="button" className="btn" onClick={() => projectCommands.createNew()}>
              Новый
            </button>
            <button type="button" className="btn" onClick={() => void projectCommands.open()}>
              Открыть…
            </button>
          </>
        ) : null}
        <button type="button" className="btn" onClick={() => void projectCommands.save()}>
          Сохранить…
        </button>
        {mode === "wide" ? (
          <button type="button" className="btn" onClick={() => projectCommands.bootstrapDemo()}>
            Демо
          </button>
        ) : null}
        {showOverflow ? (
          <div className="tb-overflow-wrap" ref={overflowRef}>
            <button
              type="button"
              className="tb-overflow-trigger"
              title="Ещё"
              aria-label="Ещё"
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((v) => !v)}
            >
              <IconMore />
            </button>
            {overflowOpen ? (
              <div className="tb-overflow-popover" role="menu" aria-label="Дополнительные действия">
                {overflowActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    className="tb-overflow-item"
                    onClick={() => {
                      action.onClick();
                      setOverflowOpen(false);
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
