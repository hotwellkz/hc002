import { useEffect, useMemo, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { getConnectedFoundationStripsOnLayer } from "@/core/domain/foundationStripMerge";
import type { FoundationStripAutoPileSettings } from "@/core/domain/foundationStrip";
import { defaultFoundationStripAutoPileSettings } from "@/core/domain/foundationStripAutoPiles";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function FoundationStripAutoPilesModal() {
  const modal = useAppStore((s) => s.foundationStripAutoPilesModal);
  const close = useAppStore((s) => s.closeFoundationStripAutoPilesModal);
  const apply = useAppStore((s) => s.applyFoundationStripAutoPiles);
  const project = useAppStore((s) => s.currentProject);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const groupInfo = useMemo(() => {
    if (!modal) {
      return null;
    }
    const seed = project.foundationStrips.find((s) => s.id === modal.seedStripId);
    if (!seed) {
      return null;
    }
    const group = getConnectedFoundationStripsOnLayer(project.foundationStrips, seed.layerId, modal.seedStripId);
    const persisted = group.map((s) => s.autoPile?.settings).find(Boolean);
    return { seed, group, persisted };
  }, [modal, project.foundationStrips]);

  const [pileKind, setPileKind] = useState<FoundationStripAutoPileSettings["pileKind"]>("reinforcedConcrete");
  const [maxStepMm, setMaxStepMm] = useState(3000);
  const [depthBelowStripMm, setDepthBelowStripMm] = useState(1000);
  const [placeAtCorners, setPlaceAtCorners] = useState(true);
  const [placeAtJoints, setPlaceAtJoints] = useState(true);
  const [centerIntermediate, setCenterIntermediate] = useState(true);

  useEffect(() => {
    if (!modal) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, close]);

  useEffect(() => {
    if (!modal || !groupInfo) {
      return;
    }
    const base = groupInfo.persisted ?? defaultFoundationStripAutoPileSettings();
    setPileKind(base.pileKind);
    setMaxStepMm(base.maxStepMm);
    setDepthBelowStripMm(base.depthBelowStripMm);
    setPlaceAtCorners(base.placeAtCorners);
    setPlaceAtJoints(base.placeAtJoints);
    setCenterIntermediate(base.centerIntermediate);
  }, [modal, groupInfo]);

  useEffect(() => {
    if (modal) {
      clearApplyError();
    }
  }, [modal, clearApplyError]);

  if (!modal || !groupInfo) {
    return null;
  }

  const { seed, group } = groupInfo;

  const readSettings = (): FoundationStripAutoPileSettings => ({
    pileKind,
    maxStepMm: Number(maxStepMm),
    depthBelowStripMm: Number(depthBelowStripMm),
    placeAtCorners,
    placeAtJoints,
    centerIntermediate,
    replaceExistingAuto: true,
  });

  const runAction = (action: "buildNew" | "update" | "delete") =>
    runApply(() => {
      apply(action, readSettings());
      const s = useAppStore.getState();
      return finishStoreModalApply(s.foundationStripAutoPilesModal != null, s.lastError);
    });

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fsap-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="fsap-title" className="lm-title">
          Лента фундамента — авто-сваи
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
          Связанных участков ленты в группе: {group.length}. Сваи ставятся по оси полосы (центр ширины), верх ствола на
          отметке «−глубина ленты», длина вниз — по полю ниже. Двойной клик по ленте открывает эту группу.
        </p>

        <h3 className="lm-title" style={{ fontSize: 15, margin: "0 0 10px" }}>
          Авто-сваи
        </h3>

        <label className="lm-field">
          <span className="lm-label">Тип сваи</span>
          <select
            className="lm-input"
            value={pileKind}
            onChange={(e) => setPileKind(e.target.value as FoundationStripAutoPileSettings["pileKind"])}
          >
            <option value="reinforcedConcrete">Железобетонная</option>
            <option value="screw" disabled>
              Винтовая (скоро)
            </option>
          </select>
        </label>

        <label className="lm-field">
          <span className="lm-label">Макс. шаг между сваями (мм)</span>
          <input
            className="lm-input"
            type="number"
            min={100}
            step={50}
            value={maxStepMm}
            onChange={(e) => setMaxStepMm(Number(e.target.value))}
          />
        </label>

        <label className="lm-field">
          <span className="lm-label">Глубина сваи ниже низа ленты (мм)</span>
          <input
            className="lm-input"
            type="number"
            min={1}
            step={100}
            value={depthBelowStripMm}
            onChange={(e) => setDepthBelowStripMm(Number(e.target.value))}
          />
        </label>

        <label className="lm-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={placeAtCorners} onChange={(e) => setPlaceAtCorners(e.target.checked)} />
          <span className="lm-label">Ставить сваи по углам</span>
        </label>

        <label className="lm-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={placeAtJoints} onChange={(e) => setPlaceAtJoints(e.target.checked)} />
          <span className="lm-label">Ставить сваи по стыкам / узлам (T-образные примыкания)</span>
        </label>

        <label className="lm-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={centerIntermediate}
            onChange={(e) => setCenterIntermediate(e.target.checked)}
          />
          <span className="lm-label">Центрировать промежуточные сваи (равномерный шаг между опорными)</span>
        </label>

        {applyError ? (
          <p className="muted" style={{ marginTop: 8, fontSize: 12, color: "var(--danger, #b91c1c)" }} role="alert">
            {applyError}
          </p>
        ) : null}

        <div className="lm-actions" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="lm-btn lm-btn--primary"
            disabled={isSubmitting}
            onClick={() => void runAction("buildNew")}
          >
            {isSubmitting ? "…" : "Построить сваи"}
          </button>
          <button type="button" className="lm-btn lm-btn--ghost" disabled={isSubmitting} onClick={() => void runAction("update")}>
            Обновить сваи
          </button>
          <button type="button" className="lm-btn lm-btn--ghost" disabled={isSubmitting} onClick={() => void runAction("delete")}>
            Удалить авто-сваи
          </button>
          <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
            Закрыть
          </button>
        </div>
        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Слой: {project.layers.find((l) => l.id === seed.layerId)?.name ?? seed.layerId}. Сечение сваи берётся по
          ширине ленты (max сторона1+2 в группе), округление 200–600 мм.
        </p>
      </div>
    </div>
  );
}
