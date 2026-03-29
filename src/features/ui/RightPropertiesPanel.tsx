import { useAppStore } from "@/store/useAppStore";

import "./right-properties-panel.css";

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M9 6l6 6-6 6V6z" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M15 6l-6 6 6 6V6z" />
    </svg>
  );
}

export function RightPropertiesPanel() {
  const open = useAppStore((s) => s.uiPanels.rightPropertiesOpen);
  const collapsed = useAppStore((s) => s.currentProject.viewState.rightPropertiesCollapsed);
  const setCollapsed = useAppStore((s) => s.setRightPropertiesCollapsed);
  const project = useAppStore((s) => s.currentProject);
  const selected = useAppStore((s) => s.selectedEntityIds);
  const activeId = project.activeLayerId;
  const wallsOnLayer = project.walls.filter((w) => w.layerId === activeId).length;
  const wallIds = new Set(project.walls.filter((w) => w.layerId === activeId).map((w) => w.id));
  const openingsOnLayer = project.openings.filter((o) => wallIds.has(o.wallId)).length;

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
          <IconChevronLeft />
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
          <IconChevronRight />
        </button>
      </header>
      <div className="rpp-body">
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.45 }}>
          Этап 1: панель без редактирования сущностей. Выбрано элементов: {selected.length}.
        </p>
        <dl style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
          <dt className="muted">Стен (активный слой)</dt>
          <dd style={{ margin: "0 0 8px 0" }}>{wallsOnLayer}</dd>
          <dt className="muted">Проёмов (активный слой)</dt>
          <dd style={{ margin: "0 0 8px 0" }}>{openingsOnLayer}</dd>
          <dt className="muted">Шаг сетки (мм)</dt>
          <dd style={{ margin: "0 0 8px 0" }}>{project.settings.gridStepMm}</dd>
          <dt className="muted">Единицы</dt>
          <dd style={{ margin: 0 }}>{project.meta.units}</dd>
        </dl>
      </div>
    </aside>
  );
}
