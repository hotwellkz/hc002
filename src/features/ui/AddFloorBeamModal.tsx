import { useEffect, useMemo, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { computedLayerBaseMm } from "@/core/domain/layerVerticalStack";
import { getLayerById } from "@/core/domain/layerOps";
import { isProfileUsableForFloorBeam } from "@/core/domain/floorBeamSection";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function AddFloorBeamModal() {
  const open = useAppStore((s) => s.addFloorBeamModalOpen);
  const close = useAppStore((s) => s.closeAddFloorBeamModal);
  const apply = useAppStore((s) => s.applyAddFloorBeamModal);
  const openProfiles = useAppStore((s) => s.openProfilesModal);
  const project = useAppStore((s) => s.currentProject);
  const beamSession = useAppStore((s) => s.floorBeamPlacementSession);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const [profileId, setProfileId] = useState("");
  const [elevationMm, setElevationMm] = useState(0);
  const [sectionRolled, setSectionRolled] = useState(true);

  const beamProfiles = useMemo(
    () => project.profiles.filter((pr) => isProfileUsableForFloorBeam(pr)).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [project.profiles],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const st = useAppStore.getState();
    const p = st.currentProject;
    const draft = st.floorBeamPlacementSession?.draft;
    const active = getLayerById(p, p.activeLayerId);
    const base = active ? computedLayerBaseMm(p, active.id) : 0;
    if (draft && beamProfiles.some((pr) => pr.id === draft.profileId)) {
      setProfileId(draft.profileId);
      setElevationMm(draft.baseElevationMm);
      setSectionRolled(draft.sectionRolled);
      return;
    }
    const first = beamProfiles[0];
    setProfileId(first?.id ?? "");
    setElevationMm(base);
    setSectionRolled(true);
  }, [open, beamProfiles]);

  useEffect(() => {
    if (open) {
      clearApplyError();
    }
  }, [open, clearApplyError]);

  if (!open) {
    return null;
  }

  if (beamProfiles.length === 0) {
    return (
      <div className="lm-backdrop" role="presentation" onClick={close}>
        <div
          className="lm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="afb-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="afb-title" className="lm-title">
            Добавить балку
          </h2>
          <p className="lm-muted">
            Нет подходящих профилей. Создайте профиль категории «доска», «балка» или др. (не «стена») в библиотеке
            профилей.
          </p>
          <div className="lm-actions">
            <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
              Закрыть
            </button>
            <button type="button" className="lm-btn lm-btn--primary" onClick={() => openProfiles()}>
              Профили
            </button>
          </div>
        </div>
      </div>
    );
  }

  const submit = () =>
    runApply(() => {
      if (!profileId) {
        return false;
      }
      apply({ profileId, baseElevationMm: elevationMm, sectionRolled });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.addFloorBeamModalOpen, s.lastError);
    });

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog lm-dialog--floor-beam-params"
        role="dialog"
        aria-modal="true"
        aria-labelledby="afb-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="afb-title" className="lm-title">
          {beamSession ? "Параметры балки" : "Добавить балку"}
        </h2>
        <label className="lm-field">
          <span className="lm-label">Профиль</span>
          <select className="lm-input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {beamProfiles.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lm-field">
          <span className="lm-label">Уровень (низ балки, мировые мм)</span>
          <input
            className="lm-input"
            type="number"
            step={1}
            value={elevationMm}
            onChange={(e) => setElevationMm(Number(e.target.value))}
          />
        </label>
        <div className="lm-field lm-field--checkbox-inline">
          <label className="lm-checkbox-row" htmlFor="afb-section-rolled">
            <input
              id="afb-section-rolled"
              className="lm-checkbox-row__input"
              type="checkbox"
              checked={sectionRolled}
              onChange={(e) => setSectionRolled(e.target.checked)}
            />
            <span className="lm-checkbox-row__text">Развернуть профиль (ребро / плашмя)</span>
          </label>
        </div>
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
