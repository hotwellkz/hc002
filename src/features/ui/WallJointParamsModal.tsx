import { useEffect, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import type { WallJointKind } from "@/core/domain/wallJoint";
import { useAppStore } from "@/store/useAppStore";

import "./wall-joint-modal.css";

function CardButt({
  selected,
  onSelect,
}: {
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`wj-card ${selected ? "wj-card--selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <svg className="wj-card__icon" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="8" y="28" width="40" height="12" fill="currentColor" opacity="0.85" rx="1" />
        <rect x="36" y="8" width="12" height="28" fill="currentColor" opacity="0.85" rx="1" />
        <line x1="36" y1="28" x2="48" y2="28" stroke="var(--color-accent)" strokeWidth="3" />
      </svg>
      <span className="wj-card__label">Стык внахлёст</span>
      <span className="wj-card__hint">Главная до угла, вторая укорачивается</span>
    </button>
  );
}

function CardMiter({
  selected,
  onSelect,
}: {
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`wj-card ${selected ? "wj-card--selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <svg className="wj-card__icon" viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M 18 44 L 44 18 L 44 44 Z"
          fill="currentColor"
          opacity="0.85"
        />
        <path d="M 18 44 L 44 18" stroke="var(--color-accent)" strokeWidth="3" fill="none" />
      </svg>
      <span className="wj-card__label">Митра</span>
      <span className="wj-card__hint">Скос торцов без зазора</span>
    </button>
  );
}

function CardTee({
  selected,
  onSelect,
}: {
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`wj-card ${selected ? "wj-card--selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <svg className="wj-card__icon" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="8" y="28" width="48" height="10" fill="currentColor" opacity="0.85" rx="1" />
        <rect x="30" y="8" width="10" height="24" fill="currentColor" opacity="0.85" rx="1" />
        <circle cx="35" cy="33" r="3" fill="var(--color-accent)" />
      </svg>
      <span className="wj-card__label">Т-образное примыкание</span>
      <span className="wj-card__hint">Основная проходная, вторая примыкает</span>
    </button>
  );
}

export function WallJointParamsModal() {
  const open = useAppStore((s) => s.wallJointParamsModalOpen);
  const close = useAppStore((s) => s.closeWallJointParamsModal);
  const apply = useAppStore((s) => s.applyWallJointParamsModal);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const [kind, setKind] = useState<WallJointKind>("CORNER_BUTT");

  useEffect(() => {
    if (open) {
      setKind("CORNER_BUTT");
      clearApplyError();
    }
  }, [open, clearApplyError]);

  if (!open) {
    return null;
  }

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog wj-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wj-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wj-title" className="lm-title">
          Параметры
        </h2>
        <p className="wj-sub">Тип углового соединения стен</p>
        <div className="wj-grid">
          <CardButt selected={kind === "CORNER_BUTT"} onSelect={() => setKind("CORNER_BUTT")} />
          <CardMiter selected={kind === "CORNER_MITER"} onSelect={() => setKind("CORNER_MITER")} />
          <CardTee selected={kind === "T_ABUTMENT"} onSelect={() => setKind("T_ABUTMENT")} />
        </div>
        {applyError ? (
          <p className="wj-sub" style={{ color: "var(--danger, #b91c1c)" }} role="alert">
            {applyError}
          </p>
        ) : null}
        <div className="lm-actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
            Отмена
          </button>
          <button
            type="button"
            className="lm-btn lm-btn--primary"
            disabled={isSubmitting}
            onClick={() =>
              void runApply(() => {
                apply(kind);
                const s = useAppStore.getState();
                return finishStoreModalApply(s.wallJointParamsModalOpen, s.lastError);
              })
            }
          >
            {isSubmitting ? "…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
