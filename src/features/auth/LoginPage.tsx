import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { CompanyInvite } from "@/core/company/orgTypes";
import {
  decodeInviteToken,
  getCompanyInvite,
  normalizeInviteEmail,
} from "@/features/company/companyTeamService";
import { trackEvent } from "@/shared/analytics/analytics";
import { useDocumentSeo } from "@/shared/seo/useDocumentSeo";

import { useAuth } from "./AuthProvider";
import {
  acceptInviteForCurrentSession,
  googleSignInSupported,
  signInWithEmailPassword,
  signInWithGoogle,
} from "./authActions";
import { friendlyAuthError } from "./authErrors";
import { sanitizeInternalReturnUrl } from "./returnUrl";

import "./AuthPages.css";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshSession } = useAuth();

  useDocumentSeo({
    title: "Войти — HouseKit Pro",
    robots: "noindex",
  });

  const inviteToken = searchParams.get("invite");
  const inviteRef = inviteToken ? decodeInviteToken(inviteToken) : null;
  const returnUrl = sanitizeInternalReturnUrl(searchParams.get("returnUrl")) ?? "/app/projects";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<CompanyInvite | null | undefined>(inviteRef ? undefined : null);

  useEffect(() => {
    if (!inviteRef) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const row = await getCompanyInvite(inviteRef.companyId, inviteRef.inviteId);
        if (!cancelled) {
          setInvite(row);
          if (row) {
            setEmail(row.email);
          }
        }
      } catch {
        if (!cancelled) {
          setInvite(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteRef?.companyId, inviteRef?.inviteId, inviteRef]);

  const finishWithInvite = async () => {
    if (!inviteRef || !invite) {
      void navigate(returnUrl, { replace: true });
      return;
    }
    if (invite.status !== "pending" || new Date(invite.expiresAt).getTime() <= Date.now()) {
      throw new Error("Приглашение недействительно или устарело.");
    }
    if (normalizeInviteEmail(invite.email) !== normalizeInviteEmail(email)) {
      throw new Error("Это приглашение создано для другого email.");
    }
    await acceptInviteForCurrentSession({
      companyId: inviteRef.companyId,
      inviteId: inviteRef.inviteId,
    });
    await refreshSession();
    void navigate("/app/projects", { replace: true });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    trackEvent("click_login", { method: "password" });
    try {
      await signInWithEmailPassword(email, password);
      if (inviteRef) {
        await finishWithInvite();
      } else {
        void navigate(returnUrl, { replace: true });
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    setLoading(true);
    trackEvent("click_login", { method: "google" });
    try {
      await signInWithGoogle();
      if (inviteRef) {
        await finishWithInvite();
      } else {
        void navigate(returnUrl, { replace: true });
      }
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

          <h1 className="auth-title">{inviteRef ? "Войти и принять приглашение" : "Войти в HouseKit Pro"}</h1>

          {inviteRef ? (
            invite === undefined ? (
              <p className="auth-hint">Проверяем приглашение…</p>
            ) : invite === null ? (
              <div className="auth-error" role="alert">
                Приглашение недействительно или устарело.
              </div>
            ) : (
              <div className="auth-hint" role="status">
                Приглашение для <strong>{invite.email}</strong>. После входа вы окажетесь в рабочем
                пространстве компании.
              </div>
            )
          ) : null}

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
              {loading ? "Вход…" : inviteRef ? "Войти и присоединиться" : "Войти"}
            </button>
          </form>

          {googleSignInSupported() ? (
            <button type="button" className="auth-btn-google" onClick={() => void onGoogle()} disabled={loading}>
              Войти через Google
            </button>
          ) : null}

          <p className="auth-footer-text">
            Нет аккаунта?{" "}
            <Link
              className="auth-inline-link"
              to={inviteToken ? `/register?invite=${encodeURIComponent(inviteToken)}` : "/register?returnUrl=/app/projects"}
            >
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
