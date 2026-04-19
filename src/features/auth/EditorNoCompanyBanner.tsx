import { type FormEvent, useState } from "react";

import { createWorkspaceForLoggedInUser } from "@/features/auth/authActions";
import { useAuth } from "@/features/auth/AuthProvider";
import { DEFAULT_COMPANY_NAME } from "@/features/auth/firestoreOrgWrites";

import "./editorNoCompanyBanner.css";

export function EditorNoCompanyBanner() {
  const { isAuthenticated, profile, refreshSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(DEFAULT_COMPANY_NAME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated || profile?.activeCompanyId) {
    return null;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createWorkspaceForLoggedInUser(name.trim() || DEFAULT_COMPANY_NAME);
      setOpen(false);
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать компанию.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="editor-co-banner" role="status">
        <span className="editor-co-banner-text">Создайте рабочее пространство, чтобы сохранять проекты.</span>
        <button type="button" className="editor-co-banner-btn" onClick={() => setOpen(true)}>
          Создать компанию
        </button>
      </div>
      {open ? (
        <div className="editor-co-modal-root" role="presentation">
          <button type="button" className="editor-co-modal-backdrop" aria-label="Закрыть" onClick={() => !busy && setOpen(false)} />
          <div className="editor-co-modal" role="dialog" aria-modal="true" aria-labelledby="editor-co-modal-title">
            <h2 id="editor-co-modal-title" className="editor-co-modal-title">
              Новая компания
            </h2>
            <form onSubmit={(e) => void onSubmit(e)}>
              {error ? (
                <div className="editor-co-modal-error" role="alert">
                  {error}
                </div>
              ) : null}
              <label className="editor-co-modal-label">
                Название компании / бригады
                <input
                  className="editor-co-modal-input"
                  value={name}
                  onChange={(ev) => setName(ev.target.value)}
                  disabled={busy}
                />
              </label>
              <div className="editor-co-modal-actions">
                <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
                  Отмена
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? "Создаём…" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
