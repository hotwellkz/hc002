import { useEffect, useId, useMemo, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";
import "./wall-calculation-modal.css";

export function WallCalculationModal() {
  const open = useAppStore((s) => s.wallCalculationModalOpen);
  const close = useAppStore((s) => s.closeWallCalculationModal);
  const apply = useAppStore((s) => s.applyWallCalculationModal);
  const project = useAppStore((s) => s.currentProject);
  const selectedEntityIds = useAppStore((s) => s.selectedEntityIds);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const titleId = useId();
  const [clearWall, setClearWall] = useState(true);
  const [stage3OpeningFraming, setStage3OpeningFraming] = useState(true);
  const [stage3WallConnections, setStage3WallConnections] = useState(true);

  const selectedWallCount = useMemo(() => {
    const sel = new Set(selectedEntityIds);
    return project.walls.filter((w) => sel.has(w.id)).length;
  }, [project.walls, selectedEntityIds]);

  useEffect(() => {
    if (!open) {
      return;
    }
    clearApplyError();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, clearApplyError]);

  if (!open) {
    return null;
  }

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog lm-dialog--wide wcalc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="lm-title">
          Расчёт элементов стены
        </h2>
        <p className="wcalc-sub">
          Выбрано стен: <strong>{selectedWallCount}</strong>. Пересчитывается SIP-раскладка, пиломатериалы и (при
          включённых опциях) обрамление проёмов и узлы стен.
        </p>

        <section className="wcalc-section" aria-label="Параметры каркаса">
          <h3 className="wcalc-h3">Параметры каркаса (этап 3)</h3>
          <label className="wcalc-check">
            <input
              type="checkbox"
              checked={stage3OpeningFraming}
              onChange={(e) => setStage3OpeningFraming(e.target.checked)}
            />
            <span>Конструкция проёмов (стойки, перемычка, подоконник для окна)</span>
          </label>
          <label className="wcalc-check">
            <input
              type="checkbox"
              checked={stage3WallConnections}
              onChange={(e) => setStage3WallConnections(e.target.checked)}
            />
            <span>Соединение стен (углы, Т-примыкание — отдельные роли деталей)</span>
          </label>
          <p className="wcalc-hint">
            Если «Конструкция проёмов» выключена — проёмы только вырезают SIP-зоны, без обрамления. Если «Соединение
            стен» выключено — торцы остаются обычными торцевыми досками без узлов угол/Т.
          </p>
        </section>

        <section className="wcalc-section" aria-label="Параметры SIP">
          <h3 className="wcalc-h3">Параметры SIP</h3>
          <label className="wcalc-check wcalc-check--disabled">
            <input type="checkbox" checked readOnly disabled />
            <span>Пересоздать SIP-области</span>
          </label>
          <label className="wcalc-check wcalc-check--disabled">
            <input type="checkbox" checked readOnly disabled />
            <span>Пересчитать SIP-панели</span>
          </label>
          <label className="wcalc-check wcalc-check--disabled">
            <input type="checkbox" checked readOnly disabled />
            <span>Пересчитать пиломатериалы</span>
          </label>
          <p className="wcalc-hint">
            Сейчас все три выполняются вместе при «Применить»; отдельное включение появится на следующих этапах.
          </p>
        </section>

        <section className="wcalc-section" aria-label="Утеплитель">
          <h3 className="wcalc-h3">Утеплитель</h3>
          <p className="wcalc-hint">
            Отдельная визуализация слоя утеплителя в расчёте пока не завершена — флаг зарезервирован на следующий этап.
          </p>
        </section>

        <section className="wcalc-section" aria-label="Очистка">
          <h3 className="wcalc-h3">Очистка</h3>
          <label className="wcalc-check">
            <input type="checkbox" checked={clearWall} onChange={(e) => setClearWall(e.target.checked)} />
            <span>Очищать расчёт перед применением (рекомендуется)</span>
          </label>
          <p className="wcalc-hint">
            Удаляет предыдущий сохранённый расчёт для выбранных стен и записывает новый результат (без дубликатов).
          </p>
        </section>

        {applyError ? (
          <p className="wcalc-hint" style={{ color: "var(--danger, #b91c1c)" }} role="alert">
            {applyError}
          </p>
        ) : null}

        <div className="lm-actions wcalc-actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
            Отмена
          </button>
          <button
            type="button"
            className="lm-btn lm-btn--primary"
            disabled={isSubmitting}
            onClick={() =>
              void runApply(() => {
                apply({
                  clearWallFirst: clearWall,
                  stage3Options: {
                    includeOpeningFraming: stage3OpeningFraming,
                    includeWallConnectionElements: stage3WallConnections,
                  },
                });
                const s = useAppStore.getState();
                return finishStoreModalApply(s.wallCalculationModalOpen, s.lastError);
              })
            }
          >
            {isSubmitting ? "…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
