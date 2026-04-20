import { type FormEvent, useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import type { CompanyInvite, CompanyMember } from "@/core/company/orgTypes";
import { useAuth } from "@/features/auth/AuthProvider";
import { RoleSelect, type RoleOption } from "@/features/company/RoleSelect";
import { AppWorkspaceNav } from "@/features/workspace/AppWorkspaceNav";
import {
  buildInviteRegistrationUrl,
  cancelCompanyInvite,
  canDeleteInvite,
  canInviteEmployees,
  canManageTeam,
  copyInviteLink,
  createCompanyInvite,
  deleteCompanyInvite,
  inviteRoleAllowedForActor,
  inviteStatusLabel,
  listCompanyInvites,
  listCompanyMembers,
  normalizeInviteStatusKind,
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

const ROLE_DESCRIPTIONS: Record<CompanyMember["role"], string> = {
  owner: "Полный доступ, управление компанией и командой",
  admin: "Управление командой и проектами, кроме владельца",
  designer: "Создание и редактирование проектов",
  viewer: "Только просмотр проектов, без изменений",
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

  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [inviteActionInfo, setInviteActionInfo] = useState<string | null>(null);
  const [showAcceptedHistory, setShowAcceptedHistory] = useState(false);
  const [memberActionInfo, setMemberActionInfo] = useState<string | null>(null);

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
      const url = buildInviteRegistrationUrl(origin, companyId, row.id);
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

  const onChangeRole = async (target: CompanyMember, next: CompanyMember["role"]) => {
    if (!companyId || !manage) {
      setError("Недостаточно прав.");
      return;
    }
    if (target.role === "owner") {
      setError("Нельзя изменить роль владельца компании.");
      return;
    }
    // Админ не может менять собственную роль на owner, а также не трогает владельца.
    if (role === "admin" && next === "admin" && target.role !== "admin") {
      // admin назначает другого admin — разрешено (менять designer/viewer → admin).
    }
    if (next === target.role) {
      return;
    }
    setError(null);
    setMemberActionInfo(null);
    try {
      await updateMemberRole(companyId, target.userId, next);
      setMemberActionInfo(`Роль изменена: ${target.email} — ${ROLE_LABELS[next]}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить роль.");
    }
  };

  const onRemove = async (target: CompanyMember) => {
    if (!companyId || !userId || !manage) {
      setError("Недостаточно прав.");
      return;
    }
    if (target.role === "owner") {
      setError("Нельзя удалить владельца компании.");
      return;
    }
    const ok = window.confirm(`Удалить ${target.email} из команды?`);
    if (!ok) {
      return;
    }
    setError(null);
    setMemberActionInfo(null);
    try {
      await removeCompanyMember(companyId, target.userId);
      setMemberActionInfo(`Сотрудник удалён: ${target.email}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить участника.");
    }
  };

  const onCancelInvite = async (invite: CompanyInvite) => {
    if (!companyId || !manage) {
      return;
    }
    const ok = window.confirm(
      "Отменить приглашение? Пользователь больше не сможет присоединиться по этой ссылке.",
    );
    if (!ok) {
      return;
    }
    setError(null);
    setInviteActionInfo(null);
    setInviteActionId(invite.id);
    try {
      await cancelCompanyInvite(companyId, invite.id, userId ?? undefined);
      setInviteActionInfo("Приглашение отменено.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отменить приглашение.");
    } finally {
      setInviteActionId(null);
    }
  };

  const onDeleteInvite = async (invite: CompanyInvite) => {
    if (!companyId || !manage) {
      return;
    }
    if (!canDeleteInvite(invite)) {
      setError("Принятое приглашение нельзя удалить — управляйте участником в списке команды.");
      return;
    }
    const ok = window.confirm(
      "Удалить приглашение? Ссылка перестанет отображаться в списке.",
    );
    if (!ok) {
      return;
    }
    setError(null);
    setInviteActionInfo(null);
    setInviteActionId(invite.id);
    try {
      await deleteCompanyInvite(companyId, invite.id);
      setInviteActionInfo("Приглашение удалено.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить приглашение.");
    } finally {
      setInviteActionId(null);
    }
  };

  const onCopyInviteLink = async (invite: CompanyInvite) => {
    setError(null);
    setInviteActionInfo(null);
    try {
      const url = await copyInviteLink(invite);
      setInviteActionInfo(`Ссылка скопирована: ${url}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось скопировать ссылку.");
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

              {memberActionInfo ? (
                <div className="team-page-info" role="status" aria-live="polite">
                  {memberActionInfo}
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
                            {manage && m.role !== "owner" && m.userId !== userId ? (() => {
                              const allowedRoleValues: CompanyMember["role"][] =
                                role === "owner"
                                  ? ["admin", "designer", "viewer"]
                                  : ["designer", "viewer"];
                              const roleOptions: RoleOption<CompanyMember["role"]>[] = allowedRoleValues.map((r) => ({
                                value: r,
                                label: ROLE_LABELS[r],
                                description: ROLE_DESCRIPTIONS[r],
                              }));
                              // Если текущая роль участника (например, admin) недоступна актёру admin —
                              // добавляем её как disabled, чтобы видно было, что менять нельзя.
                              if (!allowedRoleValues.includes(m.role)) {
                                roleOptions.unshift({
                                  value: m.role,
                                  label: ROLE_LABELS[m.role],
                                  description: ROLE_DESCRIPTIONS[m.role],
                                  disabled: true,
                                });
                              }
                              return (
                                <details className="team-member-menu">
                                  <summary className="team-member-menu-sum" aria-label="Действия">
                                    ⋮
                                  </summary>
                                  <div className="team-member-menu-body">
                                    <div className="team-member-role-row">
                                      <span className="team-member-role-label-text">Роль</span>
                                      <RoleSelect
                                        value={m.role}
                                        options={roleOptions}
                                        onChange={(next) => void onChangeRole(m, next)}
                                        ariaLabel={`Роль ${m.email}`}
                                        size="sm"
                                        align="end"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      className="team-page-btn team-page-btn--danger"
                                      onClick={() => void onRemove(m)}
                                    >
                                      Удалить из команды
                                    </button>
                                  </div>
                                </details>
                              );
                            })() : null}
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

                  {manage && invites.length > 0 ? (() => {
                    const visible = invites.filter((i) => {
                      const k = normalizeInviteStatusKind(i.status);
                      return showAcceptedHistory ? true : k !== "accepted";
                    });
                    return (
                      <section className="team-invites-block" aria-labelledby={`${modalId}-inv`}>
                        <header className="team-invites-header">
                          <h2 id={`${modalId}-inv`} className="team-invites-title">
                            Приглашения
                          </h2>
                          <label className="team-invites-toggle">
                            <input
                              type="checkbox"
                              checked={showAcceptedHistory}
                              onChange={(ev) => setShowAcceptedHistory(ev.target.checked)}
                            />
                            <span>Показывать принятые</span>
                          </label>
                        </header>
                        {inviteActionInfo ? (
                          <p className="team-invites-info" role="status">{inviteActionInfo}</p>
                        ) : null}
                        {visible.length === 0 ? (
                          <p className="team-page-muted">Активных приглашений нет.</p>
                        ) : (
                          <ul className="team-invite-list">
                            {visible.map((i) => {
                              const k = normalizeInviteStatusKind(i.status);
                              const busy = inviteActionId === i.id;
                              const statusClass =
                                k === "pending"
                                  ? "team-invite-status team-invite-status--pending"
                                  : k === "accepted"
                                    ? "team-invite-status team-invite-status--accepted"
                                    : k === "cancelled"
                                      ? "team-invite-status team-invite-status--cancelled"
                                      : "team-invite-status";
                              return (
                                <li key={i.id} className="team-invite-card">
                                  <div className="team-invite-card-main">
                                    <div className="team-invite-card-line">
                                      <span className="team-invite-email" title={i.email}>{i.email}</span>
                                      <span className="team-invite-role">{INVITE_ROLE_LABELS[i.role]}</span>
                                      <span className={statusClass}>{inviteStatusLabel(i.status)}</span>
                                    </div>
                                    <div className="team-invite-card-meta">
                                      Создано: {formatRuDate(i.createdAt)}
                                      {k === "cancelled" && i.cancelledAt
                                        ? ` · Отменено: ${formatRuDate(i.cancelledAt)}`
                                        : null}
                                      {k === "accepted" && i.acceptedAt
                                        ? ` · Принято: ${formatRuDate(i.acceptedAt)}`
                                        : null}
                                    </div>
                                  </div>
                                  <div className="team-invite-card-actions">
                                    {k === "pending" ? (
                                      <>
                                        <button
                                          type="button"
                                          className="team-page-btn"
                                          disabled={busy}
                                          onClick={() => void onCopyInviteLink(i)}
                                        >
                                          Скопировать ссылку
                                        </button>
                                        <button
                                          type="button"
                                          className="team-page-btn"
                                          disabled={busy}
                                          onClick={() => void onCancelInvite(i)}
                                        >
                                          {busy ? "…" : "Отменить"}
                                        </button>
                                        <button
                                          type="button"
                                          className="team-page-btn team-page-btn--danger"
                                          disabled={busy}
                                          onClick={() => void onDeleteInvite(i)}
                                        >
                                          Удалить
                                        </button>
                                      </>
                                    ) : k === "accepted" ? (
                                      <span className="team-page-muted">В команде</span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="team-page-btn team-page-btn--danger"
                                        disabled={busy}
                                        onClick={() => void onDeleteInvite(i)}
                                      >
                                        {busy ? "Удаляем…" : "Удалить из списка"}
                                      </button>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </section>
                    );
                  })() : null}
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
                <div className="team-modal-field">
                  <RoleSelect
                    label="Роль"
                    value={inviteRole}
                    options={(Object.keys(INVITE_ROLE_LABELS) as CompanyInvite["role"][])
                      .filter((r) => inviteRoleAllowedForActor(role ?? "viewer", r))
                      .map<RoleOption<CompanyInvite["role"]>>((r) => ({
                        value: r,
                        label: INVITE_ROLE_LABELS[r],
                        description: ROLE_DESCRIPTIONS[r],
                      }))}
                    onChange={(next) => setInviteRole(next)}
                    disabled={inviteBusy}
                    ariaLabel="Роль приглашённого сотрудника"
                  />
                </div>
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
