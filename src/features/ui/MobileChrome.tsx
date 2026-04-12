import { useEffect } from "react";
import { Box, BrickWall, ClipboardList, DraftingCompass, FileText, Info, LayoutGrid, Layers, Menu, Spline } from "lucide-react";

import { Editor2DToolbarMobileSheet } from "@/features/editor2d/Editor2DToolbarMobile";
import { Editor3DToolbar } from "@/features/ui/Editor3DToolbar";
import { Editor2DScopeToolbar } from "@/features/ui/Editor2DScopeToolbar";
import { LayerToolbar } from "@/features/ui/LayerToolbar";
import { LeftNavRailContent } from "@/features/ui/LeftNavRail";
import { LinearPlacementRail } from "@/features/ui/LinearPlacementRail";
import { RightPropertiesPanelContent } from "@/features/ui/RightPropertiesPanel";
import { SlabPlacementRail } from "@/features/ui/SlabPlacementRail";
import { ThemeMenu } from "@/features/ui/ThemeMenu";
import { projectCommands } from "@/features/project/commands";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { type MobileSheetId, useAppStore } from "@/store/useAppStore";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";

import "./mobile-chrome.css";

const SHEET_TITLES: Record<MobileSheetId, string> = {
  mainMenu: "Меню",
  planView: "Вид плана",
  planTopTools: "Инструменты",
  editorTools: "Инструменты",
  properties: "Свойства",
  placementRails: "Плиты и направляющие",
};

function MainMenuSheet() {
  const closeMobileSheet = useAppStore((s) => s.closeMobileSheet);
  const openLayerManager = useAppStore((s) => s.openLayerManager);
  const openProfiles = useAppStore((s) => s.openProfilesModal);
  const openHotkeys = useEditorShortcutsStore((s) => s.openShortcutsSettings);

  const run = (fn: () => void) => {
    fn();
    closeMobileSheet();
  };

  return (
    <div className="mobile-menu-list">
      <button type="button" className="mobile-menu-btn" onClick={() => run(() => projectCommands.createNew())}>
        Новый проект
      </button>
      <button type="button" className="mobile-menu-btn" onClick={() => run(() => void projectCommands.open())}>
        Открыть…
      </button>
      <button type="button" className="mobile-menu-btn" onClick={() => run(() => void projectCommands.save())}>
        Сохранить…
      </button>
      <button type="button" className="mobile-menu-btn" onClick={() => run(() => projectCommands.bootstrapDemo())}>
        Демо-проект
      </button>
      <div className="mobile-menu-row">
        <span className="mobile-menu-label">Тема</span>
        <ThemeMenu />
      </div>
      <button type="button" className="mobile-menu-btn" onClick={() => run(() => openLayerManager())}>
        Слои…
      </button>
      <button type="button" className="mobile-menu-btn" onClick={() => run(() => openHotkeys())}>
        Горячие клавиши
      </button>
      <button type="button" className="mobile-menu-btn" onClick={() => run(() => openProfiles())}>
        Профили
      </button>
    </div>
  );
}

function PlanTopToolsSheet() {
  const tab = useAppStore((s) => s.activeTab);
  if (tab === "3d") {
    return (
      <div className="mobile-sheet-stack mobile-sheet-stack--tools">
        <Editor3DToolbar />
      </div>
    );
  }

  return (
    <div className="mobile-sheet-stack mobile-sheet-stack--tools">
      <Editor2DScopeToolbar />
      <div className="mobile-sheet-subsection">
        <p className="mobile-sheet-subtitle">Слой</p>
        <LayerToolbar />
      </div>
    </div>
  );
}

function PlacementRailsSheet() {
  return (
    <div className="mobile-rails-stack">
      <SlabPlacementRail />
      <LinearPlacementRail />
    </div>
  );
}

function SheetBody({ id }: { readonly id: MobileSheetId }) {
  switch (id) {
    case "mainMenu":
      return <MainMenuSheet />;
    case "planView":
      return (
        <LeftNavRailContent
          className="lnr--mobile-sheet"
          onNavigate={() => {
            useAppStore.getState().closeMobileSheet();
          }}
        />
      );
    case "planTopTools":
      return <PlanTopToolsSheet />;
    case "editorTools":
      return <Editor2DToolbarMobileSheet />;
    case "properties":
      return (
        <div className="mobile-sheet-props">
          <RightPropertiesPanelContent />
        </div>
      );
    case "placementRails":
      return <PlacementRailsSheet />;
    default:
      return null;
  }
}

export function MobileSheetHost() {
  const sheet = useAppStore((s) => s.uiPanels.mobileSheet);
  const close = useAppStore((s) => s.closeMobileSheet);

  useEffect(() => {
    if (!sheet) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet, close]);

  if (!sheet) {
    return null;
  }

  return (
    <div className="mobile-sheet-root">
      <button type="button" className="mobile-sheet-backdrop" aria-label="Закрыть панель" onClick={close} />
      <div
        className="mobile-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mobile-sheet-grabber" aria-hidden />
        <div className="mobile-sheet-head">
          <h2 id="mobile-sheet-title" className="mobile-sheet-title">
            {SHEET_TITLES[sheet]}
          </h2>
          <button type="button" className="mobile-sheet-x" onClick={close} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="mobile-sheet-body">
          <SheetBody id={sheet} />
        </div>
      </div>
    </div>
  );
}

function DockBtn({
  label,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly icon: typeof Menu;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" className="mobile-dock-btn" onClick={onClick} aria-label={label}>
      <LucideToolIcon icon={icon} className="mobile-dock-icon" />
      <span className="mobile-dock-label">{label}</span>
    </button>
  );
}

export function MobileEditorDock() {
  const tab = useAppStore((s) => s.activeTab);
  const openMobileSheet = useAppStore((s) => s.openMobileSheet);

  if (tab === "3d") {
    return (
      <div className="mobile-editor-dock mobile-editor-dock--narrow">
        <DockBtn label="Меню" icon={Menu} onClick={() => openMobileSheet("mainMenu")} />
        <DockBtn label="3D" icon={Box} onClick={() => openMobileSheet("planTopTools")} />
        <DockBtn label="Инфо" icon={Info} onClick={() => openMobileSheet("properties")} />
      </div>
    );
  }

  if (tab !== "2d") {
    return (
      <div className="mobile-editor-dock mobile-editor-dock--narrow">
        <DockBtn label="Меню" icon={Menu} onClick={() => openMobileSheet("mainMenu")} />
        <DockBtn label="Свойства" icon={Info} onClick={() => openMobileSheet("properties")} />
      </div>
    );
  }

  return (
    <div className="mobile-editor-dock">
      <DockBtn label="Меню" icon={Menu} onClick={() => openMobileSheet("mainMenu")} />
      <DockBtn label="Вид" icon={Layers} onClick={() => openMobileSheet("planView")} />
      <DockBtn label="План" icon={DraftingCompass} onClick={() => openMobileSheet("planTopTools")} />
      <DockBtn label="Постройка" icon={Spline} onClick={() => openMobileSheet("placementRails")} />
      <DockBtn label="Инфо" icon={Info} onClick={() => openMobileSheet("properties")} />
    </div>
  );
}

export function MobileBottomNav() {
  const tab = useAppStore((s) => s.activeTab);
  const setTab = useAppStore((s) => s.setActiveTab);

  return (
    <nav className="mobile-bottom-nav" aria-label="Режим редактора">
      <button
        type="button"
        className="mobile-tab-btn"
        data-active={tab === "2d"}
        aria-current={tab === "2d" ? "page" : undefined}
        onClick={() => setTab("2d")}
      >
        <LucideToolIcon icon={LayoutGrid} className="mobile-tab-icon" />
        <span>2D</span>
      </button>
      <button
        type="button"
        className="mobile-tab-btn"
        data-active={tab === "3d"}
        aria-current={tab === "3d" ? "page" : undefined}
        onClick={() => setTab("3d")}
      >
        <LucideToolIcon icon={Box} className="mobile-tab-icon" />
        <span>3D</span>
      </button>
      <button
        type="button"
        className="mobile-tab-btn"
        data-active={tab === "spec"}
        aria-current={tab === "spec" ? "page" : undefined}
        onClick={() => setTab("spec")}
      >
        <LucideToolIcon icon={ClipboardList} className="mobile-tab-icon" />
        <span>Спец.</span>
      </button>
      <button
        type="button"
        className="mobile-tab-btn"
        data-active={tab === "wall"}
        aria-current={tab === "wall" ? "page" : undefined}
        onClick={() => setTab("wall")}
      >
        <LucideToolIcon icon={BrickWall} className="mobile-tab-icon" />
        <span>Стена</span>
      </button>
      <button
        type="button"
        className="mobile-tab-btn"
        data-active={tab === "reports"}
        aria-current={tab === "reports" ? "page" : undefined}
        onClick={() => setTab("reports")}
      >
        <LucideToolIcon icon={FileText} className="mobile-tab-icon" />
        <span>Отч.</span>
      </button>
    </nav>
  );
}

export function MobileChrome() {
  return (
    <>
      <div className="shell-mobile-stack">
        <MobileEditorDock />
        <MobileBottomNav />
      </div>
      <MobileSheetHost />
    </>
  );
}
