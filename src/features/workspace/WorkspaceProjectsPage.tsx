import { Link } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthProvider";

import "./workspaceProjects.css";

/**
 * Будущая домашняя страница облачных проектов. Маршрут /app/projects — без ссылки в основной навигации редактора.
 * TODO: список ProjectMeta из Firestore, кнопка «Новый проект» с созданием документа и открытием в /app.
 */
export function WorkspaceProjectsPage() {
  const { profile, activeCompany, isAuthenticated, status } = useAuth();

  const companyLabel = activeCompany?.name ?? "—";

  return (
    <div className="ws-projects-page">
      <div className="ws-projects-inner">
        <article className="ws-projects-card">
          <Link className="ws-projects-brand" to="/">
            <span className="ws-projects-brand-title">HouseKit Pro</span>
            <span className="ws-projects-brand-sub">by HotWell.kz</span>
          </Link>

          <h1 className="ws-projects-title">Проекты</h1>

          {status === "loading" ? (
            <p className="ws-projects-muted">Загрузка…</p>
          ) : !isAuthenticated ? (
            <p className="ws-projects-muted">
              <Link className="ws-projects-link" to="/login?returnUrl=/app/projects">
                Войдите
              </Link>
              , чтобы увидеть проекты компании.
            </p>
          ) : (
            <>
              <p className="ws-projects-company">
                Компания: <strong>{companyLabel}</strong>
              </p>
              {profile?.email ? (
                <p className="ws-projects-muted">Вы вошли как {profile.email}</p>
              ) : null}
              <button type="button" className="ws-projects-btn" disabled>
                Новый проект
              </button>
              <p className="ws-projects-note">
                Облачное сохранение проектов будет подключено на следующем этапе.
              </p>
              <ul className="ws-projects-list" aria-label="Список проектов">
                <li className="ws-projects-empty">Пока нет проектов в облаке</li>
              </ul>
              <p className="ws-projects-footer-link">
                <Link className="ws-projects-link" to="/app">
                  Открыть редактор
                </Link>
              </p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
