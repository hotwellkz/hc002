import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { signUpWithCompany } from "./authActions";
import { friendlyAuthError } from "./authErrors";
import { DEFAULT_COMPANY_NAME } from "./firestoreOrgWrites";
import { sanitizeInternalReturnUrl } from "./returnUrl";

import "./AuthPages.css";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = sanitizeInternalReturnUrl(searchParams.get("returnUrl")) ?? "/app/projects";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const cn = companyName.trim().length > 0 ? companyName : DEFAULT_COMPANY_NAME;
      await signUpWithCompany({
        name: name.trim(),
        email: email.trim(),
        password,
        companyName: cn,
      });
      void navigate(returnUrl, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page-inner">
        <article className="auth-card">
          <Link className="auth-brand" to="/">
            <span className="auth-brand-title">HouseKit Pro</span>
            <span className="auth-brand-sub">by HotWell.kz</span>
          </Link>

          <h1 className="auth-title">Зарегистрироваться в HouseKit Pro</h1>
          <p className="auth-lead">Создайте аккаунт и рабочее пространство для проектов СИП-домов.</p>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {error ? (
              <div className="auth-error" role="alert">
                {error}
              </div>
            ) : null}
            <label className="auth-label">
              Имя
              <input
                className="auth-input"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                required
                disabled={loading}
              />
            </label>
            <label className="auth-label">
              Email
              <input
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
                disabled={loading}
              />
            </label>
            <label className="auth-label">
              Пароль
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
            </label>
            <label className="auth-label">
              Название компании / бригады
              <input
                className="auth-input"
                type="text"
                autoComplete="organization"
                placeholder={DEFAULT_COMPANY_NAME}
                value={companyName}
                onChange={(ev) => setCompanyName(ev.target.value)}
                disabled={loading}
              />
            </label>
            <p className="auth-hint">Если оставить поле пустым, будет использовано «{DEFAULT_COMPANY_NAME}».</p>
            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? "Регистрация…" : "Зарегистрироваться"}
            </button>
          </form>

          <p className="auth-footer-text">
            Уже есть аккаунт?{" "}
            <Link className="auth-inline-link" to="/login">
              Войти
            </Link>
          </p>
          <p className="auth-footer-text">
            <Link className="auth-inline-link" to="/">
              На главную
            </Link>
          </p>
        </article>
      </div>
    </div>
  );
}
