import { useEffect, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { getLayerById } from "@/core/domain/layerOps";
import { computedLayerBaseMm } from "@/core/domain/layerVerticalStack";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function AddWallModal() {
  const open = useAppStore((s) => s.addWallModalOpen);
  const close = useAppStore((s) => s.closeAddWallModal);
  const apply = useAppStore((s) => s.applyAddWallModal);
  const openProfiles = useAppStore((s) => s.openProfilesModal);
  const project = useAppStore((s) => s.currentProject);
  const wallToolSession = useAppStore((s) => s.wallPlacementSession);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const [profileId, setProfileId] = useState("");
  const [heightMm, setHeightMm] = useState(2500);
  const [elevationMm, setElevationMm] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    const st = useAppStore.getState();
    const p = st.currentProject;
    const draft = st.wallPlacementSession?.draft;
    const wallProfiles = p.profiles.filter((pr) => pr.category === "wall");
    const first = wallProfiles[0];
    const active = getLayerById(p, p.activeLayerId);
    if (draft && wallProfiles.some((pr) => pr.id === draft.profileId)) {
      setProfileId(draft.profileId);
      setHeightMm(draft.heightMm);
      setElevationMm(draft.baseElevationMm);
      return;
    }
    setProfileId(first?.id ?? "");
    setHeightMm(
      first?.defaultHeightMm != null && Number.isFinite(first.defaultHeightMm) ? first.defaultHeightMm : 2500,
    );
    setElevationMm(active ? computedLayerBaseMm(p, active.id) : 0);
  }, [open]);

  useEffect(() => {
    if (open) {
      clearApplyError();
    }
  }, [open, clearApplyError]);

  if (!open) {
    return null;
  }

  const wallProfiles = project.profiles.filter((pr) => pr.category === "wall");

  if (wallProfiles.length === 0) {
    return (
      <div className="lm-backdrop" role="presentation" onClick={close}>
        <div
          className="lm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="aw-no-prof-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="aw-no-prof-title" className="lm-title">
            Добавить стену
          </h2>
          <p className="muted" style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
            Сначала создайте профиль стены в библиотеке профилей.
          </p>
          <div className="lm-actions">
            <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
              Закрыть
            </button>
            <button
              type="button"
              className="lm-btn lm-btn--primary"
              onClick={() => {
                close();
                openProfiles();
              }}
            >
              Профили…
            </button>
          </div>
        </div>
      </div>
    );
  }

  const submit = () =>
    runApply(() => {
      const id = profileId.trim();
      if (!id) {
        return false;
      }
      const h = Number(heightMm);
      const el = Number(elevationMm);
      if (!(Number.isFinite(h) && h > 0)) {
        return false;
      }
      if (!Number.isFinite(el)) {
        return false;
      }
      apply({ profileId: id, heightMm: h, baseElevationMm: el });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.addWallModalOpen, s.lastError);
    });

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aw-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="aw-title" className="lm-title">
          {wallToolSession ? "Параметры стены" : "Добавить стену"}
        </h2>
        <label className="lm-field">
          <span className="lm-label">Профиль</span>
          <select className="lm-input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {wallProfiles.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lm-field">
          <span className="lm-label">Высота</span>
          <input
            className="lm-input"
            type="number"
            min={1}
            step={1}
            value={heightMm}
            onChange={(e) => setHeightMm(Number(e.target.value))}
          />
        </label>
        <label className="lm-field">
          <span className="lm-label">Уровень</span>
          <input
            className="lm-input"
            type="number"
            step={1}
            value={elevationMm}
            onChange={(e) => setElevationMm(Number(e.target.value))}
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
