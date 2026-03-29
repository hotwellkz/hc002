import { useMemo, useState } from "react";

import { sortLayersByOrder } from "@/core/domain/layerOps";
import type { Layer } from "@/core/domain/layer";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

interface LayerManagerModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function LayerManagerModal({ open, onClose }: LayerManagerModalProps) {
  const project = useAppStore((s) => s.currentProject);
  const setActiveLayer = useAppStore((s) => s.setActiveLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const reorderUp = useAppStore((s) => s.reorderLayerUp);
  const reorderDown = useAppStore((s) => s.reorderLayerDown);
  const deleteLayerById = useAppStore((s) => s.deleteLayerById);

  const sorted = useMemo(() => sortLayersByOrder(project.layers), [project.layers]);
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
          Управление слоями
        </h2>
        <ul className="lm-list">
          {sorted.map((l) => {
            const isActive = l.id === project.activeLayerId;
            const canDel = project.layers.length > 1;
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
                      <span className="lm-elev">{l.elevationMm} мм</span>
                    </div>
                    <div className="lm-row-actions">
                      <button type="button" className="lm-btn lm-btn--ghost lm-btn--sm" onClick={() => startEdit(l)}>
                        Изменить
                      </button>
                      <button type="button" className="lm-btn lm-btn--ghost lm-btn--sm" onClick={() => reorderUp(l.id)}>
                        Выше
                      </button>
                      <button type="button" className="lm-btn lm-btn--ghost lm-btn--sm" onClick={() => reorderDown(l.id)}>
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
