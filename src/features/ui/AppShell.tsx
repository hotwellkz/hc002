import { useCallback, useEffect, useState } from "react";

import "./shell.css";

import { useEditorToolShortcuts } from "@/features/editor2d/useEditorToolShortcuts";
import { useOpeningPropertiesKeyboard } from "@/features/project/useOpeningPropertiesKeyboard";
import { useProjectUndoRedoHotkeys } from "@/features/project/useProjectUndoRedoHotkeys";
import { AddFoundationPileModal } from "@/features/ui/AddFoundationPileModal";
import { FoundationStripAutoPilesModal } from "@/features/ui/FoundationStripAutoPilesModal";
import { AddRoofPlaneModal } from "@/features/ui/AddRoofPlaneModal";
import { EditRoofPlaneModal } from "@/features/ui/EditRoofPlaneModal";
import { EditRoofSystemModal } from "@/features/ui/EditRoofSystemModal";
import { AddSlabModal } from "@/features/ui/AddSlabModal";
import { AddFoundationStripModal } from "@/features/ui/AddFoundationStripModal";
import { AddWallModal } from "@/features/ui/AddWallModal";
import { AddFloorBeamModal } from "@/features/ui/AddFloorBeamModal";
import { FloorBeamSplitModal } from "@/features/ui/FloorBeamSplitModal";
import { WallJointParamsModal } from "@/features/ui/WallJointParamsModal";
import { RoofCalculationModal } from "@/features/ui/RoofCalculationModal";
import { WallCalculationModal } from "@/features/ui/WallCalculationModal";
import { WindowParamsModal } from "@/features/ui/window-modal/WindowParamsModal";
import { DoorParamsModal } from "@/features/ui/window-modal/DoorParamsModal";
import { WallAnchorCoordinateModal } from "@/features/ui/WallAnchorCoordinateModal";
import { ProjectOriginCoordinateModal } from "@/features/ui/ProjectOriginCoordinateModal";
import { RoofPlaneEdgeOffsetModal } from "@/features/ui/RoofPlaneEdgeOffsetModal";
import { WallCoordinateModal } from "@/features/ui/WallCoordinateModal";
import { EntityCopyParamsModal } from "@/features/ui/EntityCopyParamsModal";
import { TextureApply3dParamsModal } from "@/features/ui/TextureApply3dParamsModal";
import { SlabEditModal } from "@/features/ui/SlabEditModal";
import { LayerManagerModal } from "@/features/ui/LayerManagerModal";
import { LayerParamsModal } from "@/features/ui/LayerParamsModal";
import { ProfilesModal } from "@/features/ui/ProfilesModal";
import { EditorHotkeysModal } from "@/features/ui/EditorHotkeysModal";

import { MobileChrome } from "./MobileChrome";
import { LeftNavRail } from "./LeftNavRail";
import { RightPropertiesPanel } from "./RightPropertiesPanel";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { useMobileLayout } from "@/shared/hooks/useMobileLayout";
import { useAppStore } from "@/store/useAppStore";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";

function LayerManagerHost() {
  const open = useAppStore((s) => s.layerManagerOpen);
  const close = useAppStore((s) => s.closeLayerManager);
  return <LayerManagerModal open={open} onClose={close} />;
}

function LayerParamsHost() {
  const open = useAppStore((s) => s.layerParamsModalOpen);
  const close = useAppStore((s) => s.closeLayerParamsModal);
  return <LayerParamsModal open={open} onClose={close} />;
}

function ProfilesHost() {
  const open = useAppStore((s) => s.profilesModalOpen);
  const close = useAppStore((s) => s.closeProfilesModal);
  return <ProfilesModal open={open} onClose={close} />;
}

function EditorHotkeysHost() {
  const open = useEditorShortcutsStore((s) => s.shortcutsSettingsModalOpen);
  const close = useEditorShortcutsStore((s) => s.closeShortcutsSettings);
  return <EditorHotkeysModal open={open} onClose={close} />;
}

export function AppShell() {
  const isMobile = useMobileLayout();
  useEditorToolShortcuts();
  useProjectUndoRedoHotkeys();
  useOpeningPropertiesKeyboard(true);
  const [cursorWorldMm, setCursorWorldMm] = useState<{ x: number; y: number } | null>(null);
  const onWorldCursorMm = useCallback((p: { x: number; y: number } | null) => {
    setCursorWorldMm(p);
  }, []);

  const rightPropsOpen = useAppStore((s) => s.uiPanels.rightPropertiesOpen);
  const rightPropsCollapsed = useAppStore((s) => s.currentProject.viewState.rightPropertiesCollapsed);
  const dataRightProps = !rightPropsOpen ? "hidden" : rightPropsCollapsed ? "collapsed" : "expanded";

  useEffect(() => {
    const el = document.documentElement;
    if (isMobile) {
      el.setAttribute("data-mobile-shell", "true");
    } else {
      el.removeAttribute("data-mobile-shell");
    }
    return () => el.removeAttribute("data-mobile-shell");
  }, [isMobile]);

  return (
    <div className="shell" data-layout={isMobile ? "mobile" : "desktop"} data-right-props={dataRightProps}>
      <TopBar />
      {!isMobile ? (
        <div className="shell-nav-rail">
          <LeftNavRail />
        </div>
      ) : null}
      <WorkspaceTabs onWorldCursorMm={onWorldCursorMm} />
      <RightPropertiesPanel />
      {isMobile ? <MobileChrome /> : null}
      <StatusBar cursorWorldMm={cursorWorldMm} />
      <LayerManagerHost />
      <LayerParamsHost />
      <ProfilesHost />
      <AddWallModal />
      <AddFloorBeamModal />
      <FloorBeamSplitModal />
      <AddFoundationStripModal />
      <AddSlabModal />
      <AddRoofPlaneModal />
      <EditRoofSystemModal />
      <EditRoofPlaneModal />
      <SlabEditModal />
      <AddFoundationPileModal />
      <FoundationStripAutoPilesModal />
      <WallJointParamsModal />
      <WallCoordinateModal />
      <RoofPlaneEdgeOffsetModal />
      <EntityCopyParamsModal />
      <TextureApply3dParamsModal />
      <ProjectOriginCoordinateModal />
      <WallAnchorCoordinateModal />
      <WallCalculationModal />
      <RoofCalculationModal />
      <WindowParamsModal />
      <DoorParamsModal />
      <EditorHotkeysHost />
    </div>
  );
}
