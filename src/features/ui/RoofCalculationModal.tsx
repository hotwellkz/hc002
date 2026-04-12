import { useEffect, useId, useMemo } from "react";

import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function RoofCalculationModal() {
  const open = useAppStore((s) => s.roofCalculationModalOpen);
  const close = useAppStore((s) => s.closeRoofCalculationModal);
  const apply = useAppStore((s) => s.applyRoofCalculationModal);
  const project = useAppStore((s) => s.currentProject);
  const selectedEntityIds = useAppStore((s) => s.selectedEntityIds);

  const titleId = useId();

  const selectedRoofCount = useMemo(() => {
    const sel = new Set(selectedEntityIds);
    return project.roofPlanes.filter((r) => sel.has(r.id)).length;
  }, [project.roofPlanes, selectedEntityIds]);

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

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog lm-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="lm-title">
          Расчёт крыши
        </h2>
        <p className="lm-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
          Выбрано скатов: <strong>{selectedRoofCount}</strong>. По профилю кровли будут построены покрытие, обрешётка и
          подкровельная мембрана в 3D. Плоскости скатов на плане не изменяются. Все выбранные скаты должны иметь один
          профиль «Кровля» и образовывать одну связную группу по стыкам контура.
        </p>
        <div className="lm-actions" style={{ marginTop: 20 }}>
          <button type="button" className="lm-btn lm-btn--ghost" onClick={() => close()}>
            Отмена
          </button>
          <button type="button" className="lm-btn lm-btn--primary" onClick={() => apply()}>
            Рассчитать
          </button>
        </div>
      </div>
    </div>
  );
}
