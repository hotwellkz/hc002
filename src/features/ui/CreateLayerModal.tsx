import { useEffect, useState } from "react";

import { getLayerById } from "@/core/domain/layerOps";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

interface CreateLayerModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function CreateLayerModal({ open, onClose }: CreateLayerModalProps) {
  const project = useAppStore((s) => s.currentProject);
  const createLayer = useAppStore((s) => s.createLayer);
  const [name, setName] = useState("Новый слой");
  const [elevationMm, setElevationMm] = useState(0);

  const active = getLayerById(project, project.activeLayerId);

  useEffect(() => {
    if (open && active) {
      setName("Новый слой");
      setElevationMm(active.elevationMm);
    }
  }, [open, active]);

  if (!open) {
    return null;
  }

  const submit = () => {
    const n = name.trim();
    if (!n) {
      return;
    }
    createLayer({ name: n, elevationMm: Number.isFinite(elevationMm) ? elevationMm : 0 });
    onClose();
  };

  return (
    <div className="lm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lm-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lm-create-title" className="lm-title">
          Новый слой
        </h2>
        <label className="lm-field">
          <span className="lm-label">Название</span>
          <input
            className="lm-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="lm-field">
          <span className="lm-label">Отметка, мм</span>
          <input
            className="lm-input"
            type="number"
            value={elevationMm}
            onChange={(e) => setElevationMm(Number(e.target.value))}
          />
        </label>
        <div className="lm-actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="lm-btn lm-btn--primary" onClick={submit}>
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}
