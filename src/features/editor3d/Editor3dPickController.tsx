import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Raycaster } from "three";

import { editor3dPickSupportsContextDelete } from "@/core/domain/editor3dContextMenuPolicy";
import { openSelectedObjectEditor } from "@/features/project/objectEditorActions";
import { hasBlockingEditorOverlayModal } from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { useAppStore } from "@/store/useAppStore";

import type { Editor3dPickPayload } from "./editor3dPick";
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

function applyPickToStore(
  payload: Editor3dPickPayload,
  setCalcFocus: (v: { readonly wallId: string; readonly reactKey: string } | null) => void,
): void {
  const store = useAppStore.getState();
  if (payload.kind === "opening") {
    setCalcFocus(null);
    store.setSelectedEntityIds([payload.entityId]);
    return;
  }
  if (payload.kind === "foundationPile") {
    setCalcFocus(null);
    store.setSelectedEntityIds([payload.entityId]);
    return;
  }
  if (payload.kind === "foundationStrip") {
    setCalcFocus(null);
    store.setSelectedEntityIds([payload.entityId]);
    return;
  }
  if (payload.kind === "slab") {
    setCalcFocus(null);
    store.setSelectedEntityIds([payload.entityId]);
    return;
  }
  if (payload.kind === "wall") {
    setCalcFocus(null);
    store.setSelectedEntityIds([payload.entityId]);
    return;
  }
  if (payload.kind === "floorBeam") {
    setCalcFocus(null);
    store.setSelectedEntityIds([payload.entityId]);
    return;
  }
  setCalcFocus({ wallId: payload.entityId, reactKey: payload.reactKey });
  store.setSelectedEntityIds([payload.entityId]);
}

interface Editor3dPickControllerProps {
  readonly setCalcFocus: (v: { readonly wallId: string; readonly reactKey: string } | null) => void;
  readonly onHoverPickChange: (payload: Editor3dPickPayload | null) => void;
  readonly pickingSuspended: boolean;
  /** ЛКМ без drag не меняет выбор (режим orbit-pivot: только вращение). */
  readonly deferClickSelection: boolean;
}

/**
 * Централизованный picking: порог drag не даёт выбрать объект при вращении камеры;
 * двойной клик открывает тот же редактор свойств, что и на 2D.
 */
export function Editor3dPickController({
  setCalcFocus,
  onHoverPickChange,
  pickingSuspended,
  deferClickSelection,
}: Editor3dPickControllerProps) {
  const { gl, camera, scene } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

  const pointerDownRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const draggedRef = useRef(false);
  const rightDownRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const rightDraggedRef = useRef(false);

  useEffect(() => {
    if (pickingSuspended) {
      onHoverPickChange(null);
      gl.domElement.style.cursor = "auto";
      return;
    }

    const el = gl.domElement;

    const pickBlocked = (): boolean => {
      return hasBlockingEditorOverlayModal(editorHotkeySnapshot());
    };

    const onPointerDown = (ev: PointerEvent): void => {
      if (ev.button === 0) {
        pointerDownRef.current = { x: ev.clientX, y: ev.clientY };
        draggedRef.current = false;
        return;
      }
      if (ev.button === 2) {
        rightDownRef.current = { x: ev.clientX, y: ev.clientY };
        rightDraggedRef.current = false;
      }
    };

    const onPointerMove = (ev: PointerEvent): void => {
      const leftDown = pointerDownRef.current;
      if (leftDown) {
        const dx = ev.clientX - leftDown.x;
        const dy = ev.clientY - leftDown.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          draggedRef.current = true;
        }
      }
      const rDown = rightDownRef.current;
      if (rDown) {
        const dx = ev.clientX - rDown.x;
        const dy = ev.clientY - rDown.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          rightDraggedRef.current = true;
        }
      }
      if (pickBlocked()) {
        onHoverPickChange(null);
        el.style.cursor = "auto";
        return;
      }
      const rect = el.getBoundingClientRect();
      const payload = pickEditor3dFromPointer(ev.clientX, ev.clientY, rect, camera, scene, raycaster);
      onHoverPickChange(payload);
      el.style.cursor = payload ? "pointer" : "auto";
    };

    const onPointerUp = (ev: PointerEvent): void => {
      if (ev.button === 2) {
        rightDownRef.current = null;
        return;
      }
      if (ev.button !== 0) {
        return;
      }
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down) {
        return;
      }
      if (pickBlocked()) {
        return;
      }
      if (draggedRef.current) {
        return;
      }
      if (deferClickSelection) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const payload = pickEditor3dFromPointer(ev.clientX, ev.clientY, rect, camera, scene, raycaster);
      if (payload) {
        applyPickToStore(payload, setCalcFocus);
      } else {
        setCalcFocus(null);
        useAppStore.getState().clearSelection();
      }
    };

    const onPointerCancel = (): void => {
      pointerDownRef.current = null;
      draggedRef.current = false;
      rightDownRef.current = null;
      rightDraggedRef.current = false;
    };

    const onContextMenu = (ev: MouseEvent): void => {
      ev.preventDefault();
      if (pickBlocked()) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const payload = pickEditor3dFromPointer(ev.clientX, ev.clientY, rect, camera, scene, raycaster);
      const wasRightDrag = rightDraggedRef.current;
      rightDraggedRef.current = false;
      rightDownRef.current = null;
      if (wasRightDrag) {
        return;
      }
      if (!payload || !editor3dPickSupportsContextDelete(payload)) {
        return;
      }
      ev.stopPropagation();
      applyPickToStore(payload, setCalcFocus);
      useAppStore.getState().openEditor3dContextMenu({
        clientX: ev.clientX,
        clientY: ev.clientY,
        pick: payload,
      });
    };

    const onDblClick = (ev: MouseEvent): void => {
      if (ev.button !== 0) {
        return;
      }
      if (deferClickSelection) {
        return;
      }
      if (pickBlocked()) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const payload = pickEditor3dFromPointer(ev.clientX, ev.clientY, rect, camera, scene, raycaster);
      if (!payload) {
        return;
      }
      ev.preventDefault();
      applyPickToStore(payload, setCalcFocus);
      openSelectedObjectEditor();
    };

    const onPointerLeave = (): void => {
      onHoverPickChange(null);
      el.style.cursor = "auto";
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("dblclick", onDblClick);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("contextmenu", onContextMenu);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("dblclick", onDblClick);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("contextmenu", onContextMenu);
      el.style.cursor = "auto";
    };
  }, [gl, camera, scene, raycaster, setCalcFocus, onHoverPickChange, pickingSuspended, deferClickSelection]);

  return null;
}
