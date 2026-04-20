import { type FormEvent, useCallback, useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { ProjectMeta } from "@/core/company/orgTypes";
import { useAuth } from "@/features/auth/AuthProvider";
import { canEditCloudProjects } from "@/features/company/companyTeamService";
import { AppWorkspaceNav } from "@/features/workspace/AppWorkspaceNav";
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject,
} from "@/features/workspace/projectCloudService";

import "./workspaceProjects.css";

function formatRuDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

function editorLabel(updatedBy: string, currentUserId: string | null): string {
  if (!currentUserId) {
    return updatedBy;
  }
  if (updatedBy === currentUserId) {
    return "Вы";
  }
  if (updatedBy.length <= 12) {
    return updatedBy;
  }
  return `${updatedBy.slice(0, 8)}…`;
}

export function WorkspaceProjectsPage() {
  const navigate = useNavigate();
  const modalTitleId = useId();
  const { profile, activeCompany, activeCompanyMember, isAuthenticated, status, user } = useAuth();

  const companyId = profile?.activeCompanyId ?? null;
  const userId = user?.uid ?? profile?.id ?? null;
  const companyName = activeCompany?.name ?? "—";
  const memberRole = activeCompanyMember?.role ?? null;
  const canCreateProject = canEditCloudProjects(memberRole ?? undefined);

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("Новый проект");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId || !isAuthenticated) {
      setProjects([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const rows = await listProjects(companyId, companyId);
      setProjects(rows);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Не удалось загрузить проекты.");
    } finally {
      setListLoading(false);
    }
  }, [companyId, isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = () => {
    setCreateName("Новый проект");
    setCreateError(null);
    setCreateOpen(true);
  };

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (createBusy) {
      return;
    }
    setCreateError(null);

    if (!isAuthenticated) {
      setCreateError("Войдите в аккаунт, чтобы создавать облачные проекты.");
      return;
    }
    if (!companyId) {
      setCreateError("Не найдено рабочее пространство. Обновите страницу или войдите заново.");
      return;
    }
    if (!userId) {
      setCreateError("Сессия не готова, попробуйте через несколько секунд.");
      return;
    }
    if (!canCreateProject) {
      setCreateError("У вашей роли нет прав на создание проектов.");
      return;
    }
    const trimmed = createName.trim() || "Новый проект";

    if (import.meta.env.DEV) {
      console.debug("[projects] create start", { companyId, userId, email: profile?.email, role: memberRole });
    }

    setCreateBusy(true);
    try {
      const meta = await createProject(companyId, userId, trimmed, companyId);
      if (import.meta.env.DEV) {
        console.debug("[projects] create success", meta.id);
      }
      setCreateOpen(false);
      navigate(`/app?projectId=${encodeURIComponent(meta.id)}`);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[projects] create failed", err);
      }
      setCreateError(err instanceof Error ? err.message : "Не удалось создать проект.");
    } finally {
      setCreateBusy(false);
    }
  };

  const openRename = (m: ProjectMeta) => {
    setRenameTarget(m);
    setRenameValue(m.name);
    setRenameOpen(true);
  };

  const onSubmitRename = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !renameTarget) {
      return;
    }
    setRenameBusy(true);
    setListError(null);
    try {
      await renameProject(companyId, renameTarget.id, renameValue, companyId);
      setRenameOpen(false);
      setRenameTarget(null);
      await refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Не удалось переименовать проект.");
    } finally {
      setRenameBusy(false);
    }
  };

  const onDelete = async (m: ProjectMeta) => {
    if (!companyId) {
      return;
    }
    const ok = window.confirm(`Удалить проект «${m.name}»? Это действие нельзя отменить.`);
    if (!ok) {
      return;
    }
    setListError(null);
    try {
      await deleteProject(companyId, m.id, companyId);
      await refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Не удалось удалить проект.");
    }
  };

  return (
    <div className="ws-projects-page">
      <div className="ws-projects-inner">
        <article className="ws-projects-card">
          <Link className="ws-projects-brand" to="/">
            <span className="ws-projects-brand-title">HouseKit Pro</span>
            <span className="ws-projects-brand-sub">by HotWell.kz</span>
          </Link>

          <AppWorkspaceNav />

          <header className="ws-projects-header">
            <div>
              <h1 className="ws-projects-title">Проекты</h1>
              <p className="ws-projects-subtitle">Рабочее пространство: {companyName}</p>
            </div>
            {isAuthenticated && companyId && userId ? (
              <button
                type="button"
                className="ws-projects-btn ws-projects-btn--primary"
                onClick={openCreate}
                disabled={!canCreateProject}
                title={canCreateProject ? undefined : "У вашей роли нет прав на создание проектов."}
              >
                Новый проект
              </button>
            ) : null}
          </header>

          {status === "loading" ? (
            <p className="ws-projects-muted">Загрузка…</p>
          ) : !isAuthenticated ? (
            <p className="ws-projects-muted">
              <Link className="ws-projects-link" to="/login?returnUrl=/app/projects">
                Войдите
              </Link>
              , чтобы увидеть проекты компании.
            </p>
          ) : !companyId ? (
            <p className="ws-projects-muted">Не выбрана активная компания. Обновите профиль или войдите снова.</p>
          ) : (
            <>
              {profile?.email ? (
                <p className="ws-projects-muted ws-projects-user-line">Вы вошли как {profile.email}</p>
              ) : null}

              {listError ? (
                <div className="ws-projects-alert" role="alert">
                  {listError}
                </div>
              ) : null}

              {listLoading ? (
                <p className="ws-projects-muted">Загружаем список…</p>
              ) : projects.length === 0 ? (
                <div className="ws-projects-empty-block">
                  <p className="ws-projects-empty-title">Пока нет проектов</p>
                  <p className="ws-projects-empty-text">
                    {canCreateProject
                      ? "Создайте первый проект СИП-дома"
                      : "У вашей роли только просмотр — дождитесь, пока проекты появятся у команды."}
                  </p>
                  {canCreateProject ? (
                    <button type="button" className="ws-projects-btn ws-projects-btn--primary ws-projects-btn--large" onClick={openCreate}>
                      Новый проект
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className="ws-projects-grid" aria-label="Список проектов">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <article className="ws-project-card">
                        <div className="ws-project-card-top">
                          <h2 className="ws-project-card-title">{p.name}</h2>
                          {canCreateProject ? (
                            <details className="ws-project-details">
                              <summary className="ws-project-details-summary" aria-label="Действия с проектом">
                                ⋮
                              </summary>
                              <div className="ws-project-details-menu" role="menu">
                                <button type="button" className="ws-project-menu-item" role="menuitem" onClick={() => openRename(p)}>
                                  Переименовать
                                </button>
                                <button type="button" className="ws-project-menu-item ws-project-menu-item--danger" role="menuitem" onClick={() => void onDelete(p)}>
                                  Удалить
                                </button>
                              </div>
                            </details>
                          ) : null}
                        </div>
                        <p className="ws-project-meta">
                          Последнее изменение: <strong>{formatRuDate(p.updatedAt)}</strong>
                        </p>
                        <p className="ws-project-meta">Кто изменил: {editorLabel(p.updatedBy, userId)}</p>
                        <button
                          type="button"
                          className="ws-projects-btn ws-projects-btn--primary ws-project-open"
                          onClick={() => navigate(`/app?projectId=${encodeURIComponent(p.id)}`)}
                        >
                          Открыть
                        </button>
                      </article>
                    </li>
                  ))}
                </ul>
              )}

              <p className="ws-projects-footer-link">
                <Link className="ws-projects-link" to="/app">
                  Открыть редактор без облачного проекта
                </Link>
              </p>
            </>
          )}
        </article>
      </div>

      {createOpen ? (
        <div className="ws-modal-root" role="presentation">
          <button type="button" className="ws-modal-backdrop" aria-label="Закрыть" onClick={() => !createBusy && setCreateOpen(false)} />
          <div className="ws-modal" role="dialog" aria-modal="true" aria-labelledby={modalTitleId}>
            <h2 id={modalTitleId} className="ws-modal-title">
              Новый проект
            </h2>
            <form className="ws-modal-form" onSubmit={(e) => void onSubmitCreate(e)}>
              <label className="ws-modal-label">
                Название проекта
                <input
                  className="ws-modal-input"
                  value={createName}
                  onChange={(ev) => setCreateName(ev.target.value)}
                  autoFocus
                  disabled={createBusy}
                />
              </label>
              {createError ? (
                <div className="ws-projects-alert" role="alert">
                  {createError}
                </div>
              ) : null}
              <div className="ws-modal-actions">
                <button type="button" className="ws-projects-btn" onClick={() => setCreateOpen(false)} disabled={createBusy}>
                  Отмена
                </button>
                <button
                  type="submit"
                  className="ws-projects-btn ws-projects-btn--primary"
                  disabled={createBusy || !canCreateProject || createName.trim().length === 0}
                >
                  {createBusy ? "Создаём…" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {renameOpen && renameTarget ? (
        <div className="ws-modal-root" role="presentation">
          <button type="button" className="ws-modal-backdrop" aria-label="Закрыть" onClick={() => !renameBusy && setRenameOpen(false)} />
          <div className="ws-modal" role="dialog" aria-modal="true" aria-labelledby={`${modalTitleId}-rename`}>
            <h2 id={`${modalTitleId}-rename`} className="ws-modal-title">
              Переименовать проект
            </h2>
            <form
              className="ws-modal-form"
              onSubmit={(e) => void onSubmitRename(e)}
            >
              <label className="ws-modal-label">
                Название проекта
                <input
                  className="ws-modal-input"
                  value={renameValue}
                  onChange={(ev) => setRenameValue(ev.target.value)}
                  autoFocus
                  disabled={renameBusy}
                />
              </label>
              <div className="ws-modal-actions">
                <button type="button" className="ws-projects-btn" onClick={() => setRenameOpen(false)} disabled={renameBusy}>
                  Отмена
                </button>
                <button type="submit" className="ws-projects-btn ws-projects-btn--primary" disabled={renameBusy}>
                  {renameBusy ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
