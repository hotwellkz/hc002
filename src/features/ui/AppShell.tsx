import { useCallback, useState } from "react";

import "./shell.css";

import { useEditorToolShortcuts } from "@/features/editor2d/useEditorToolShortcuts";
import { useOpeningPropertiesKeyboard } from "@/features/project/useOpeningPropertiesKeyboard";
import { AddWallModal } from "@/features/ui/AddWallModal";
import { WallJointParamsModal } from "@/features/ui/WallJointParamsModal";
import { WallCalculationModal } from "@/features/ui/WallCalculationModal";
import { WindowParamsModal } from "@/features/ui/window-modal/WindowParamsModal";
import { DoorParamsModal } from "@/features/ui/window-modal/DoorParamsModal";
import { WallAnchorCoordinateModal } from "@/features/ui/WallAnchorCoordinateModal";
import { WallCoordinateModal } from "@/features/ui/WallCoordinateModal";
import { LayerManagerModal } from "@/features/ui/LayerManagerModal";
import { LayerParamsModal } from "@/features/ui/LayerParamsModal";
import { ProfilesModal } from "@/features/ui/ProfilesModal";
import { EditorHotkeysModal } from "@/features/ui/EditorHotkeysModal";

import { LeftNavRail } from "./LeftNavRail";
import { RightPropertiesPanel } from "./RightPropertiesPanel";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { WorkspaceTabs } from "./WorkspaceTabs";
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
  useEditorToolShortcuts();
  useOpeningPropertiesKeyboard(true);
  const [cursorWorldMm, setCursorWorldMm] = useState<{ x: number; y: number } | null>(null);
  const onWorldCursorMm = useCallback((p: { x: number; y: number } | null) => {
    setCursorWorldMm(p);
  }, []);

  const rightPropsOpen = useAppStore((s) => s.uiPanels.rightPropertiesOpen);
  const rightPropsCollapsed = useAppStore((s) => s.currentProject.viewState.rightPropertiesCollapsed);
  const dataRightProps = !rightPropsOpen ? "hidden" : rightPropsCollapsed ? "collapsed" : "expanded";

  return (
    <div className="shell" data-right-props={dataRightProps}>
      <TopBar />
      <div className="shell-nav-rail">
        <LeftNavRail />
      </div>
      <WorkspaceTabs onWorldCursorMm={onWorldCursorMm} />
      <RightPropertiesPanel />
      <StatusBar cursorWorldMm={cursorWorldMm} />
      <LayerManagerHost />
      <LayerParamsHost />
      <ProfilesHost />
      <AddWallModal />
      <WallJointParamsModal />
      <WallCoordinateModal />
      <WallAnchorCoordinateModal />
      <WallCalculationModal />
      <WindowParamsModal />
      <DoorParamsModal />
      <EditorHotkeysHost />
    </div>
  );
}
