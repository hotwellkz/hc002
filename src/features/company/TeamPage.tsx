import { type FormEvent, useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import type { CompanyInvite, CompanyMember } from "@/core/company/orgTypes";
import { useAuth } from "@/features/auth/AuthProvider";
import { AppWorkspaceNav } from "@/features/workspace/AppWorkspaceNav";
import {
  cancelCompanyInvite,
  canInviteEmployees,
  canManageTeam,
  createCompanyInvite,
  inviteRoleAllowedForActor,
  listCompanyInvites,
  listCompanyMembers,
  removeCompanyMember,
  updateMemberRole,
} from "@/features/company/companyTeamService";

import "./teamPage.css";

const ROLE_LABELS: Record<CompanyMember["role"], string> = {
  owner: "Владелец",
  admin: "Администратор",
  designer: "Проектировщик",
  viewer: "Просмотр",
};

const INVITE_ROLE_LABELS: Record<CompanyInvite["role"], string> = {
  admin: "Администратор",
  designer: "Проектировщик",
  viewer: "Просмотр",
};

function formatRuDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return iso;
  }
}

export function TeamPage() {
  const modalId = useId();
  const { profile, activeCompany, isAuthenticated, status, user, activeCompanyMember } = useAuth();

  const companyId = profile?.activeCompanyId ?? null;
  const userId = user?.uid ?? profile?.id ?? null;
  const companyName = activeCompany?.name ?? "—";
  const role = activeCompanyMember?.role;
  const manage = canManageTeam(role);
  const canInvite = canInviteEmployees(role) && userId != null;

  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [invites, setInvites] = useState<CompanyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyInvite["role"]>("designer");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteDoneUrl, setInviteDoneUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId || !isAuthenticated) {
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const m = await listCompanyMembers(companyId);
      setMembers(m);
      if (canManageTeam(activeCompanyMember?.role)) {
        try {
          const inv = await listCompanyInvites(companyId);
          setInvites(inv);
        } catch {
          setInvites([]);
        }
      } else {
        setInvites([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить команду.");
    } finally {
      setLoading(false);
    }
  }, [companyId, isAuthenticated, activeCompanyMember?.role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openInviteModal = () => {
    setInviteEmail("");
    setInviteRole("designer");
    setInviteDoneUrl(null);
    setInviteOpen(true);
  };

  const onSubmitInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !userId || !inviteRoleAllowedForActor(role ?? "viewer", inviteRole)) {
      return;
    }
    setInviteBusy(true);
    setError(null);
    try {
      const row = await createCompanyInvite(companyId, userId, inviteEmail, inviteRole);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/invite/${encodeURIComponent(row.id)}?companyId=${encodeURIComponent(companyId)}`;
      setInviteDoneUrl(url);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать приглашение.");
    } finally {
      setInviteBusy(false);
    }
  };

  const copyLink = async () => {
    if (!inviteDoneUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteDoneUrl);
    } catch {
      setError("Не удалось скопировать ссылку.");
    }
  };

  const onChangeRole = async (targetUid: string, next: CompanyMember["role"]) => {
    if (!companyId || !manage) {
      return;
    }
    setError(null);
    try {
      await updateMemberRole(companyId, targetUid, next);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить роль.");
    }
  };

  const onRemove = async (target: CompanyMember) => {
    if (!companyId || !userId || !manage) {
      return;
    }
    const ok = window.confirm(`Удалить ${target.email} из команды?`);
    if (!ok) {
      return;
    }
    setError(null);
    try {
      await removeCompanyMember(companyId, target.userId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить участника.");
    }
  };

  const onCancelInvite = async (inviteId: string) => {
    if (!companyId || !manage) {
      return;
    }
    setError(null);
    try {
      await cancelCompanyInvite(companyId, inviteId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отменить приглашение.");
    }
  };

  return (
    <div className="team-page">
      <div className="team-page-inner">
        <article className="team-page-card">
          <Link className="team-page-brand" to="/">
            <span className="team-page-brand-title">HouseKit Pro</span>
            <span className="team-page-brand-sub">by HotWell.kz</span>
          </Link>

          <AppWorkspaceNav />

          <header className="team-page-header">
            <div>
              <h1 className="team-page-title">Команда</h1>
              <p className="team-page-subtitle">Участники компании {companyName}</p>
            </div>
            {canInvite ? (
              <button type="button" className="team-page-btn team-page-btn--primary" onClick={openInviteModal}>
                Пригласить сотрудника
              </button>
            ) : null}
          </header>

          {status === "loading" ? (
            <p className="team-page-muted">Загрузка…</p>
          ) : !isAuthenticated ? (
            <p className="team-page-muted">
              <Link className="team-page-link" to="/login?returnUrl=/app/team">
                Войдите
              </Link>
              , чтобы увидеть команду.
            </p>
          ) : !companyId ? (
            <p className="team-page-muted">Не выбрана активная компания.</p>
          ) : (
            <>
              {!manage ? (
                <p className="team-page-note">У вас нет прав на управление командой.</p>
              ) : null}

              {error ? (
                <div className="team-page-alert" role="alert">
                  {error}
                </div>
              ) : null}

              {loading ? (
                <p className="team-page-muted">Загружаем…</p>
              ) : (
                <>
                  <ul className="team-member-grid" aria-label="Участники">
                    {members.map((m) => (
                      <li key={m.userId}>
                        <article className="team-member-card">
                          <div className="team-member-top">
                            <div>
                              <h2 className="team-member-name">{m.displayName?.trim() || m.email}</h2>
                              <p className="team-member-email">{m.email}</p>
                            </div>
                            {manage && m.role !== "owner" && m.userId !== userId ? (
                              <details className="team-member-menu">
                                <summary className="team-member-menu-sum" aria-label="Действия">
                                  ⋮
                                </summary>
                                <div className="team-member-menu-body">
                                  <label className="team-member-role-label">
                                    Роль
                                    <select
                                      className="team-member-role-select"
                                      value={m.role}
                                      onChange={(ev) =>
                                        void onChangeRole(m.userId, ev.target.value as CompanyMember["role"])
                                      }
                                    >
                                      {(Object.keys(ROLE_LABELS) as CompanyMember["role"][])
                                        .filter((r) => r !== "owner")
                                        .map((r) => (
                                          <option key={r} value={r}>
                                            {ROLE_LABELS[r]}
                                          </option>
                                        ))}
                                    </select>
                                  </label>
                                  <button type="button" className="team-page-btn team-page-btn--danger" onClick={() => void onRemove(m)}>
                                    Удалить из команды
                                  </button>
                                </div>
                              </details>
                            ) : null}
                          </div>
                          <p className="team-member-meta">
                            Роль: <strong>{ROLE_LABELS[m.role]}</strong>
                          </p>
                          <p className="team-member-meta">Добавлен: {formatRuDate(m.joinedAt ?? m.createdAt)}</p>
                          <p className="team-member-meta">Статус: {m.status === "active" ? "Активен" : m.status}</p>
                        </article>
                      </li>
                    ))}
                  </ul>

                  {manage && invites.length > 0 ? (
                    <section className="team-invites-block" aria-labelledby={`${modalId}-inv`}>
                      <h2 id={`${modalId}-inv`} className="team-invites-title">
                        Приглашения
                      </h2>
                      <ul className="team-invite-list">
                        {invites.map((i) => (
                          <li key={i.id} className="team-invite-row">
                            <span>{i.email}</span>
                            <span className="team-invite-role">{INVITE_ROLE_LABELS[i.role]}</span>
                            <span className="team-invite-status">{i.status}</span>
                            {i.status === "pending" ? (
                              <button type="button" className="team-page-btn" onClick={() => void onCancelInvite(i.id)}>
                                Отменить
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </>
              )}

              <p className="team-page-footer">
                <Link className="team-page-link" to="/app/projects">
                  К проектам
                </Link>
              </p>
            </>
          )}
        </article>
      </div>

      {inviteOpen ? (
        <div className="team-modal-root" role="presentation">
          <button type="button" className="team-modal-backdrop" aria-label="Закрыть" onClick={() => !inviteBusy && setInviteOpen(false)} />
          <div className="team-modal" role="dialog" aria-modal="true" aria-labelledby={`${modalId}-t`}>
            <h2 id={`${modalId}-t`} className="team-modal-title">
              {inviteDoneUrl ? "Приглашение создано" : "Пригласить сотрудника"}
            </h2>
            {inviteDoneUrl ? (
              <div className="team-modal-done">
                <p className="team-page-muted">Отправьте ссылку коллеге (копирование в буфер обмена).</p>
                <input readOnly className="team-modal-input team-modal-input--mono" value={inviteDoneUrl} />
                <div className="team-modal-actions">
                  <button type="button" className="team-page-btn team-page-btn--primary" onClick={() => void copyLink()}>
                    Скопировать ссылку
                  </button>
                  <button type="button" className="team-page-btn" onClick={() => setInviteOpen(false)}>
                    Закрыть
                  </button>
                </div>
              </div>
            ) : (
              <form className="team-modal-form" onSubmit={(e) => void onSubmitInvite(e)}>
                <label className="team-modal-label">
                  Email сотрудника
                  <input
                    className="team-modal-input"
                    type="email"
                    autoComplete="email"
                    value={inviteEmail}
                    onChange={(ev) => setInviteEmail(ev.target.value)}
                    required
                    disabled={inviteBusy}
                  />
                </label>
                <label className="team-modal-label">
                  Роль
                  <select
                    className="team-modal-input"
                    value={inviteRole}
                    onChange={(ev) => setInviteRole(ev.target.value as CompanyInvite["role"])}
                    disabled={inviteBusy}
                  >
                    {(Object.keys(INVITE_ROLE_LABELS) as CompanyInvite["role"][])
                      .filter((r) => inviteRoleAllowedForActor(role ?? "viewer", r))
                      .map((r) => (
                        <option key={r} value={r}>
                          {INVITE_ROLE_LABELS[r]}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="team-modal-actions">
                  <button type="button" className="team-page-btn" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>
                    Отмена
                  </button>
                  <button type="submit" className="team-page-btn team-page-btn--primary" disabled={inviteBusy}>
                    {inviteBusy ? "Создаём…" : "Создать приглашение"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
