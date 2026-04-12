import { useEffect, useId, useRef, useState } from "react";

import { roofPlaneEditModalBridge } from "@/features/editor2d/roofPlaneEditModalBridge";
import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { useAppStore } from "@/store/useAppStore";

import "./wall-coordinate-modal.css";

export function RoofPlaneEdgeOffsetModal() {
  const ctx = useAppStore((s) => s.roofPlaneEdgeOffsetModal);
  const close = useAppStore((s) => s.closeRoofPlaneEdgeOffsetModal);
  const applyStore = useAppStore((s) => s.applyRoofPlaneEdgeOffsetModal);
  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [str, setStr] = useState("0");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx) {
      return;
    }
    setStr(ctx.initialValueStr);
    setErr(null);
    clearApplyError();
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [ctx, clearApplyError]);

  if (!ctx) {
    return null;
  }

  const cancel = () => {
    roofPlaneEditModalBridge.onEdgeOffsetCancelled?.();
    close();
  };

  const submit = () =>
    runApply(() => {
      const raw = str.trim().replace(/,/g, ".");
      if (raw === "" || raw === "-" || raw === "+") {
        setErr("Введите число в миллиметрах");
        return false;
      }
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        setErr("Некорректное число");
        return false;
      }
      applyStore(v);
      const s = useAppStore.getState();
      if (!s.roofPlaneEdgeOffsetModal) {
        roofPlaneEditModalBridge.onEdgeOffsetApplied?.();
        return;
      }
      return finishStoreModalApply(true, s.lastError);
    });

  return (
    <div
      className="wcm-backdrop"
      role="presentation"
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      }}
    >
      <div
        className="wcm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <h2 id={titleId} className="wcm-title">
          Введите значение
        </h2>
        <div className="wcm-fields">
          <div className="wcm-field">
            <label className="wcm-label" htmlFor="roof-edge-offset-mm">
              Смещение (мм)
            </label>
            <input
              id="roof-edge-offset-mm"
              ref={inputRef}
              className="wcm-input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={str}
              onChange={(e) => {
                setStr(e.target.value);
                setErr(null);
              }}
            />
          </div>
        </div>
        {err ? <p className="wcm-error">{err}</p> : null}
        {applyError ? (
          <p className="wcm-error" role="alert">
            {applyError}
          </p>
        ) : null}
        <div className="wcm-actions">
          <button type="button" className="wcm-btn wcm-btn--ghost" onClick={cancel}>
            Отмена
          </button>
          <button type="button" className="wcm-btn wcm-btn--primary" disabled={isSubmitting} onClick={() => void submit()}>
            {isSubmitting ? "…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
