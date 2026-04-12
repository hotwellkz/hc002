import { useMemo, useState } from "react";

import { LAYER_DOMAIN_LABELS, editor2dPlanScopeToLayerDomain } from "@/core/domain/layerDomain";
import {
  getAdjacentLayerIdInDomain,
  sortLayersByOrder,
  sortLayersForDomain,
} from "@/core/domain/layerOps";
import { computeLayerVerticalStack, getLayerVerticalSlice } from "@/core/domain/layerVerticalStack";
import type { Layer } from "@/core/domain/layer";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

interface LayerManagerModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function LayerManagerModal({ open, onClose }: LayerManagerModalProps) {
  const project = useAppStore((s) => s.currentProject);
  const listMode = useAppStore((s) => s.layerListDisplayMode);
  const setListMode = useAppStore((s) => s.setLayerListDisplayMode);
  const setActiveLayer = useAppStore((s) => s.setActiveLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const reorderUp = useAppStore((s) => s.reorderLayerUp);
  const reorderDown = useAppStore((s) => s.reorderLayerDown);
  const deleteLayerById = useAppStore((s) => s.deleteLayerById);

  const scopeDomain = editor2dPlanScopeToLayerDomain(project.viewState.editor2dPlanScope);

  const fullSorted = useMemo(() => sortLayersByOrder(project.layers), [project.layers]);

  const sorted = useMemo(() => {
    if (listMode === "project") {
      return fullSorted;
    }
    return sortLayersForDomain(project, scopeDomain);
  }, [fullSorted, project, listMode, scopeDomain]);

  const verticalById = useMemo(() => computeLayerVerticalStack(project), [project]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editElev, setEditElev] = useState(0);

  if (!open) {
    return null;
  }

  const startEdit = (l: Layer) => {
    setEditingId(l.id);
    setEditName(l.name);
    setEditElev(l.elevationMm);
  };

  const saveEdit = () => {
    if (!editingId) {
      return;
    }
    const n = editName.trim();
    if (!n) {
      return;
    }
    updateLayer(editingId, { name: n, elevationMm: editElev });
    setEditingId(null);
  };

  const title = listMode === "project" ? "Все слои проекта" : `Слои: ${LAYER_DOMAIN_LABELS[scopeDomain]}`;

  return (
    <div className="lm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lm-dialog lm-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lm-manage-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lm-manage-title" className="lm-title">
          {title}
        </h2>
        <p className="lm-micro lm-micro--tight" style={{ marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
          {listMode === "context" ? (
            <>
              Показаны только слои текущего раздела (слева: план / перекрытие / фундамент / крыша). В стеке здания
              порядок по разделу не смешивается с кнопками «Выше/Ниже».
            </>
          ) : (
            <>Полный реестр слоёв проекта: все разделы, общий вертикальный порядок.</>
          )}
        </p>
        <div className="lm-field" style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="lm-btn lm-btn--ghost lm-btn--sm"
            onClick={() => setListMode(listMode === "context" ? "project" : "context")}
          >
            {listMode === "context" ? "Показать все слои проекта" : "Только слои текущего раздела"}
          </button>
        </div>
        <ul className="lm-list">
          {sorted.map((l) => {
            const isActive = l.id === project.activeLayerId;
            const canDel = project.layers.length > 1;
            const vSlice = getLayerVerticalSlice(project, l.id, verticalById);
            const idxGlobal = fullSorted.findIndex((x) => x.id === l.id);
            const upDisabled =
              listMode === "context"
                ? getAdjacentLayerIdInDomain(project, l.id, "next") === null
                : idxGlobal < 0 || idxGlobal >= fullSorted.length - 1;
            const downDisabled =
              listMode === "context"
                ? getAdjacentLayerIdInDomain(project, l.id, "previous") === null
                : idxGlobal <= 0;
            return (
              <li key={l.id} className="lm-row">
                {editingId === l.id ? (
                  <div className="lm-edit">
                    <input
                      className="lm-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <input
                      className="lm-input lm-input--narrow"
                      type="number"
                      value={editElev}
                      onChange={(e) => setEditElev(Number(e.target.value))}
                    />
                    <button type="button" className="lm-btn lm-btn--primary lm-btn--sm" onClick={saveEdit}>
                      OK
                    </button>
                    <button type="button" className="lm-btn lm-btn--ghost lm-btn--sm" onClick={() => setEditingId(null)}>
                      Отмена
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="lm-row-main">
                      <span className={isActive ? "lm-active-dot" : "lm-inactive-dot"} title={isActive ? "Активный" : ""} />
                      <span className="lm-name">{l.name}</span>
                      {listMode === "project" && (
                        <span className="lm-elev" title="Раздел">
                          {LAYER_DOMAIN_LABELS[l.domain]}
                        </span>
                      )}
                      <span className="lm-elev" title="Расчётный низ → верх">
                        {Math.round(vSlice.computedBaseMm)}→{Math.round(vSlice.computedTopMm)} мм
                      </span>
                    </div>
                    <div className="lm-row-actions">
                      <button type="button" className="lm-btn lm-btn--ghost lm-btn--sm" onClick={() => startEdit(l)}>
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="lm-btn lm-btn--ghost lm-btn--sm"
                        title="Выше по зданию"
                        disabled={upDisabled}
                        onClick={() => reorderDown(l.id)}
                      >
                        Выше
                      </button>
                      <button
                        type="button"
                        className="lm-btn lm-btn--ghost lm-btn--sm"
                        title="Ниже по зданию"
                        disabled={downDisabled}
                        onClick={() => reorderUp(l.id)}
                      >
                        Ниже
                      </button>
                      <button
                        type="button"
                        className="lm-btn lm-btn--ghost lm-btn--sm"
                        disabled={!canDel}
                        onClick={() => deleteLayerById(l.id)}
                      >
                        Удалить
                      </button>
                      {!isActive && (
                        <button type="button" className="lm-btn lm-btn--ghost lm-btn--sm" onClick={() => setActiveLayer(l.id)}>
                          Активировать
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <div className="lm-actions">
          <button type="button" className="lm-btn lm-btn--primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
