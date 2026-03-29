import { useEffect, useMemo, useState } from "react";

import { getLayerById, sortLayersByOrder } from "@/core/domain/layerOps";
import { normalizeVisibleLayerIds } from "@/core/domain/layerVisibility";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

type TabId = "current" | "list";

interface LayerParamsModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function LayerParamsModal({ open, onClose }: LayerParamsModalProps) {
  const project = useAppStore((s) => s.currentProject);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const toggleVisibleLayer = useAppStore((s) => s.toggleVisibleLayer);

  const [tab, setTab] = useState<TabId>("current");
  const [name, setName] = useState("");
  const [elevationMm, setElevationMm] = useState(0);

  const activeId = project.activeLayerId;
  const activeLayer = useMemo(() => getLayerById(project, activeId), [project, activeId]);
  const sortedLayers = useMemo(() => sortLayersByOrder(project.layers), [project.layers]);
  const extraVisible = useMemo(() => new Set(normalizeVisibleLayerIds(project)), [project]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTab("current");
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "current" || !activeLayer) {
      return;
    }
    setName(activeLayer.name);
    setElevationMm(activeLayer.elevationMm);
  }, [open, tab, activeLayer]);

  if (!open) {
    return null;
  }

  const applyCurrent = () => {
    const n = name.trim();
    if (!n || !activeLayer) {
      return;
    }
    updateLayer(activeId, { name: n, elevationMm: Number.isFinite(elevationMm) ? elevationMm : activeLayer.elevationMm });
  };

  const canApply =
    tab === "current" &&
    activeLayer &&
    name.trim().length > 0 &&
    (name.trim() !== activeLayer.name || elevationMm !== activeLayer.elevationMm);

  return (
    <div className="lm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lm-dialog lm-dialog--wide lp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lp-title" className="lm-title">
          Параметры слоя
        </h2>

        <div className="lp-tabs" role="tablist" aria-label="Разделы параметров слоя">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "current"}
            className={`lp-tab ${tab === "current" ? "lp-tab--active" : ""}`}
            onClick={() => setTab("current")}
          >
            Текущий слой
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "list"}
            className={`lp-tab ${tab === "list" ? "lp-tab--active" : ""}`}
            onClick={() => setTab("list")}
          >
            Список слоёв
          </button>
        </div>

        {tab === "current" && activeLayer && (
          <div className="lp-panel" role="tabpanel">
            <div className="lm-field">
              <label className="lm-label" htmlFor="lp-name">
                Название слоя
              </label>
              <input
                id="lp-name"
                className="lm-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="lm-field">
              <label className="lm-label" htmlFor="lp-elev">
                Уровень
              </label>
              <input
                id="lp-elev"
                className="lm-input lm-input--narrow"
                type="number"
                value={elevationMm}
                onChange={(e) => setElevationMm(Number(e.target.value))}
              />
              <span className="lp-unit">мм</span>
            </div>
          </div>
        )}

        {tab === "list" && (
          <div className="lp-panel" role="tabpanel">
            <div className="lp-table-wrap">
              <table className="lp-table">
                <thead>
                  <tr>
                    <th className="lp-th-check" scope="col">
                      Видимость
                    </th>
                    <th scope="col">Название слоя</th>
                    <th scope="col">Уровень</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLayers.map((l) => {
                    const isActive = l.id === activeId;
                    const checked = isActive || extraVisible.has(l.id);
                    return (
                      <tr key={l.id} className={isActive ? "lp-row-active" : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            className="lp-check"
                            checked={checked}
                            disabled={isActive}
                            title={
                              isActive
                                ? "Текущий слой всегда отображается на плане"
                                : "Показать слой в 2D как вспомогательный"
                            }
                            onChange={() => {
                              if (!isActive) {
                                toggleVisibleLayer(l.id);
                              }
                            }}
                          />
                        </td>
                        <td>
                          <span className="lp-layer-name">{l.name}</span>
                          {isActive && (
                            <span className="lp-badge" title="Активный слой для редактирования">
                              Текущий
                            </span>
                          )}
                        </td>
                        <td className="lp-num">{l.elevationMm} мм</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="lp-hint">
              Дополнительные слои показываются приглушённо; редактировать можно только объекты текущего слоя.
            </p>
          </div>
        )}

        <div className="lm-actions lp-actions">
          <button
            type="button"
            className="lm-btn lm-btn--primary"
            disabled={!canApply}
            onClick={() => {
              applyCurrent();
            }}
          >
            Применить
          </button>
          <button type="button" className="lm-btn lm-btn--ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
