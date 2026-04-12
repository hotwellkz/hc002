import { useEffect, useId, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { useAppStore } from "@/store/useAppStore";

import "./project-origin-coordinate-modal.css";

export function ProjectOriginCoordinateModal() {
  const open = useAppStore((s) => s.projectOriginCoordinateModalOpen);
  const close = useAppStore((s) => s.closeProjectOriginCoordinateModal);
  const apply = useAppStore((s) => s.applyProjectOriginCoordinateModalWorldMm);
  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);
  const titleId = useId();
  const [xStr, setXStr] = useState("0");
  const [yStr, setYStr] = useState("0");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const p = useAppStore.getState().currentProject.projectOrigin;
    setXStr(String(Math.round(p?.x ?? 0)));
    setYStr(String(Math.round(p?.y ?? 0)));
    setErr(null);
    clearApplyError();
  }, [open, clearApplyError]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) {
    return null;
  }

  const submit = () =>
    runApply(() => {
      setErr(null);
      const x = Number(xStr.replace(",", "."));
      const y = Number(yStr.replace(",", "."));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        setErr("Введите числовые X и Y (мм, мир).");
        return false;
      }
      apply({ x, y });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.projectOriginCoordinateModalOpen, s.lastError);
    });

  return (
    <div
      className="pocm-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          close();
        }
      }}
    >
      <div
        className="pocm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pocm-title" id={titleId}>
          Базовая точка проекта
        </div>
        <p className="pocm-hint">Мировые координаты XY (мм), где будет начало отсчёта. Геометрия дома не смещается.</p>
        <div className="pocm-row">
          <label className="pocm-label">
            X (мм)
            <input
              className="pocm-input"
              value={xStr}
              inputMode="decimal"
              onChange={(e) => setXStr(e.target.value)}
              autoFocus
            />
          </label>
          <label className="pocm-label">
            Y (мм)
            <input
              className="pocm-input"
              value={yStr}
              inputMode="decimal"
              onChange={(e) => setYStr(e.target.value)}
            />
          </label>
        </div>
        {err ? <div className="pocm-err">{err}</div> : null}
        {applyError ? <div className="pocm-err">{applyError}</div> : null}
        <div className="pocm-actions">
          <button type="button" className="pocm-btn pocm-btn--ghost" onClick={() => close()}>
            Отмена
          </button>
          <button
            type="button"
            className="pocm-btn pocm-btn--primary"
            disabled={isSubmitting}
            onClick={() => void submit()}
          >
            {isSubmitting ? "…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
