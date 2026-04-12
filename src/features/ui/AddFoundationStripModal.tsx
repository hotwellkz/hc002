import { useEffect, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import type { FoundationStripBuildMode } from "@/store/useAppStore";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function AddFoundationStripModal() {
  const open = useAppStore((s) => s.addFoundationStripModalOpen);
  const close = useAppStore((s) => s.closeAddFoundationStripModal);
  const apply = useAppStore((s) => s.applyAddFoundationStripModal);
  const session = useAppStore((s) => s.foundationStripPlacementSession);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const [depthMm, setDepthMm] = useState(400);
  const [side1Mm, setSide1Mm] = useState(50);
  const [side2Mm, setSide2Mm] = useState(250);
  const [buildMode, setBuildMode] = useState<FoundationStripBuildMode>("linear");

  useEffect(() => {
    if (!open) {
      return;
    }
    setDepthMm(400);
    setSide1Mm(50);
    setSide2Mm(250);
    setBuildMode("linear");
  }, [open]);

  useEffect(() => {
    if (open) {
      clearApplyError();
    }
  }, [open, clearApplyError]);

  if (!open) {
    return null;
  }

  const submit = () =>
    runApply(() => {
      apply({
        depthMm: Number(depthMm),
        side1Mm: Number(side1Mm),
        side2Mm: Number(side2Mm),
        buildMode,
      });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.addFoundationStripModalOpen, s.lastError);
    });

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="afs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="afs-title" className="lm-title">
          {session ? "Параметры ленты" : "Добавить ленту"}
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
          Лента создаётся на активном слое. Сторона 1 — наружу контура дома, сторона 2 — внутрь. Для привязки
          включите видимость слоя со стенами.
        </p>
        <label className="lm-field">
          <span className="lm-label">Режим</span>
          <select
            className="lm-input"
            value={buildMode}
            onChange={(e) => setBuildMode(e.target.value as FoundationStripBuildMode)}
          >
            <option value="linear">Линейно (две точки)</option>
            <option value="rectangle">Прямоугольник (два угла)</option>
          </select>
        </label>
        <label className="lm-field">
          <span className="lm-label">Глубина (мм)</span>
          <input
            className="lm-input"
            type="number"
            min={1}
            step={1}
            value={depthMm}
            onChange={(e) => setDepthMm(Number(e.target.value))}
          />
        </label>
        <label className="lm-field">
          <span className="lm-label">Сторона 1 (мм)</span>
          <input
            className="lm-input"
            type="number"
            min={0}
            step={1}
            value={side1Mm}
            onChange={(e) => setSide1Mm(Number(e.target.value))}
          />
        </label>
        <label className="lm-field">
          <span className="lm-label">Сторона 2 (мм)</span>
          <input
            className="lm-input"
            type="number"
            min={0}
            step={1}
            value={side2Mm}
            onChange={(e) => setSide2Mm(Number(e.target.value))}
          />
        </label>
        {applyError ? (
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 12, color: "var(--danger, #b91c1c)" }} role="alert">
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
            onClick={() => void submit()}
            disabled={isSubmitting}
          >
            {isSubmitting ? "…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
