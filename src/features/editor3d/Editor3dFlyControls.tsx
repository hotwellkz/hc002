import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";

import { hasBlockingEditorOverlayModal } from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { isEditableKeyboardTarget } from "@/shared/editableKeyboardTarget";
import { useAppStore } from "@/store/useAppStore";

import { viewport3dFromPerspectiveCamera } from "./viewport3dThreeSync";

const FORWARD_TARGET_MM = 10_000;
const BASE_SPEED = 4.2;
const FAST_MULT = 2.75;
const LOOK_SENS = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.02;

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

function flyInputBlocked(): boolean {
  return hasBlockingEditorOverlayModal(editorOverlaySnapshot());
}

interface Editor3dFlyControlsProps {
  readonly enabled: boolean;
}

/**
 * Отдельный FPS-полёт: WASD + Q/E, мышь при pointer lock, без смешивания с OrbitControls.
 */
export function Editor3dFlyControls({ enabled }: Editor3dFlyControlsProps) {
  const { camera, gl } = useThree();
  const setViewport3d = useAppStore((s) => s.setViewport3d);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const wasEnabledRef = useRef(false);

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (wasEnabledRef.current && !enabled) {
      setViewport3d(viewport3dFromPerspectiveCamera(cam, FORWARD_TARGET_MM));
    }
    wasEnabledRef.current = enabled;
  }, [enabled, camera, setViewport3d]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const cam = camera as THREE.PerspectiveCamera;
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    euler.setFromQuaternion(cam.quaternion);
    yawRef.current = euler.y;
    pitchRef.current = euler.x;
  }, [enabled, camera]);

  useEffect(() => {
    const el = gl.domElement;

    if (!enabled) {
      if (document.pointerLockElement === el) {
        document.exitPointerLock();
      }
      el.style.cursor = "";
      return;
    }

    el.tabIndex = 0;

    const onClick = (): void => {
      if (flyInputBlocked()) {
        return;
      }
      if (document.pointerLockElement === el) {
        return;
      }
      el.requestPointerLock();
    };

    const onPointerLockChange = (): void => {
      if (document.pointerLockElement !== el) {
        keysRef.current.clear();
      }
      el.style.cursor = document.pointerLockElement === el ? "none" : "";
    };

    const onMouseMove = (ev: MouseEvent): void => {
      if (document.pointerLockElement !== el || flyInputBlocked()) {
        return;
      }
      yawRef.current -= ev.movementX * LOOK_SENS;
      pitchRef.current -= ev.movementY * LOOK_SENS;
      pitchRef.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitchRef.current));
    };

    el.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);

    return () => {
      el.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      el.style.cursor = "";
    };
  }, [enabled, gl]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (document.pointerLockElement !== gl.domElement) {
        return;
      }
      if (isEditableKeyboardTarget(ev.target)) {
        return;
      }
      if (flyInputBlocked()) {
        return;
      }
      keysRef.current.add(ev.code);
    };

    const onKeyUp = (ev: KeyboardEvent): void => {
      keysRef.current.delete(ev.code);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      keysRef.current.clear();
    };
  }, [enabled, gl]);

  const tmpForward = useRef(new THREE.Vector3());
  const tmpRight = useRef(new THREE.Vector3());
  const tmpMove = useRef(new THREE.Vector3());
  const tmpWorldUp = useRef(new THREE.Vector3(0, 1, 0));

  useFrame((_, delta) => {
    if (!enabled) {
      return;
    }
    const cam = camera as THREE.PerspectiveCamera;
    const locked = document.pointerLockElement === gl.domElement;
    if (!locked || flyInputBlocked()) {
      cam.rotation.order = "YXZ";
      cam.rotation.y = yawRef.current;
      cam.rotation.x = pitchRef.current;
      cam.rotation.z = 0;
      return;
    }

    const keys = keysRef.current;
    const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = BASE_SPEED * (fast ? FAST_MULT : 1) * Math.min(delta, 0.05);

    cam.rotation.order = "YXZ";
    cam.rotation.y = yawRef.current;
    cam.rotation.x = pitchRef.current;
    cam.rotation.z = 0;

    const forward = tmpForward.current;
    const right = tmpRight.current;
    const move = tmpMove.current;
    cam.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 1e-10) {
      forward.normalize();
    } else {
      forward.set(0, 0, -1).applyQuaternion(cam.quaternion);
      forward.y = 0;
      if (forward.lengthSq() > 1e-10) {
        forward.normalize();
      }
    }
    right.crossVectors(forward, tmpWorldUp.current);
    if (right.lengthSq() < 1e-12) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }

    move.set(0, 0, 0);
    if (keys.has("KeyW")) {
      move.add(forward);
    }
    if (keys.has("KeyS")) {
      move.sub(forward);
    }
    if (keys.has("KeyD")) {
      move.add(right);
    }
    if (keys.has("KeyA")) {
      move.sub(right);
    }
    if (keys.has("KeyQ")) {
      move.y += 1;
    }
    if (keys.has("KeyE")) {
      move.y -= 1;
    }

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      cam.position.add(move);
    }
  });

  return null;
}
