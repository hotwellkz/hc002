import { BrickWall, LandPlot, LayoutGrid, Layers } from "lucide-react";

import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./left-nav-rail.css";

type LeftNavRailContentProps = {
  readonly className?: string;
  readonly onNavigate?: () => void;
};

/** Кнопки режима плана — общие для рейки и мобильного bottom sheet. */
export function LeftNavRailContent({ className, onNavigate }: LeftNavRailContentProps) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const planScope = useAppStore((s) => s.currentProject.viewState.editor2dPlanScope);
  const setEditor2dPlanScope = useAppStore((s) => s.setEditor2dPlanScope);
  const openWallDetail = useAppStore((s) => s.openWallDetail);
  const selectedWallId = useAppStore((s) => {
    const sel = new Set(s.selectedEntityIds);
    return s.currentProject.walls.find((w) => sel.has(w.id))?.id ?? null;
  });
  const floorPlanActive = activeTab === "2d" && planScope === "main";
  const floorStructureActive = activeTab === "2d" && planScope === "floorStructure";
  const foundationActive = activeTab === "2d" && planScope === "foundation";
  const wallDetailActive = activeTab === "wall";

  const wrapCls = ["lnr", className].filter(Boolean).join(" ");

  return (
    <nav className={wrapCls} aria-label="Режим работы">
      <button
        type="button"
        className="lnr-btn"
        title="План этажа"
        aria-label="План этажа"
        aria-pressed={floorPlanActive}
        data-active={floorPlanActive}
        onClick={() => {
          setActiveTab("2d");
          setEditor2dPlanScope("main");
          onNavigate?.();
        }}
      >
        <LucideToolIcon icon={LayoutGrid} className="lnr-icon" />
        <span className="lnr-label">План этажа</span>
      </button>
      <button
        type="button"
        className="lnr-btn"
        title="Перекрытие"
        aria-label="Перекрытие"
        aria-pressed={floorStructureActive}
        data-active={floorStructureActive}
        onClick={() => {
          setActiveTab("2d");
          setEditor2dPlanScope("floorStructure");
          onNavigate?.();
        }}
      >
        <LucideToolIcon icon={Layers} className="lnr-icon" />
        <span className="lnr-label">Перекрытие</span>
      </button>
      <button
        type="button"
        className="lnr-btn"
        title="Фундамент"
        aria-label="Фундамент"
        aria-pressed={foundationActive}
        data-active={foundationActive}
        onClick={() => {
          setActiveTab("2d");
          setEditor2dPlanScope("foundation");
          onNavigate?.();
        }}
      >
        <LucideToolIcon icon={LandPlot} className="lnr-icon" />
        <span className="lnr-label">Фундамент</span>
      </button>
      <button
        type="button"
        className="lnr-btn"
        title={selectedWallId ? "Вид стены" : "Выберите стену на плане"}
        aria-label="Вид стены"
        aria-pressed={wallDetailActive}
        data-active={wallDetailActive}
        disabled={!selectedWallId}
        onClick={() => {
          if (selectedWallId) {
            openWallDetail(selectedWallId);
            onNavigate?.();
          }
        }}
      >
        <LucideToolIcon icon={BrickWall} className="lnr-icon" />
        <span className="lnr-label">Вид стены</span>
      </button>
    </nav>
  );
}

/** Вертикальная навигация по режимам рабочей области (desktop). */
export function LeftNavRail() {
  return <LeftNavRailContent />;
}
