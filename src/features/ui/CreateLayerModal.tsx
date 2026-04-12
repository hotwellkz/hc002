import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { LAYER_DOMAIN_LABELS, editor2dPlanScopeToLayerDomain } from "@/core/domain/layerDomain";
import { getLayerById } from "@/core/domain/layerOps";
import { useModalApplyClose } from "@/shared/modalSubmit";
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
  const scopeDomain =
    project.viewState.activeTab === "2d"
      ? editor2dPlanScopeToLayerDomain(project.viewState.editor2dPlanScope)
      : "floorPlan";

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(onClose);

  useEffect(() => {
    if (open) {
      clearApplyError();
    }
  }, [open, clearApplyError]);

  useEffect(() => {
    if (open && active) {
      setName("Новый слой");
      setElevationMm(active.elevationMm);
    }
  }, [open, active]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const submit = () =>
    runApply(() => {
      const n = name.trim();
      if (!n) {
        return false;
      }
      createLayer({ name: n, elevationMm: Number.isFinite(elevationMm) ? elevationMm : 0 });
    });

  const modal = (
    <div
      className="lm-backdrop lm-backdrop--root"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="lm-dialog lm-dialog--scrollable"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lm-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lm-create-title" className="lm-title">
          Новый слой
        </h2>
        <p className="lm-micro" style={{ marginTop: "-0.25rem", marginBottom: "0.75rem" }}>
          Раздел: <strong>{LAYER_DOMAIN_LABELS[scopeDomain]}</strong> (как в выбранном режиме слева на 2D).
        </p>
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
        {applyError ? (
          <p className="lm-micro" role="alert" style={{ color: "var(--danger, #b91c1c)" }}>
            {applyError}
          </p>
        ) : null}
        <div className="lm-actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={onClose} disabled={isSubmitting}>
            Отмена
          </button>
          <button type="button" className="lm-btn lm-btn--primary" disabled={isSubmitting} onClick={() => void submit()}>
            {isSubmitting ? "Создание…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
