import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { initProjectPersistence, setCloudHydrating } from "@/data/projectPersistence";
import { useAuth } from "@/features/auth/AuthProvider";
import { EditorCloudAuthBanner } from "@/features/auth/EditorCloudAuthBanner";
import { EditorNoCompanyBanner } from "@/features/auth/EditorNoCompanyBanner";
import { EditorReadOnlyBanner } from "@/features/auth/EditorReadOnlyBanner";
import { canEditCloudProjects } from "@/features/company/companyTeamService";
import { EditorCloudExportModal } from "@/features/workspace/EditorCloudExportModal";
import { loadProject } from "@/features/workspace/projectCloudService";
import { projectCommands } from "@/features/project/commands";
import { AppShell } from "@/features/ui/AppShell";
import { ThemeRoot } from "@/features/ui/ThemeRoot";
import { useAppStore } from "@/store/useAppStore";

import "./editorCloudLoader.css";

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
function useDemoQueryBootstrap(isDemo: boolean) {
  useEffect(() => {
    if (!isDemo) {
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
  }, [isDemo]);
}

export function EditorAppView() {
  const navigate = useNavigate();
  const { status: authStatus, isAuthenticated, profile, user, activeCompanyMember } = useAuth();
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";
  const projectId = searchParams.get("projectId");
  const persistenceReady = useAppStore((s) => s.persistenceReady);
  const userId = user?.uid ?? profile?.id ?? null;
  const canSave = canEditCloudProjects(activeCompanyMember?.role);

  const [cloudLoadPhase, setCloudLoadPhase] = useState<"idle" | "loading" | "error">("idle");
  const [cloudLoadError, setCloudLoadError] = useState<string | null>(null);
  const initRan = useRef(false);

  const showCloudAuthHint = authStatus === "ready" && !isDemo && !isAuthenticated;
  const showNoCompanyBanner = authStatus === "ready" && !isDemo && isAuthenticated && !profile?.activeCompanyId;
  const showReadOnlyBanner =
    authStatus === "ready"
    && !isDemo
    && isAuthenticated
    && !!profile?.activeCompanyId
    && !!projectId
    && activeCompanyMember?.role === "viewer";

  useEffect(() => {
    document.title = EDITOR_TITLE;
  }, []);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }
    if (initRan.current) {
      return;
    }
    initRan.current = true;
    if (isDemo) {
      void initProjectPersistence({ skipHydrate: true });
      return;
    }
    if (projectId && isAuthenticated) {
      void initProjectPersistence({ skipHydrate: true });
      return;
    }
    void initProjectPersistence();
  }, [authStatus, isDemo, projectId, isAuthenticated]);

  const cloudLoadKey = `${projectId ?? ""}|${profile?.activeCompanyId ?? ""}|${userId ?? ""}`;

  useEffect(() => {
    if (!persistenceReady || isDemo || !projectId || !isAuthenticated) {
      return;
    }
    const companyId = profile?.activeCompanyId;
    if (!companyId) {
      setCloudLoadPhase("error");
      setCloudLoadError("Не выбрана активная компания.");
      return;
    }
    if (!userId) {
      setCloudLoadPhase("error");
      setCloudLoadError("Сессия не готова, попробуйте обновить страницу.");
      return;
    }

    // Уже открыт нужный облачный проект (например, после "Сохранить локально → в облако"
    // и replaceState на /app?projectId=newId) — повторно не грузим из Firestore.
    const existing = useAppStore.getState().cloudWorkspace;
    if (existing && existing.companyId === companyId && existing.projectId === projectId) {
      setCloudLoadPhase("idle");
      return;
    }

    let cancelled = false;
    setCloudLoadPhase("loading");
    setCloudLoadError(null);
    setCloudHydrating(true);

    void (async () => {
      try {
        const { project, meta } = await loadProject(companyId, projectId, companyId);
        if (cancelled) {
          return;
        }
        if (meta.id !== projectId || meta.companyId !== companyId) {
          throw new Error("Проект не найден или у вас нет доступа.");
        }
        useAppStore.getState().applyCloudLoadedProject(project, {
          companyId,
          projectId: meta.id,
          userId,
          canSave,
        });
        setCloudLoadPhase("idle");
      } catch (e) {
        if (cancelled) {
          return;
        }
        setCloudLoadPhase("error");
        setCloudLoadError(
          e instanceof Error
            ? e.message.includes("не найден") || e.message.includes("доступ")
              ? "Проект не найден или у вас нет доступа."
              : e.message
            : "Не удалось загрузить проект.",
        );
      } finally {
        if (!cancelled) {
          queueMicrotask(() => setCloudHydrating(false));
        } else {
          setCloudHydrating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setCloudHydrating(false);
    };
  }, [persistenceReady, isDemo, projectId, isAuthenticated, profile?.activeCompanyId, userId, canSave, cloudLoadKey]);

  useDemoQueryBootstrap(isDemo);

  const showCloudLoader = projectId && isAuthenticated && !isDemo && cloudLoadPhase === "loading";
  const showCloudError = projectId && isAuthenticated && !isDemo && cloudLoadPhase === "error";

  return (
    <>
      {showCloudAuthHint ? <EditorCloudAuthBanner /> : null}
      {showNoCompanyBanner ? <EditorNoCompanyBanner /> : null}
      {showReadOnlyBanner ? <EditorReadOnlyBanner /> : null}
      {showCloudLoader ? (
        <div className="editor-cloud-loader" role="status" aria-live="polite">
          Загружаем проект…
        </div>
      ) : null}
      {showCloudError ? (
        <div className="editor-cloud-loader" role="alert">
          <div className="editor-cloud-loader-error">
            <p style={{ margin: "0 0 12px" }}>{cloudLoadError ?? "Ошибка загрузки."}</p>
            <button type="button" className="btn" onClick={() => navigate("/app/projects")}>
              К проектам
            </button>
          </div>
        </div>
      ) : null}
      <ThemeRoot>
        <AppShell />
      </ThemeRoot>
      <ErrorBanner />
      <InfoBanner />
      <EditorCloudExportModal />
    </>
  );
}
