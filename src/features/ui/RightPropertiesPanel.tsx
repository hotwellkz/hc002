import { ChevronLeft, ChevronRight } from "lucide-react";

import { projectCommands } from "@/features/project/commands";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { useMobileLayout } from "@/shared/hooks/useMobileLayout";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./right-properties-panel.css";

export function RightPropertiesPanelContent() {
  const project = useAppStore((s) => s.currentProject);
  const selected = useAppStore((s) => s.selectedEntityIds);
  const activeId = project.activeLayerId;
  const wallsOnLayer = project.walls.filter((w) => w.layerId === activeId).length;
  const wallIds = new Set(project.walls.filter((w) => w.layerId === activeId).map((w) => w.id));
  const openingsOnLayer = project.openings.filter((o) => o.wallId != null && wallIds.has(o.wallId)).length;
  const selectedPlacedWindow =
    selected.length === 1
      ? project.openings.find((o) => o.id === selected[0] && o.kind === "window" && o.wallId != null)
      : undefined;
  const selectedRoofPlane: RoofPlaneEntity | undefined =
    selected.length === 1 ? project.roofPlanes.find((r) => r.id === selected[0]) : undefined;

  return (
    <>
      <p className="muted rpp-intro">
        Выбрано элементов: {selected.length}.
      </p>
      {selectedPlacedWindow ? (
        <div className="rpp-block">
          <button type="button" className="rpp-action-btn" onClick={() => projectCommands.openSelectedWindowProperties()}>
            Параметры окна…
          </button>
          <p className="muted rpp-hint">
            Двойной клик по окну на плане или клавиша Enter — то же окно свойств. Перетаскивание — вдоль стены.
          </p>
        </div>
      ) : null}
      {selectedRoofPlane ? (
        <div className="rpp-block">
          <p className="muted rpp-hint" style={{ marginBottom: 8 }}>
            Выбран объект: <strong>плоскость крыши</strong> (тип roofPlane). Угол {Math.round(selectedRoofPlane.angleDeg * 10) / 10}
            °, Скат {selectedRoofPlane.slopeIndex}. Редактирование параметров — в следующих версиях.
          </p>
        </div>
      ) : null}
      <dl className="rpp-dl">
        <dt className="muted">Стен (активный слой)</dt>
        <dd>{wallsOnLayer}</dd>
        <dt className="muted">Проёмов (активный слой)</dt>
        <dd>{openingsOnLayer}</dd>
        <dt className="muted">Шаг сетки (мм)</dt>
        <dd>{project.settings.gridStepMm}</dd>
        <dt className="muted">Единицы</dt>
        <dd className="rpp-dd-last">{project.meta.units}</dd>
      </dl>
    </>
  );
}

export function RightPropertiesPanel() {
  const isMobile = useMobileLayout();
  const open = useAppStore((s) => s.uiPanels.rightPropertiesOpen);
  const collapsed = useAppStore((s) => s.currentProject.viewState.rightPropertiesCollapsed);
  const setCollapsed = useAppStore((s) => s.setRightPropertiesCollapsed);

  if (isMobile) {
    return null;
  }

  if (!open) {
    return null;
  }

  if (collapsed) {
    return (
      <aside className="shell-right shell-right--collapsed" aria-label="Свойства">
        <button
          type="button"
          className="rpp-rail-btn"
          title="Развернуть свойства"
          aria-label="Развернуть свойства"
          onClick={() => setCollapsed(false)}
        >
          <LucideToolIcon icon={ChevronLeft} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="shell-right" aria-label="Свойства">
      <header className="rpp-header">
        <h3 className="rpp-title">Свойства</h3>
        <button
          type="button"
          className="rpp-icon-btn"
          title="Свернуть свойства"
          aria-label="Свернуть свойства"
          onClick={() => setCollapsed(true)}
        >
          <LucideToolIcon icon={ChevronRight} />
        </button>
      </header>
      <div className="rpp-body">
        <RightPropertiesPanelContent />
      </div>
    </aside>
  );
}
