import { useEffect, useState } from "react";

import type { SlabStructuralPurpose } from "@/core/domain/slab";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function AddSlabModal() {
  const open = useAppStore((s) => s.addSlabModalOpen);
  const close = useAppStore((s) => s.closeAddSlabModal);
  const apply = useAppStore((s) => s.applyAddSlabModal);
  const purposeFromModal = useAppStore((s) => s.addSlabModalPurpose);
  const stickyByPurpose = useAppStore((s) => s.lastSlabPlacementParamsByPurpose);
  const session = useAppStore((s) => s.slabPlacementSession);

  const role: SlabStructuralPurpose | null = session?.draft.purpose ?? purposeFromModal;

  const [depthMm, setDepthMm] = useState(1000);
  const [levelMm, setLevelMm] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (session) {
      setDepthMm(session.draft.depthMm);
      setLevelMm(session.draft.levelMm);
      return;
    }
    if (purposeFromModal == null) {
      return;
    }
    const sticky = stickyByPurpose[purposeFromModal];
    setDepthMm(sticky.depthMm);
    setLevelMm(sticky.levelMm);
  }, [open, purposeFromModal, session, stickyByPurpose]);

  if (!open) {
    return null;
  }
  if (role == null) {
    return null;
  }

  const submit = () => {
    apply({
      depthMm: Number(depthMm),
      levelMm: Number(levelMm),
    });
  };

  const title = session ? "Параметры плиты" : role === "foundation" ? "Добавить плиту (фундамент)" : "Добавить плиту (перекрытие)";

  const description =
    role === "foundation"
      ? "Фундаментная плита на активном слое: те же параметры, что и у плиты перекрытия; глубина — вниз от верха, уровень — над расчётным низом слоя (мм)."
      : "Плита перекрытия на активном слое. Глубина — толщина вниз от верхней плоскости. Уровень — отметка верхней плоскости над расчётным низом слоя (мм), как у свай; в 3D суммируется с базой слоя (абсолютный или относительный режим в параметрах слоя).";

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slab-add-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="slab-add-title" className="lm-title">
          {title}
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
          {description}
        </p>
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
          <span className="lm-label">Уровень верха в слое (мм)</span>
          <input
            className="lm-input"
            type="number"
            step={1}
            value={levelMm}
            onChange={(e) => setLevelMm(Number(e.target.value))}
          />
        </label>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.45 }}>
          Режим контура (прямоугольник / полилиния) выберите на правой панели после «Применить».
        </p>
        <div className="lm-actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
            Отмена
          </button>
          <button type="button" className="lm-btn lm-btn--primary" onClick={submit}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
