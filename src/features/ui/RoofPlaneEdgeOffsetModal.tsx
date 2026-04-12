import { useEffect, useId, useRef, useState } from "react";

import { roofPlaneEditModalBridge } from "@/features/editor2d/roofPlaneEditModalBridge";
import { useAppStore } from "@/store/useAppStore";

import "./wall-coordinate-modal.css";

export function RoofPlaneEdgeOffsetModal() {
  const ctx = useAppStore((s) => s.roofPlaneEdgeOffsetModal);
  const close = useAppStore((s) => s.closeRoofPlaneEdgeOffsetModal);
  const applyStore = useAppStore((s) => s.applyRoofPlaneEdgeOffsetModal);
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
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [ctx]);

  if (!ctx) {
    return null;
  }

  const cancel = () => {
    roofPlaneEditModalBridge.onEdgeOffsetCancelled?.();
    close();
  };

  const submit = () => {
    const raw = str.trim().replace(/,/g, ".");
    if (raw === "" || raw === "-" || raw === "+") {
      setErr("Введите число в миллиметрах");
      return;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      setErr("Некорректное число");
      return;
    }
    applyStore(v);
    roofPlaneEditModalBridge.onEdgeOffsetApplied?.();
  };

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
        <div className="wcm-actions">
          <button type="button" className="wcm-btn wcm-btn--ghost" onClick={cancel}>
            Отмена
          </button>
          <button type="button" className="wcm-btn wcm-btn--primary" onClick={submit}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
