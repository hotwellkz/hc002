import { getLayerById } from "@/core/domain/layerOps";
import { getLayerVerticalSlice } from "@/core/domain/layerVerticalStack";
import { useAppStore } from "@/store/useAppStore";

import "./active-layer-badge.css";

export function ActiveLayerBadge() {
  const project = useAppStore((s) => s.currentProject);
  const openLayerManager = useAppStore((s) => s.openLayerManager);
  const suppressed = useAppStore((s) => s.editor2dSuppressActiveLayerBadge);
  const layer = getLayerById(project, project.activeLayerId);

  if (suppressed || !layer) {
    return null;
  }

  const v = getLayerVerticalSlice(project, layer.id);

  return (
    <button type="button" className="alb" title="Управление слоями" onClick={() => openLayerManager()}>
      <span className="alb-text">
        {layer.name}: {Math.round(v.computedBaseMm)}→{Math.round(v.computedTopMm)} мм
      </span>
    </button>
  );
}
