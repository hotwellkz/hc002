import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useRef } from "react";
import type { OrbitControls as DreiOrbitControlsImpl } from "three-stdlib";

import type { ViewportState3D } from "@/core/domain/viewState";
import { useAppStore } from "@/store/useAppStore";

import {
  applyViewport3dToOrbitControls,
  type OrbitControlsLike,
  viewport3dFromOrbitControls,
} from "./viewport3dThreeSync";

function serializeViewport3d(v: ViewportState3D): string {
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
 * Орбита и камера читают/пишут {@link Project.viewState.viewport3d} (персистится в проекте).
 * При смене target извне (например перенос базы плана) камера пересобирается из сферических координат.
 */
export function Editor3dOrbitControls({
  flyModeActive,
  suspendApplyFromStore,
  lastAppliedSerialRef,
}: {
  readonly flyModeActive: boolean;
  /** Пока true — не перезаписывать камеру из zustand (внешняя анимация пресетов). */
  readonly suspendApplyFromStore?: boolean;
  /** Общий serial с аниматором пресетов, чтобы не было рывка после анимации. */
  readonly lastAppliedSerialRef?: MutableRefObject<string>;
}) {
  const ref = useRef<DreiOrbitControlsImpl | null>(null);
  const viewport3d = useAppStore((s) => s.currentProject.viewState.viewport3d);
  const setViewport3d = useAppStore((s) => s.setViewport3d);
  const ownLastApplied = useRef<string>("");
  const lastApplied = lastAppliedSerialRef ?? ownLastApplied;

  useFrame(() => {
    if (flyModeActive || suspendApplyFromStore) {
      return;
    }
    const ctrl = ref.current;
    if (!ctrl) {
      return;
    }
    const serialized = serializeViewport3d(viewport3d);
    if (serialized === lastApplied.current) {
      return;
    }
    lastApplied.current = serialized;
    applyViewport3dToOrbitControls(ctrl as OrbitControlsLike, viewport3d);
  });

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enabled={!flyModeActive && !suspendApplyFromStore}
      enableDamping
      dampingFactor={0.08}
      onEnd={() => {
        const ctrl = ref.current;
        if (!ctrl) {
          return;
        }
        const next = viewport3dFromOrbitControls(ctrl as OrbitControlsLike);
        lastApplied.current = serializeViewport3d(next);
        setViewport3d(next);
      }}
    />
  );
}

