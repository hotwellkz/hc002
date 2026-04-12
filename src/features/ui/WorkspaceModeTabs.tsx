import { useAppStore } from "@/store/useAppStore";

/**
 * Переключатель режимов редактора (2D / 3D / спека / вид стены / отчёты).
 * Вынесен в отдельный компонент, чтобы показывать его и в шапке, и при необходимости в других местах.
 */
export function WorkspaceModeTabs() {
  const tab = useAppStore((s) => s.activeTab);
  const setTab = useAppStore((s) => s.setActiveTab);

  return (
    <div className="shell-top-workspace-tabs" aria-label="Режим редактора">
      <div className="tabs tabs--workspace" role="tablist">
        <button
          type="button"
          role="tab"
          data-active={tab === "2d"}
          aria-selected={tab === "2d"}
          onClick={() => setTab("2d")}
        >
          2D план
        </button>
        <button
          type="button"
          role="tab"
          data-active={tab === "3d"}
          aria-selected={tab === "3d"}
          onClick={() => setTab("3d")}
        >
          3D вид
        </button>
        <button
          type="button"
          role="tab"
          data-active={tab === "spec"}
          aria-selected={tab === "spec"}
          onClick={() => setTab("spec")}
        >
          Спецификация
        </button>
        <button
          type="button"
          role="tab"
          data-active={tab === "wall"}
          aria-selected={tab === "wall"}
          onClick={() => setTab("wall")}
        >
          Вид стены
        </button>
        <button
          type="button"
          role="tab"
          data-active={tab === "reports"}
          aria-selected={tab === "reports"}
          onClick={() => setTab("reports")}
        >
          Отчёты
        </button>
      </div>
    </div>
  );
}
