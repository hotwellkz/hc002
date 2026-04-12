import { useEffect, useId, useState } from "react";

import type { EntityCopyStrategyId } from "@/core/domain/entityCopySession";
import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { useAppStore } from "@/store/useAppStore";

import "./entity-copy-params-modal.css";

export function EntityCopyParamsModal() {
  const modal = useAppStore((s) => s.entityCopyParamsModal);
  const apply = useAppStore((s) => s.applyEntityCopyParamsModal);
  const close = useAppStore((s) => s.closeEntityCopyParamsModal);
  const lastError = useAppStore((s) => s.lastError);

  const titleId = useId();
  const [countStr, setCountStr] = useState("1");
  const [strategy, setStrategy] = useState<EntityCopyStrategyId>("distributionMinusOne");
  const [localError, setLocalError] = useState<string | null>(null);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  useEffect(() => {
    if (modal) {
      setCountStr("1");
      setStrategy("distributionMinusOne");
      setLocalError(null);
      clearApplyError();
    }
  }, [modal, clearApplyError]);

  useEffect(() => {
    if (!modal) {
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
  }, [modal, close]);

  if (!modal) {
    return null;
  }

  const submit = () =>
    runApply(() => {
      setLocalError(null);
      const n = Number(countStr.replace(",", ".").trim());
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        setLocalError("Введите целое положительное число копий.");
        return false;
      }
      apply({ strategy, count: n });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.entityCopyParamsModal != null, s.lastError);
    });

  const err = localError ?? applyError ?? lastError;

  return (
    <div className="ecpm-backdrop" role="presentation" onClick={close}>
      <div
        className="ecpm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            const el = e.target as HTMLElement | null;
            if (el?.tagName === "TEXTAREA") {
              return;
            }
            e.preventDefault();
            void submit();
          }
        }}
      >
        <h2 id={titleId} className="ecpm-title">
          Параметры копирования
        </h2>
        <p className="ecpm-hint">
          Укажите число новых копий и способ размещения вдоль отрезка между выбранными точками.
        </p>
        <label className="ecpm-field">
          <span className="ecpm-label">Количество объектов</span>
          <input
            className="ecpm-input"
            type="text"
            inputMode="numeric"
            value={countStr}
            onChange={(e) => {
              setCountStr(e.target.value);
              setLocalError(null);
            }}
            autoFocus
          />
        </label>
        <fieldset className="ecpm-fieldset">
          <legend className="ecpm-legend">Режим копирования</legend>
          <label className="ecpm-radio">
            <input
              type="radio"
              name="ecpm-strategy"
              checked={strategy === "increment"}
              onChange={() => setStrategy("increment")}
            />
            <span>Приращение — на i·(P₂−P₁) от точки привязки, i = 1…N</span>
          </label>
          <label className="ecpm-radio">
            <input
              type="radio"
              name="ecpm-strategy"
              checked={strategy === "distribution"}
              onChange={() => setStrategy("distribution")}
            />
            <span>
              Распределение — равномерно по отрезку [P₁,P₂], включая концы (при N=1 — середина)
            </span>
          </label>
          <label className="ecpm-radio">
            <input
              type="radio"
              name="ecpm-strategy"
              checked={strategy === "distributionMinusOne"}
              onChange={() => setStrategy("distributionMinusOne")}
            />
            <span>
              Распределение − 1 — N копий строго внутри интервала: P₁ + (P₂−P₁)·i/(N+1), i = 1…N
            </span>
          </label>
        </fieldset>
        {err ? (
          <p className="ecpm-error" role="alert">
            {err}
          </p>
        ) : null}
        <div className="ecpm-actions">
          <button type="button" className="ecpm-btn ecpm-btn--ghost" onClick={close} disabled={isSubmitting}>
            Отмена
          </button>
          <button type="button" className="ecpm-btn ecpm-btn--primary" disabled={isSubmitting} onClick={() => void submit()}>
            {isSubmitting ? "Применение…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
