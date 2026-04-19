import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { googleSignInSupported, signInWithEmailPassword, signInWithGoogle } from "./authActions";
import { friendlyAuthError } from "./authErrors";
import { sanitizeInternalReturnUrl } from "./returnUrl";

import "./AuthPages.css";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = sanitizeInternalReturnUrl(searchParams.get("returnUrl")) ?? "/app/projects";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const afterAuthNavigate = () => {
    void navigate(returnUrl, { replace: true });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailPassword(email, password);
      afterAuthNavigate();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      afterAuthNavigate();
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

          <h1 className="auth-title">Войти в HouseKit Pro</h1>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {error ? (
              <div className="auth-error" role="alert">
                {error}
              </div>
            ) : null}
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
                autoComplete="current-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                required
                disabled={loading}
              />
            </label>
            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? "Вход…" : "Войти"}
            </button>
          </form>

          {googleSignInSupported() ? (
            <button type="button" className="auth-btn-google" onClick={() => void onGoogle()} disabled={loading}>
              Войти через Google
            </button>
          ) : null}

          <p className="auth-footer-text">
            Нет аккаунта?{" "}
            <Link className="auth-inline-link" to="/register?returnUrl=/app/projects">
              Зарегистрироваться
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
