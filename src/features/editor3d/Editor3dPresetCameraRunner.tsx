import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { Group } from "three";
import * as THREE from "three";

import type { ViewportState3D } from "@/core/domain/viewState";
import { useAppStore } from "@/store/useAppStore";

import {
  easeInOutCubic,
  type Editor3dCameraPresetKind,
  viewport3dForPresetFromBox,
} from "./editor3dCameraPresetsMath";
import { applyViewport3dToOrbitControls, type OrbitControlsLike } from "./viewport3dThreeSync";

const ANIM_MS = 320;

type Anim = {
  readonly t0: number;
  readonly duration: number;
  readonly fromPos: THREE.Vector3;
  readonly fromTgt: THREE.Vector3;
  readonly toPos: THREE.Vector3;
  readonly toTgt: THREE.Vector3;
  readonly endViewport: ViewportState3D;
};

function serializeForCompare(v: ViewportState3D): string {
  return JSON.stringify({
    polarAngle: v.polarAngle,
    azimuthalAngle: v.azimuthalAngle,
    distance: v.distance,
    targetXMm: v.targetXMm,
    targetYMm: v.targetYMm,
    targetZMm: v.targetZMm,
  });
}

/**
 * Плавная анимация камеры к пресету; во время анимации родитель отключает синхрон орбиты из store.
 */
export function Editor3dPresetCameraRunner({
  modelBoundsRef,
  pending,
  flyModeActive,
  onDrivingChange,
  onConsumed,
  orbitLastAppliedRef,
}: {
  readonly modelBoundsRef: RefObject<Group | null>;
  readonly pending: { readonly id: number; readonly kind: Editor3dCameraPresetKind } | null;
  readonly flyModeActive: boolean;
  readonly onDrivingChange: (v: boolean) => void;
  readonly onConsumed: () => void;
  readonly orbitLastAppliedRef: MutableRefObject<string>;
}) {
  const setViewport3d = useAppStore((s) => s.setViewport3d);
  const { camera, controls, size } = useThree();
  const animRef = useRef<Anim | null>(null);

  useEffect(() => {
    if (!flyModeActive || animRef.current == null) {
      return;
    }
    animRef.current = null;
    onDrivingChange(false);
    onConsumed();
  }, [flyModeActive, onConsumed, onDrivingChange]);

  useLayoutEffect(() => {
    if (flyModeActive || pending == null) {
      return;
    }

    const ctrl = controls as OrbitControlsLike | null;
    if (!ctrl || !(camera instanceof THREE.PerspectiveCamera)) {
      onConsumed();
      return;
    }

    const box = new THREE.Box3();
    const root = modelBoundsRef.current;
    if (root) {
      box.setFromObject(root);
    }

    const aspect = size.width / Math.max(1, size.height);
    const endV = viewport3dForPresetFromBox(pending.kind, box, camera.fov, aspect);

    const fromPos = camera.position.clone();
    const fromTgt = ctrl.target.clone();

    applyViewport3dToOrbitControls(ctrl, endV);
    const toPos = camera.position.clone();
    const toTgt = ctrl.target.clone();

    camera.position.copy(fromPos);
    ctrl.target.copy(fromTgt);
    ctrl.update();

    animRef.current = {
      t0: performance.now(),
      duration: ANIM_MS,
      fromPos,
      fromTgt,
      toPos,
      toTgt,
      endViewport: endV,
    };
    onDrivingChange(true);
  }, [pending?.id, pending?.kind, flyModeActive, camera, controls, size.height, size.width, modelBoundsRef, onConsumed, onDrivingChange]);

  useFrame(() => {
    const ctrl = controls as OrbitControlsLike | null;
    const a = animRef.current;
    if (!a || !ctrl || !(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }
    const rawT = (performance.now() - a.t0) / a.duration;
    const t = easeInOutCubic(rawT);
    camera.position.lerpVectors(a.fromPos, a.toPos, t);
    ctrl.target.lerpVectors(a.fromTgt, a.toTgt, t);
    ctrl.update();

    if (rawT >= 1) {
      const endViewport = a.endViewport;
      animRef.current = null;
      camera.position.copy(a.toPos);
      ctrl.target.copy(a.toTgt);
      ctrl.update();
      setViewport3d(endViewport);
      orbitLastAppliedRef.current = serializeForCompare(endViewport);
      onDrivingChange(false);
      onConsumed();
    }
  });

  return null;
}
