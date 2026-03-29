import { getLayerById } from "@/core/domain/layerOps";
import { useAppStore } from "@/store/useAppStore";

import "./active-layer-badge.css";

export function ActiveLayerBadge() {
  const project = useAppStore((s) => s.currentProject);
  const openLayerManager = useAppStore((s) => s.openLayerManager);
  const layer = getLayerById(project, project.activeLayerId);

  if (!layer) {
    return null;
  }

  return (
    <button type="button" className="alb" title="Управление слоями" onClick={() => openLayerManager()}>
      <span className="alb-text">
        {layer.name}: {layer.elevationMm} мм
      </span>
    </button>
  );
}
