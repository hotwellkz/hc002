import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import type { CompanyInvite } from "@/core/company/orgTypes";
import { useAuth } from "@/features/auth/AuthProvider";
import { acceptCompanyInvite, getCompanyInvite } from "@/features/company/companyTeamService";
import { useDocumentSeo } from "@/shared/seo/useDocumentSeo";

import "./inviteAcceptPage.css";

export function InviteAcceptPage() {
  useDocumentSeo({
    title: "Приглашение в команду — HouseKit Pro",
    robots: "noindex",
  });

  const { inviteId } = useParams<{ inviteId: string }>();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get("companyId");
  const { status, isAuthenticated, user, profile, refreshSession } = useAuth();
  const authReady = status === "ready";

  const [invite, setInvite] = useState<CompanyInvite | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inviteId || !companyId) {
      setInvite(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const row = await getCompanyInvite(companyId, inviteId);
        if (!cancelled) {
          setInvite(row);
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
  }, [inviteId, companyId, authReady, isAuthenticated]);

  const returnUrl = `/invite/${encodeURIComponent(inviteId ?? "")}?companyId=${encodeURIComponent(companyId ?? "")}`;

  const userEmail = (user?.email ?? profile?.email ?? "").trim().toLowerCase();
  const inviteEmail = invite ? invite.email.trim().toLowerCase() : "";

  const emailMismatch = isAuthenticated && invite && userEmail && inviteEmail && userEmail !== inviteEmail;

  const canAccept =
    isAuthenticated &&
    invite &&
    invite.status === "pending" &&
    new Date(invite.expiresAt).getTime() > Date.now() &&
    userEmail === inviteEmail &&
    inviteId &&
    companyId;

  const onAccept = async () => {
    if (!canAccept || !inviteId || !companyId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ctx = {
        uid: user?.uid ?? profile?.id ?? "",
        email: user?.email ?? profile?.email ?? "",
        displayName: user?.displayName ?? profile?.name,
      };
      if (!ctx.uid || !ctx.email) {
        throw new Error("Не удалось определить профиль пользователя.");
      }
      await acceptCompanyInvite(companyId, inviteId, ctx);
      await refreshSession();
      window.location.assign("/app/projects");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось принять приглашение.");
    } finally {
      setBusy(false);
    }
  };

  if (!inviteId || !companyId) {
    return (
      <div className="invite-page">
        <div className="invite-page-inner">
          <article className="invite-page-card">
            <p className="invite-page-lead">Некорректная ссылка приглашения (не хватает параметров).</p>
            <Link className="invite-page-link" to="/">
              На главную
            </Link>
          </article>
        </div>
      </div>
    );
  }

  if (invite === undefined || status === "loading") {
    return (
      <div className="invite-page">
        <div className="invite-page-inner">
          <article className="invite-page-card">
            <p className="invite-page-lead">Загрузка приглашения…</p>
          </article>
        </div>
      </div>
    );
  }

  if (invite === null) {
    return (
      <div className="invite-page">
        <div className="invite-page-inner">
          <article className="invite-page-card">
            <p className="invite-page-lead">Приглашение не найдено или у вас нет доступа.</p>
            <Link className="invite-page-link" to="/login">
              Войти
            </Link>
          </article>
        </div>
      </div>
    );
  }

  if (invite.status !== "pending" || new Date(invite.expiresAt).getTime() <= Date.now()) {
    return (
      <div className="invite-page">
        <div className="invite-page-inner">
          <article className="invite-page-card">
            <h1 className="invite-page-title">Приглашение недействительно</h1>
            <p className="invite-page-lead">Срок истёк или приглашение уже использовано.</p>
            <Link className="invite-page-link" to="/">
              На главную
            </Link>
          </article>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="invite-page">
        <div className="invite-page-inner">
          <article className="invite-page-card">
            <h1 className="invite-page-title">Вас пригласили в команду HouseKit Pro</h1>
            <p className="invite-page-lead">
              Чтобы принять приглашение, войдите или зарегистрируйтесь с email, на который отправлено приглашение (
              <strong>{invite.email}</strong>).
            </p>
            <div className="invite-page-actions">
              <Link className="invite-page-btn invite-page-btn--primary" to={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}>
                Войти
              </Link>
              <Link className="invite-page-btn" to={`/register?returnUrl=${encodeURIComponent(returnUrl)}`}>
                Зарегистрироваться
              </Link>
            </div>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-page">
      <div className="invite-page-inner">
        <article className="invite-page-card">
          <h1 className="invite-page-title">Приглашение в команду</h1>
          <p className="invite-page-lead">
            Вас пригласили по адресу <strong>{invite.email}</strong>.
          </p>
          {error ? (
            <div className="invite-page-alert" role="alert">
              {error}
            </div>
          ) : null}
          {emailMismatch ? (
            <div className="invite-page-alert" role="alert">
              Это приглашение создано для другого email.
            </div>
          ) : null}
          {canAccept ? (
            <button type="button" className="invite-page-btn invite-page-btn--primary" disabled={busy} onClick={() => void onAccept()}>
              {busy ? "Принимаем…" : "Принять приглашение"}
            </button>
          ) : null}
          <p className="invite-page-lead" style={{ marginTop: 16 }}>
            <Link className="invite-page-link" to="/app/projects">
              К проектам
            </Link>
          </p>
        </article>
      </div>
    </div>
  );
}
