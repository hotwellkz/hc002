import type { ViewportState3D } from "@/core/domain/viewState";
import * as THREE from "three";

/** Drei/three-stdlib OrbitControls — общий контракт без привязки к конкретному пакету типов. */
export type OrbitControlsLike = {
  readonly target: THREE.Vector3;
  readonly object: THREE.Camera;
  update: () => void;
};

const MM = 0.001;

/** Мм плана (X,Y) и высота pivot (мм) → target в Three.js (Y вверх, план Y → -Z). */
export function planTargetMmToThreeVector(v: ViewportState3D): THREE.Vector3 {
  return new THREE.Vector3(v.targetXMm * MM, v.targetZMm * MM, -v.targetYMm * MM);
}

export function initialCameraPositionFromViewport3d(v: ViewportState3D): [number, number, number] {
  const target = planTargetMmToThreeVector(v);
  const sph = new THREE.Spherical(v.distance * MM, v.polarAngle, v.azimuthalAngle);
  const off = new THREE.Vector3().setFromSpherical(sph);
  const p = target.clone().add(off);
  return [p.x, p.y, p.z];
}

export function applyViewport3dToOrbitControls(controls: OrbitControlsLike, v: ViewportState3D): void {
  const cam = controls.object as THREE.PerspectiveCamera;
  const target = planTargetMmToThreeVector(v);
  controls.target.copy(target);
  const sph = new THREE.Spherical(v.distance * MM, v.polarAngle, v.azimuthalAngle);
  const off = new THREE.Vector3().setFromSpherical(sph);
  cam.position.copy(target).add(off);
  controls.update();
}

export function viewport3dFromOrbitControls(controls: OrbitControlsLike): ViewportState3D {
  const cam = controls.object as THREE.PerspectiveCamera;
  const t = controls.target;
  const offset = new THREE.Vector3().subVectors(cam.position, t);
  const sph = new THREE.Spherical().setFromVector3(offset);
  return {
    polarAngle: sph.phi,
    azimuthalAngle: sph.theta,
    distance: sph.radius / MM,
    targetXMm: t.x / MM,
    targetYMm: -t.z / MM,
    targetZMm: t.y / MM,
  };
}
