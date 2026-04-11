import { ActiveLayerBadge } from "@/features/ui/ActiveLayerBadge";
import { Editor2DToolbar } from "@/features/editor2d/Editor2DToolbar";
import { Editor2DWorkspace } from "@/features/editor2d/Editor2DWorkspace";
import { LinearPlacementRail } from "@/features/ui/LinearPlacementRail";
import { SlabPlacementRail } from "@/features/ui/SlabPlacementRail";
import { Editor3DWorkspace } from "@/features/editor3d/Editor3DWorkspace";
import { SpecificationWorkspace } from "@/features/ui/SpecificationWorkspace";
import { WallDetailWorkspace } from "@/features/ui/WallDetailWorkspace";
import { useMobileLayout } from "@/shared/hooks/useMobileLayout";
import { useAppStore } from "@/store/useAppStore";

interface WorkspaceTabsProps {
  readonly onWorldCursorMm: (point: { x: number; y: number } | null) => void;
}

export function WorkspaceTabs({ onWorldCursorMm }: WorkspaceTabsProps) {
  const isMobile = useMobileLayout();
  const tab = useAppStore((s) => s.activeTab);
  const setTab = useAppStore((s) => s.setActiveTab);

  return (
    <div className="shell-center">
      {!isMobile ? (
        <div className="workspace-subbar">
          <div className="tabs" role="tablist" aria-label="Режим редактора">
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
        </div>
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {tab === "2d" ? (
          <>
            <Editor2DToolbar />
            <div
              className="workspace-2d-main"
              style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", display: "flex", flexDirection: "row" }}
            >
              <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", overflow: "hidden" }}>
                <ActiveLayerBadge />
                <Editor2DWorkspace onWorldCursorMm={onWorldCursorMm} />
              </div>
              {!isMobile ? (
                <div style={{ display: "flex", flexDirection: "row", flexShrink: 0, minHeight: 0 }}>
                  <SlabPlacementRail />
                  <LinearPlacementRail />
                </div>
              ) : null}
            </div>
          </>
        ) : tab === "3d" ? (
          <Editor3DWorkspace />
        ) : tab === "spec" ? (
          <SpecificationWorkspace />
        ) : (
          <WallDetailWorkspace />
        )}
      </div>
    </div>
  );
}
