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
import { signUpAndJoinByInvite, signUpWithCompany } from "./authActions";
import { friendlyAuthError } from "./authErrors";
import { DEFAULT_COMPANY_NAME } from "./firestoreOrgWrites";
import { sanitizeInternalReturnUrl } from "./returnUrl";

import "./AuthPages.css";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshSession } = useAuth();

  useDocumentSeo({
    title: "Регистрация — HouseKit Pro",
    robots: "noindex",
  });

  const inviteToken = searchParams.get("invite");
  const inviteRef = inviteToken ? decodeInviteToken(inviteToken) : null;

  const returnUrl = sanitizeInternalReturnUrl(searchParams.get("returnUrl")) ?? "/app/projects";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invite, setInvite] = useState<CompanyInvite | null | undefined>(inviteRef ? undefined : null);
  const [inviteCheckError, setInviteCheckError] = useState<string | null>(null);

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
      } catch (e) {
        if (!cancelled) {
          setInviteCheckError(e instanceof Error ? e.message : "Не удалось загрузить приглашение.");
          setInvite(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteRef?.companyId, inviteRef?.inviteId, inviteRef]);

  const inviteExpired =
    invite && invite.status !== "pending"
      ? true
      : invite && new Date(invite.expiresAt).getTime() <= Date.now()
        ? true
        : false;

  const inviteEmailLocked = !!invite && invite.status === "pending" && !inviteExpired;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    trackEvent("click_register", { with_invite: inviteRef ? true : false });
    try {
      if (inviteRef && invite) {
        if (invite.status !== "pending") {
          throw new Error("Приглашение уже недействительно.");
        }
        if (inviteExpired) {
          throw new Error("Срок приглашения истёк.");
        }
        const expected = normalizeInviteEmail(invite.email);
        const provided = normalizeInviteEmail(email);
        if (expected !== provided) {
          throw new Error("Это приглашение создано для другого email.");
        }
        await signUpAndJoinByInvite({
          name: name.trim(),
          email: email.trim(),
          password,
          companyId: inviteRef.companyId,
          inviteId: inviteRef.inviteId,
        });
        trackEvent("registration_success", { mode: "invite" });
        await refreshSession();
        void navigate("/app/projects", { replace: true });
        return;
      }

      const cn = companyName.trim().length > 0 ? companyName : DEFAULT_COMPANY_NAME;
      await signUpWithCompany({
        name: name.trim(),
        email: email.trim(),
        password,
        companyName: cn,
      });
      trackEvent("registration_success", { mode: "self_signup" });
      void navigate(returnUrl, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const inviteHeader = (() => {
    if (!inviteRef) {
      return null;
    }
    if (invite === undefined) {
      return <p className="auth-hint">Проверяем приглашение…</p>;
    }
    if (inviteCheckError || invite === null) {
      return (
        <div className="auth-error" role="alert">
          {inviteCheckError ?? "Приглашение недействительно или устарело."}
        </div>
      );
    }
    if (inviteExpired) {
      return (
        <div className="auth-error" role="alert">
          Приглашение недействительно или устарело.
        </div>
      );
    }
    return (
      <div className="auth-hint" role="status">
        Регистрация по приглашению на email <strong>{invite.email}</strong>.
        Компания будет подключена автоматически после регистрации.
      </div>
    );
  })();

  return (
    <div className="auth-page">
      <div className="auth-page-inner">
        <article className="auth-card">
          <Link className="auth-brand" to="/">
            <span className="auth-brand-title">HouseKit Pro</span>
            <span className="auth-brand-sub">by HotWell.kz</span>
          </Link>

          <h1 className="auth-title">
            {inviteEmailLocked ? "Принять приглашение в команду" : "Зарегистрироваться в HouseKit Pro"}
          </h1>
          <p className="auth-lead">
            {inviteEmailLocked
              ? "Создайте аккаунт для указанного email — и вы окажетесь в рабочем пространстве компании."
              : "Создайте аккаунт и рабочее пространство для проектов СИП-домов."}
          </p>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {inviteHeader}
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
                disabled={loading || inviteEmailLocked}
                readOnly={inviteEmailLocked}
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
            {inviteEmailLocked ? null : (
              <>
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
              </>
            )}
            <button type="submit" className="auth-btn-primary" disabled={loading || (inviteRef != null && !inviteEmailLocked)}>
              {loading
                ? "Регистрация…"
                : inviteEmailLocked
                  ? "Зарегистрироваться и присоединиться"
                  : "Зарегистрироваться"}
            </button>
          </form>

          <p className="auth-footer-text">
            Уже есть аккаунт?{" "}
            <Link
              className="auth-inline-link"
              to={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login"}
            >
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
