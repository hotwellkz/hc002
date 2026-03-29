import { useCallback, useState } from "react";

import "./shell.css";

import { LayerManagerModal } from "@/features/ui/LayerManagerModal";
import { LayerParamsModal } from "@/features/ui/LayerParamsModal";

import { LeftNavRail } from "./LeftNavRail";
import { RightPropertiesPanel } from "./RightPropertiesPanel";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { useAppStore } from "@/store/useAppStore";

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

export function AppShell() {
  const [cursorWorldMm, setCursorWorldMm] = useState<{ x: number; y: number } | null>(null);
  const onWorldCursorMm = useCallback((p: { x: number; y: number } | null) => {
    setCursorWorldMm(p);
  }, []);

  return (
    <div className="shell">
      <TopBar />
      <div className="shell-nav-rail">
        <LeftNavRail />
      </div>
      <WorkspaceTabs onWorldCursorMm={onWorldCursorMm} />
      <RightPropertiesPanel />
      <StatusBar cursorWorldMm={cursorWorldMm} />
      <LayerManagerHost />
      <LayerParamsHost />
    </div>
  );
}
