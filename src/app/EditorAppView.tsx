import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import { initProjectPersistence } from "@/data/projectPersistence";
import { projectCommands } from "@/features/project/commands";
import { AppShell } from "@/features/ui/AppShell";
import { ThemeRoot } from "@/features/ui/ThemeRoot";
import { useAppStore } from "@/store/useAppStore";

const EDITOR_TITLE = "HouseKit Pro — редактор";

function ErrorBanner() {
  const err = useAppStore((s) => s.lastError);
  const clear = useCallback(() => {
    useAppStore.setState({ lastError: null });
  }, []);

  if (!err) {
    return null;
  }

  return (
    <div className="ui-error-banner">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>{err}</span>
        <button type="button" className="btn" onClick={clear}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

function InfoBanner() {
  const info = useAppStore((s) => s.infoMessage);
  const clear = useCallback(() => {
    useAppStore.setState({ infoMessage: null });
  }, []);

  useEffect(() => {
    if (!info) {
      return;
    }
    const t = window.setTimeout(() => clear(), 4500);
    return () => window.clearTimeout(t);
  }, [info, clear]);

  if (!info) {
    return null;
  }

  return (
    <div
      className="ui-info-banner"
      style={{ background: "var(--color-success-bg, #e8f5e9)", color: "var(--color-text, #111)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <span>{info}</span>
        <button type="button" className="btn" onClick={clear}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

/**
 * После гидрации персистентности подгружает демо-проект, если в URL есть ?demo=true
 * (маршрут /demo редиректит сюда).
 */
function useDemoQueryBootstrap() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("demo") !== "true") {
      return;
    }
    let ran = false;
    const run = () => {
      if (ran) {
        return;
      }
      if (!useAppStore.getState().persistenceReady) {
        return;
      }
      ran = true;
      projectCommands.bootstrapDemo();
    };
    run();
    const unsub = useAppStore.subscribe(run);
    return () => {
      ran = true;
      unsub();
    };
  }, [searchParams]);
}

export function EditorAppView() {
  useEffect(() => {
    void initProjectPersistence();
  }, []);

  useEffect(() => {
    document.title = EDITOR_TITLE;
  }, []);

  useDemoQueryBootstrap();

  return (
    <>
      <ThemeRoot>
        <AppShell />
      </ThemeRoot>
      <ErrorBanner />
      <InfoBanner />
    </>
  );
}
