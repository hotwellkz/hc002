import { useEffect, useMemo, useState } from "react";

import type { FloorBeamSplitMode } from "@/core/domain/floorBeamSplitMode";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function FloorBeamSplitModal() {
  const open = useAppStore((s) => s.floorBeamSplitModalOpen);
  const close = useAppStore((s) => s.closeFloorBeamSplitModal);
  const apply = useAppStore((s) => s.applyFloorBeamSplitModal);
  const project = useAppStore((s) => s.currentProject);
  const selectedEntityIds = useAppStore((s) => s.selectedEntityIds);

  const [mode, setMode] = useState<FloorBeamSplitMode>("maxLength");
  const [overlapMm, setOverlapMm] = useState(0);

  const beamSelectionCount = useMemo(() => {
    const ids = new Set(project.floorBeams.map((b) => b.id));
    return selectedEntityIds.filter((id) => ids.has(id)).length;
  }, [project.floorBeams, selectedEntityIds]);

  useEffect(() => {
    if (open) {
      setMode("maxLength");
      setOverlapMm(0);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const submit = () => {
    const o = Number(overlapMm);
    if (!Number.isFinite(o) || o < 0) {
      return;
    }
    apply({ mode, overlapMm: o });
  };

  const hintAfterApply =
    beamSelectionCount === 0
      ? "После «Применить» кликните по нужной балке на плане (режим перекрытия)."
      : mode === "atPoint"
        ? beamSelectionCount === 1
          ? "После «Применить» кликните по выбранной балке в месте разреза."
          : "Для режима «по месту» в выборке должна остаться одна балка."
        : `После «Применить» будут разделены все ${beamSelectionCount} выбранных балки (короче лимита пропускаются; прочие объекты в выборке не трогаем).`;

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fbs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="fbs-title" className="lm-title">
          Разделить балку / профиль
        </h2>
        {beamSelectionCount > 0 ? (
          <p className="lm-muted" style={{ marginTop: 0, marginBottom: 8 }}>
            Выбрано балок перекрытия: <strong>{beamSelectionCount}</strong>
          </p>
        ) : null}
        <p className="lm-muted" style={{ marginTop: 0 }}>
          {hintAfterApply}
        </p>
        <label className="lm-field">
          <span className="lm-label">Наложение, мм</span>
          <input
            className="lm-input"
            type="number"
            min={0}
            step={1}
            value={overlapMm}
            onChange={(e) => setOverlapMm(Number(e.target.value))}
          />
        </label>
        <fieldset className="lm-field" style={{ border: "none", padding: 0, margin: 0 }}>
          <legend className="lm-label" style={{ marginBottom: 8 }}>
            Режим
          </legend>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <input type="radio" name="fbs-mode" checked={mode === "maxLength"} onChange={() => setMode("maxLength")} />
            <span>Делить по максимальной длине</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <input type="radio" name="fbs-mode" checked={mode === "center"} onChange={() => setMode("center")} />
            <span>Делить по центру</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="radio" name="fbs-mode" checked={mode === "atPoint"} onChange={() => setMode("atPoint")} />
            <span>Делить по указанному месту</span>
          </label>
          {mode === "atPoint" && beamSelectionCount > 1 ? (
            <p className="lm-muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              Несколько балок в выборке: этот режим недоступен для пакетного применения.
            </p>
          ) : null}
        </fieldset>
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
