import { useAppStore } from "@/store/useAppStore";

export function RightPropertiesPanel() {
  const open = useAppStore((s) => s.uiPanels.rightPropertiesOpen);
  const project = useAppStore((s) => s.currentProject);
  const selected = useAppStore((s) => s.selectedEntityIds);
  const activeId = project.activeLayerId;
  const wallsOnLayer = project.walls.filter((w) => w.layerId === activeId).length;
  const wallIds = new Set(project.walls.filter((w) => w.layerId === activeId).map((w) => w.id));
  const openingsOnLayer = project.openings.filter((o) => wallIds.has(o.wallId)).length;

  if (!open) {
    return null;
  }

  return (
    <aside className="shell-right" aria-label="Свойства">
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Свойства</h3>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.45 }}>
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
    </aside>
  );
}
