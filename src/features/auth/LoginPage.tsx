import { Link } from "react-router-dom";

import "./AuthStubPages.css";

/**
 * TODO: подключить Firebase Auth (signInWithEmailAndPassword / OAuth).
 * TODO: после входа — редирект в /app или на сохранённый returnUrl.
 * TODO: связать сущность User с CompanyMember при появлении бэкенда компаний.
 */
export function LoginPage() {
  return (
    <div className="auth-stub-page">
      <div className="auth-stub-inner">
        <article className="auth-stub-card">
          <h1>Вход</h1>
          <p className="auth-stub-byline">HouseKit Pro · by HotWell.kz</p>
          <p className="auth-stub-note">
            Авторизация появится в следующем релизе. Пока откройте редактор напрямую — локальные проекты и
            файлы работают как раньше.
          </p>
          <div className="auth-stub-fields">
            <label>
              Email
              <input type="email" autoComplete="email" placeholder="you@company.kz" disabled />
            </label>
            <label>
              Пароль
              <input type="password" autoComplete="current-password" placeholder="••••••••" disabled />
            </label>
          </div>
          <div className="auth-stub-actions">
            <button type="button" className="auth-stub-btn" disabled>
              Войти
            </button>
            <Link className="auth-stub-link" to="/app">
              Перейти в редактор
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
