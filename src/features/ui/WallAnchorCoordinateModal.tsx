import { useEffect, useId, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { useAppStore } from "@/store/useAppStore";

import "./wall-coordinate-modal.css";

export function WallAnchorCoordinateModal() {
  const open = useAppStore((s) => s.wallAnchorCoordinateModalOpen);
  const close = useAppStore((s) => s.closeWallAnchorCoordinateModal);
  const apply = useAppStore((s) => s.applyWallAnchorCoordinateModal);
  const lastError = useAppStore((s) => s.lastError);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const titleId = useId();
  const [xStr, setXStr] = useState("0");
  const [yStr, setYStr] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);

  /** Снимок при открытии; без привязки к движению мыши после открытия. */
  useEffect(() => {
    if (!open) {
      return;
    }
    const st = useAppStore.getState();
    const anchor = st.wallPlacementAnchorMm;
    const preview = st.wallPlacementAnchorPreviewEndMm;
    if (!anchor) {
      return;
    }
    if (preview) {
      setXStr(String(Math.round(preview.x - anchor.x)));
      setYStr(String(Math.round(preview.y - anchor.y)));
    } else {
      setXStr("0");
      setYStr("0");
    }
    setLocalError(null);
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

  const dxParsed = Number(xStr.replace(",", "."));
  const dyParsed = Number(yStr.replace(",", "."));
  const dShow =
    Number.isFinite(dxParsed) && Number.isFinite(dyParsed) ? Math.round(Math.hypot(dxParsed, dyParsed)) : "—";
  const angleShow =
    Number.isFinite(dxParsed) && Number.isFinite(dyParsed)
      ? Math.round((((Math.atan2(dyParsed, dxParsed) * 180) / Math.PI) + 360) % 360)
      : "—";

  const submit = () =>
    runApply(() => {
      setLocalError(null);
      const dx = Number(xStr.replace(",", "."));
      const dy = Number(yStr.replace(",", "."));
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        setLocalError("Введите числовые значения X и Y (мм).");
        return false;
      }
      apply({ dxMm: dx, dyMm: dy });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.wallAnchorCoordinateModalOpen, s.lastError);
    });

  const err = localError ?? lastError ?? applyError;

  return (
    <div className="wcm-backdrop" role="presentation" onClick={close}>
      <form
        className="wcm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id={titleId} className="wcm-title">
          Координаты
        </h2>
        <p className="wcm-hint">Смещение начала стены относительно опорной точки (мм). Знак учитывается.</p>
        <div className="wcm-fields">
          <label className="wcm-field">
            <span className="wcm-label">X</span>
            <input
              className="wcm-input"
              type="text"
              inputMode="decimal"
              value={xStr}
              onChange={(e) => {
                setXStr(e.target.value);
                setLocalError(null);
              }}
              autoFocus
            />
          </label>
          <label className="wcm-field">
            <span className="wcm-label">Y</span>
            <input
              className="wcm-input"
              type="text"
              inputMode="decimal"
              value={yStr}
              onChange={(e) => {
                setYStr(e.target.value);
                setLocalError(null);
              }}
            />
          </label>
          <div className="wcm-field wcm-field--readonly">
            <span className="wcm-label">D</span>
            <span className="wcm-readonly" title="Длина (мм)">
              {dShow}
            </span>
          </div>
          <div className="wcm-field wcm-field--readonly">
            <span className="wcm-label">∠</span>
            <span className="wcm-readonly" title="Угол от +X, °">
              {angleShow}
            </span>
          </div>
        </div>
        {err ? (
          <p className="wcm-error" role="alert">
            {err}
          </p>
        ) : null}
        <div className="wcm-actions">
          <button type="button" className="wcm-btn wcm-btn--ghost" onClick={close}>
            Отмена
          </button>
          <button type="submit" className="wcm-btn wcm-btn--primary" disabled={isSubmitting}>
            {isSubmitting ? "…" : "Применить"}
          </button>
        </div>
      </form>
    </div>
  );
}
