import { CloudUpload, FolderOpen, LogOut, Menu, Redo2, Save, Undo2, Users } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { signOutEverywhere } from "@/features/auth/authActions";
import { useAuth } from "@/features/auth/AuthProvider";
import { canEditCloudProjects } from "@/features/company/companyTeamService";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";
  const { user, profile, isAuthenticated, activeCompanyMember } = useAuth();
  const showWorkspaceNav = isAuthenticated && !isDemo;
  const canCloudPersist = canEditCloudProjects(activeCompanyMember?.role);
  const name = useAppStore((s) => s.currentProject.meta.name);
  const dirty = useAppStore((s) => s.dirty);
  const cloudWorkspace = useAppStore((s) => s.cloudWorkspace);
  const cloudManualSavePhase = useAppStore((s) => s.cloudManualSavePhase);
  const cloudSaveError = useAppStore((s) => s.cloudSaveError);
  const canUndo = useAppStore((s) => s.history.past.length > 0);
  const canRedo = useAppStore((s) => s.history.future.length > 0);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const openMobileSheet = useAppStore((s) => s.openMobileSheet);

  const effectiveUid = user?.uid ?? profile?.id ?? null;
  const saveFileLabel = cloudWorkspace ? "Сохранить файл" : "Сохранить";

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

  const companyIdForCloud = profile?.activeCompanyId ?? null;
  const canShowCloudControls = isAuthenticated && !isDemo && !!companyIdForCloud;
  const isViewerRole = canShowCloudControls && activeCompanyMember?.role === "viewer";

  const onCloudSave = () => {
    if (!effectiveUid || !canCloudPersist || !companyIdForCloud) {
      return;
    }
    if (cloudWorkspace) {
      void useAppStore.getState().saveCurrentProjectToCloud(effectiveUid, companyIdForCloud);
      return;
    }
    useAppStore.getState().openCloudExportModal();
  };

  const onLogout = () => {
    void signOutEverywhere().then(() => navigate("/"));
  };

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
        <Link className="tb-mobile-icon-btn" to="/app/projects" aria-label="Проекты" title="Проекты">
          <LucideToolIcon icon={FolderOpen} className="tb-keys-icon" />
        </Link>
        {showWorkspaceNav ? (
          <Link className="tb-mobile-icon-btn" to="/app/team" aria-label="Команда" title="Команда">
            <LucideToolIcon icon={Users} className="tb-keys-icon" />
          </Link>
        ) : null}
        {showWorkspaceNav ? (
          <button type="button" className="tb-mobile-icon-btn" aria-label="Выйти" title="Выйти" onClick={onLogout}>
            <LucideToolIcon icon={LogOut} className="tb-keys-icon" />
          </button>
        ) : null}
        <div className="tb-mobile-title" title={`${APP_NAME} — ${name}`}>
          <span className="tb-mobile-brand">{APP_NAME}</span>
          <span className="tb-mobile-project">
            {name}
            {dirty ? " *" : ""}
          </span>
          {isViewerRole ? <span className="tb-readonly-badge">Только просмотр</span> : null}
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
          {canShowCloudControls && effectiveUid ? (
            <button
              type="button"
              className="tb-mobile-icon-btn"
              title={
                !canCloudPersist
                  ? "У вас роль просмотра. Сохранение недоступно."
                  : cloudWorkspace
                    ? "Сохранить в облако"
                    : "Сохранить локальный проект в облако"
              }
              aria-label={cloudWorkspace ? "Сохранить в облако" : "Сохранить локальный проект в облако"}
              disabled={!canCloudPersist}
              onClick={onCloudSave}
            >
              <LucideToolIcon icon={CloudUpload} className="tb-keys-icon" />
            </button>
          ) : null}
          <button
            type="button"
            className="tb-mobile-icon-btn tb-mobile-icon-btn--accent"
            title={saveFileLabel}
            aria-label={saveFileLabel}
            onClick={() => void projectCommands.save()}
          >
            <LucideToolIcon icon={Save} className="tb-keys-icon" />
          </button>
        </div>
      </div>
      {canShowCloudControls ? (
        cloudWorkspace && cloudStatusText ? (
          <div
            className={
              cloudManualSavePhase === "error"
                ? "tb-mobile-cloud-status tb-mobile-cloud-status--error"
                : "tb-mobile-cloud-status"
            }
            aria-live="polite"
            title={cloudManualSavePhase === "error" && cloudSaveError ? cloudSaveError : undefined}
          >
            {cloudStatusText}
          </div>
        ) : (
          <div className="tb-mobile-cloud-status" aria-live="polite">
            Локальный проект · не сохранён в облаке
          </div>
        )
      ) : null}
    </header>
  );
}
