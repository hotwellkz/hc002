import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Raycaster } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import { hasBlockingEditorOverlayModal } from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { useAppStore } from "@/store/useAppStore";

import { orbitPivotWorldPointFromPointer } from "./editor3dPick";
import { type OrbitControlsLike, viewport3dFromOrbitControls } from "./viewport3dThreeSync";

function editorOverlaySnapshot() {
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
    roofSystemEditModal: s.roofSystemEditModal,
    roofPlaneEditModal: s.roofPlaneEditModal,
    wallJointParamsModalOpen: s.wallJointParamsModalOpen,
    wallCalculationModalOpen: s.wallCalculationModalOpen,
    roofCalculationModalOpen: s.roofCalculationModalOpen,
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

interface Editor3dOrbitPivotCoordinatorProps {
  readonly modeActive: boolean;
  readonly flyModeActive: boolean;
  readonly onPivotMarkerWorld: (p: readonly [number, number, number] | null) => void;
}

/**
 * Raycast по ЛКМ (capture) → точка на геометрии как orbit.target; сохранение радиуса камеры.
 * Вход/выход из режима: фиксация и плавное восстановление baseline target без рывка (параллельный перенос камеры и target).
 */
export function Editor3dOrbitPivotCoordinator({
  modeActive,
  flyModeActive,
  onPivotMarkerWorld,
}: Editor3dOrbitPivotCoordinatorProps) {
  const { gl, camera, scene, controls } = useThree();
  const setViewport3d = useAppStore((s) => s.setViewport3d);
  const raycaster = useMemo(() => new Raycaster(), []);
  const prevCombinedRef = useRef(false);
  const baselineRef = useRef<THREE.Vector3 | null>(null);

  const orbit = controls as OrbitControlsImpl | null;

  const combinedActive = modeActive && !flyModeActive;

  useLayoutEffect(() => {
    const c = orbit;
    if (!c) {
      return;
    }

    const was = prevCombinedRef.current;
    if (combinedActive && !was) {
      baselineRef.current = c.target.clone();
      onPivotMarkerWorld(null);
    }

    if (!combinedActive && was && baselineRef.current) {
      const base = baselineRef.current;
      const delta = new THREE.Vector3().subVectors(base, c.target);
      camera.position.add(delta);
      c.target.copy(base);
      c.update();
      setViewport3d(viewport3dFromOrbitControls(c as OrbitControlsLike));
      baselineRef.current = null;
      onPivotMarkerWorld(null);
    }

    prevCombinedRef.current = combinedActive;
  }, [combinedActive, orbit, camera, setViewport3d, onPivotMarkerWorld]);

  useEffect(() => {
    if (!combinedActive || !orbit) {
      return;
    }

    const el = gl.domElement;

    const onPointerDownCapture = (ev: PointerEvent): void => {
      if (ev.button !== 0) {
        return;
      }
      if (hasBlockingEditorOverlayModal(editorOverlaySnapshot())) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const hit = orbitPivotWorldPointFromPointer(ev.clientX, ev.clientY, rect, camera, scene, raycaster);
      if (!hit) {
        return;
      }

      const c = orbit;
      const oldT = c.target.clone();
      const cam = camera.position;
      const oldRadius = cam.distanceTo(oldT);
      const dir = new THREE.Vector3().subVectors(cam, hit);
      if (dir.lengthSq() < 1e-14) {
        return;
      }
      dir.normalize();
      cam.copy(hit.clone().addScaledVector(dir, oldRadius));
      c.target.copy(hit);
      c.update();
      setViewport3d(viewport3dFromOrbitControls(c as OrbitControlsLike));
      onPivotMarkerWorld([hit.x, hit.y, hit.z]);
    };

    el.addEventListener("pointerdown", onPointerDownCapture, true);

    return () => {
      el.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
  }, [combinedActive, orbit, gl, camera, scene, raycaster, setViewport3d, onPivotMarkerWorld]);

  return null;
}
