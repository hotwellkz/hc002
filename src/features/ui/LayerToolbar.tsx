import { ChevronLeft, ChevronRight, Plus, Settings, Trash2 } from "lucide-react";
import { useState } from "react";

import { getAdjacentLayerIdInDomain, getNextLayerId, getPreviousLayerId } from "@/core/domain/layerOps";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore, selectCanDeleteCurrentLayer } from "@/store/useAppStore";

import { CreateLayerModal } from "./CreateLayerModal";

import "./layer-toolbar.css";

export function LayerToolbar() {
  const project = useAppStore((s) => s.currentProject);
  const goPrev = useAppStore((s) => s.goToPreviousLayer);
  const goNext = useAppStore((s) => s.goToNextLayer);
  const deleteLayer = useAppStore((s) => s.deleteCurrentLayer);
  const openLayerParams = useAppStore((s) => s.openLayerParamsModal);
  const [createOpen, setCreateOpen] = useState(false);

  const prevDisabled =
    project.viewState.activeTab === "2d"
      ? getAdjacentLayerIdInDomain(project, project.activeLayerId, "previous") === null
      : getPreviousLayerId(project) === null;
  const nextDisabled =
    project.viewState.activeTab === "2d"
      ? getAdjacentLayerIdInDomain(project, project.activeLayerId, "next") === null
      : getNextLayerId(project) === null;
  const deleteDisabled = !selectCanDeleteCurrentLayer();

  return (
    <>
      <div className="ltb" role="toolbar" aria-label="Слои плана">
        <button
          type="button"
          className="ltb-btn"
          title="Создать слой"
          aria-label="Создать слой"
          onClick={() => setCreateOpen(true)}
        >
          <LucideToolIcon icon={Plus} className="ltb-icon" />
        </button>
        <button
          type="button"
          className="ltb-btn"
          title="Предыдущий слой"
          aria-label="Предыдущий слой"
          disabled={prevDisabled}
          onClick={() => goPrev()}
        >
          <LucideToolIcon icon={ChevronLeft} className="ltb-icon" />
        </button>
        <button
          type="button"
          className="ltb-btn"
          title="Следующий слой"
          aria-label="Следующий слой"
          disabled={nextDisabled}
          onClick={() => goNext()}
        >
          <LucideToolIcon icon={ChevronRight} className="ltb-icon" />
        </button>
        <button
          type="button"
          className="ltb-btn"
          title="Параметры слоя"
          aria-label="Параметры слоя"
          onClick={() => openLayerParams()}
        >
          <LucideToolIcon icon={Settings} className="ltb-icon" />
        </button>
        <button
          type="button"
          className="ltb-btn ltb-btn--danger"
          title="Удалить слой"
          aria-label="Удалить слой"
          disabled={deleteDisabled}
          onClick={() => deleteLayer()}
        >
          <LucideToolIcon icon={Trash2} className="ltb-icon" />
        </button>
      </div>
      <CreateLayerModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
