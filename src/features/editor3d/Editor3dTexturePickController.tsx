import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Raycaster } from "three";

import type { Editor3dPickPayload } from "@/core/domain/editor3dPickPayload";
import { isEditor3dPickTexturable } from "@/core/domain/surfaceTexturePick";
import { hasBlockingEditorOverlayModal } from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { useAppStore } from "@/store/useAppStore";

import { pickEditor3dFromPointer } from "./editor3dPick";

const DRAG_THRESHOLD_PX = 6;

function editorHotkeySnapshot() {
  const s = useAppStore.getState();
  return {
    activeTab: s.activeTab,
    layerManagerOpen: s.layerManagerOpen,
    layerParamsModalOpen: s.layerParamsModalOpen,
    profilesModalOpen: s.profilesModalOpen,
    addWallModalOpen: s.addWallModalOpen,
    addFloorBeamModalOpen: s.addFloorBeamModalOpen,
    floorBeamSplitModalOpen: s.floorBeamSplitModalOpen,
    addFoundationStripModalOpen: s.addFoundationStripModalOpen,
    addFoundationPileModalOpen: s.addFoundationPileModalOpen,
    addSlabModalOpen: s.addSlabModalOpen,
    addRoofPlaneModalOpen: s.addRoofPlaneModalOpen,
    addWindowModalOpen: s.addWindowModalOpen,
    addDoorModalOpen: s.addDoorModalOpen,
    windowEditModal: s.windowEditModal,
    doorEditModal: s.doorEditModal,
    slabEditModal: s.slabEditModal,
    wallJointParamsModalOpen: s.wallJointParamsModalOpen,
    wallCalculationModalOpen: s.wallCalculationModalOpen,
    wallCoordinateModalOpen: s.wallCoordinateModalOpen,
    floorBeamPlacementCoordinateModalOpen: s.floorBeamPlacementCoordinateModalOpen,
    slabCoordinateModalOpen: s.slabCoordinateModalOpen,
    wallAnchorCoordinateModalOpen: s.wallAnchorCoordinateModalOpen,
    wallMoveCopyCoordinateModalOpen: s.wallMoveCopyCoordinateModalOpen,
    floorBeamMoveCopyCoordinateModalOpen: s.floorBeamMoveCopyCoordinateModalOpen,
    lengthChangeCoordinateModalOpen: s.lengthChangeCoordinateModalOpen,
    projectOriginCoordinateModalOpen: s.projectOriginCoordinateModalOpen,
    openingAlongMoveNumericModalOpen: s.openingAlongMoveNumericModalOpen,
    roofPlaneEdgeOffsetModal: s.roofPlaneEdgeOffsetModal,
    foundationStripAutoPilesModal: s.foundationStripAutoPilesModal,
    entityCopyCoordinateModalOpen: s.entityCopyCoordinateModalOpen,
    entityCopyParamsModal: s.entityCopyParamsModal,
    textureApply3dParamsModal: s.textureApply3dParamsModal,
    editor3dContextMenu: s.editor3dContextMenu,
  };
}

interface Editor3dTexturePickControllerProps {
  readonly modalOpen: boolean;
  readonly onHoverTexturablePick: (p: Editor3dPickPayload | null) => void;
}

/**
 * Raycast-выбор объекта для инструмента «Применить текстуру» (крестик, без обычного выделения сцены).
 */
export function Editor3dTexturePickController({ modalOpen, onHoverTexturablePick }: Editor3dTexturePickControllerProps) {
  const { gl, camera, scene } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

  const pointerDownRef = useRef<{ readonly x: number; readonly y: number; readonly button: number } | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    const el = gl.domElement;

    const blocked = (): boolean => {
      return hasBlockingEditorOverlayModal(editorHotkeySnapshot());
    };

    const onPointerDown = (ev: PointerEvent): void => {
      if (ev.button === 0) {
        pointerDownRef.current = { x: ev.clientX, y: ev.clientY, button: ev.button };
        draggedRef.current = false;
      }
    };

    const onPointerMove = (ev: PointerEvent): void => {
      const down = pointerDownRef.current;
      if (down && down.button === 0) {
        const dx = ev.clientX - down.x;
        const dy = ev.clientY - down.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          draggedRef.current = true;
        }
      }
      if (modalOpen || blocked()) {
        onHoverTexturablePick(null);
        el.style.cursor = modalOpen ? "default" : "crosshair";
        return;
      }
      const rect = el.getBoundingClientRect();
      const raw = pickEditor3dFromPointer(ev.clientX, ev.clientY, rect, camera, scene, raycaster);
      const payload = raw && isEditor3dPickTexturable(raw) ? raw : null;
      onHoverTexturablePick(payload);
      el.style.cursor = "crosshair";
    };

    const onPointerUp = (ev: PointerEvent): void => {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down || ev.button !== 0) {
        return;
      }
      if (modalOpen || blocked()) {
        return;
      }
      if (draggedRef.current) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const raw = pickEditor3dFromPointer(ev.clientX, ev.clientY, rect, camera, scene, raycaster);
      if (raw && isEditor3dPickTexturable(raw)) {
        useAppStore.getState().openTextureApply3dParamsModal(raw);
      }
    };

    const onPointerCancel = (): void => {
      pointerDownRef.current = null;
      draggedRef.current = false;
    };

    const onContextMenu = (ev: MouseEvent): void => {
      ev.preventDefault();
      if (modalOpen || blocked()) {
        return;
      }
      useAppStore.getState().cancelTextureApply3dTool();
    };

    const onPointerLeave = (): void => {
      onHoverTexturablePick(null);
      el.style.cursor = "default";
    };

    el.style.cursor = modalOpen ? "default" : "crosshair";
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("contextmenu", onContextMenu);
    el.addEventListener("pointerleave", onPointerLeave);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("contextmenu", onContextMenu);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.style.cursor = "default";
    };
  }, [gl, camera, scene, raycaster, modalOpen, onHoverTexturablePick]);

  return null;
}
