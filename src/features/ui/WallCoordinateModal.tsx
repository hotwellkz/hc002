import { useEffect, useId, useState } from "react";

import { useAppStore } from "@/store/useAppStore";

import "./wall-coordinate-modal.css";

export function WallCoordinateModal() {
  const open = useAppStore((s) => s.wallCoordinateModalOpen);
  const close = useAppStore((s) => s.closeWallCoordinateModal);
  const apply = useAppStore((s) => s.applyWallCoordinateModal);
  const session = useAppStore((s) => s.wallPlacementSession);
  const lastError = useAppStore((s) => s.lastError);

  const titleId = useId();
  const [xStr, setXStr] = useState("0");
  const [yStr, setYStr] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !session?.firstPointMm || !session.previewEndMm) {
      return;
    }
    const dx = session.previewEndMm.x - session.firstPointMm.x;
    const dy = session.previewEndMm.y - session.firstPointMm.y;
    setXStr(String(Math.round(dx)));
    setYStr(String(Math.round(dy)));
    setLocalError(null);
  }, [open, session?.firstPointMm, session?.previewEndMm]);

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

  const submit = () => {
    setLocalError(null);
    const dx = Number(xStr.replace(",", "."));
    const dy = Number(yStr.replace(",", "."));
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      setLocalError("Введите числовые значения X и Y (мм).");
      return;
    }
    apply({ dxMm: dx, dyMm: dy });
  };

  const err = localError ?? lastError;

  return (
    <div className="wcm-backdrop" role="presentation" onClick={close}>
      <div
        className="wcm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="wcm-title">
          Координаты
        </h2>
        <p className="wcm-hint">
          Смещение второй точки относительно первой (мм). Знак учитывается.
        </p>
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
            <span className="wcm-readonly" title="Диагональ (мм)">
              {dShow}
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
          <button type="button" className="wcm-btn wcm-btn--primary" onClick={submit}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
