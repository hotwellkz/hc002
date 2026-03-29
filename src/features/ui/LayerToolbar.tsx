import { useState } from "react";

import { getNextLayerId, getPreviousLayerId } from "@/core/domain/layerOps";
import { useAppStore, selectCanDeleteCurrentLayer } from "@/store/useAppStore";

import { CreateLayerModal } from "./CreateLayerModal";

import "./layer-toolbar.css";

function IconPlus() {
  return (
    <svg className="ltb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
    </svg>
  );
}

function IconChevLeft() {
  return (
    <svg className="ltb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M15.5 5.5L14 4l-8 8 8 8 1.5-1.5L9 12l6.5-6.5z" />
    </svg>
  );
}

function IconChevRight() {
  return (
    <svg className="ltb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8.5 5.5L10 4l8 8-8 8-1.5-1.5L15 12 8.5 5.5z" />
    </svg>
  );
}

function IconTrashLayer() {
  return (
    <svg className="ltb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 7h12v2h-1v11a2 2 0 01-2 2H9a2 2 0 01-2-2V9H6V7zm3 2v11h6V9H9zm2-6h2v2h5v2H4V5h5V3h2z"
      />
    </svg>
  );
}

function IconLayerParams() {
  return (
    <svg className="ltb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 16.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm7.43-5.18c.04.22.07.45.07.68 0 .23-.03.46-.07.68l1.51 1.19c.13.11.17.3.08.45l-1.4 2.42a.38.38 0 01-.42.17l-1.79-.72a7.05 7.05 0 01-1.59.92l-.27 1.91a.39.39 0 01-.38.33h-2.8c-.19 0-.35-.13-.38-.33l-.27-1.91c-.56-.26-1.07-.59-1.59-.92l-1.79.72a.38.38 0 01-.42-.17l-1.4-2.42a.38.38 0 01.08-.45l1.51-1.19c-.04-.22-.07-.45-.07-.68 0-.23.03-.46.07-.68l-1.51-1.19a.38.38 0 01-.08-.45l1.4-2.42c.09-.16.29-.21.45-.17l1.79.72c.5-.35 1.04-.66 1.59-.92l.27-1.91c.03-.2.19-.33.38-.33h2.8c.19 0 .35.13.38.33l.27 1.91c.56.26 1.07.59 1.59.92l1.79-.72c.16-.04.35.01.45.17l1.4 2.42c.09.16.05.34-.08.45l-1.51 1.19z"
      />
    </svg>
  );
}

export function LayerToolbar() {
  const project = useAppStore((s) => s.currentProject);
  const goPrev = useAppStore((s) => s.goToPreviousLayer);
  const goNext = useAppStore((s) => s.goToNextLayer);
  const deleteLayer = useAppStore((s) => s.deleteCurrentLayer);
  const openLayerParams = useAppStore((s) => s.openLayerParamsModal);
  const [createOpen, setCreateOpen] = useState(false);

  const prevDisabled = getPreviousLayerId(project) === null;
  const nextDisabled = getNextLayerId(project) === null;
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
          <IconPlus />
        </button>
        <button
          type="button"
          className="ltb-btn"
          title="Предыдущий слой"
          aria-label="Предыдущий слой"
          disabled={prevDisabled}
          onClick={() => goPrev()}
        >
          <IconChevLeft />
        </button>
        <button
          type="button"
          className="ltb-btn"
          title="Следующий слой"
          aria-label="Следующий слой"
          disabled={nextDisabled}
          onClick={() => goNext()}
        >
          <IconChevRight />
        </button>
        <button
          type="button"
          className="ltb-btn"
          title="Параметры слоя"
          aria-label="Параметры слоя"
          onClick={() => openLayerParams()}
        >
          <IconLayerParams />
        </button>
        <button
          type="button"
          className="ltb-btn ltb-btn--danger"
          title="Удалить слой"
          aria-label="Удалить слой"
          disabled={deleteDisabled}
          onClick={() => deleteLayer()}
        >
          <IconTrashLayer />
        </button>
      </div>
      <CreateLayerModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
