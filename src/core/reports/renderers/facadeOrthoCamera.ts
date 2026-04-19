import * as THREE from "three";

import type { ElevationCardinal } from "../geometry/elevation2d";

const FIT_MARGIN = 1.14;

/**
 * Ортографическая камера строго по осям: фронт/зад — плоскость X×Y, лево/право — Z×Y (мир Three.js).
 * План: X и −Z соответствуют осям плана; Y — высота.
 */
export function fitOrthoCameraForElevation(
  camera: THREE.OrthographicCamera,
  box: THREE.Box3,
  facing: ElevationCardinal,
  viewAspect: number,
  margin: number = FIT_MARGIN,
): void {
  if (!(viewAspect > 0) || !Number.isFinite(viewAspect)) {
    return;
  }
  if (box.isEmpty()) {
    box.set(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 12, 8));
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  const m = margin;
  let spanU: number;
  let spanV: number;
  /** Единичный вектор от центра к камере (наблюдатель снаружи). */
  let eye: THREE.Vector3;

  switch (facing) {
    case "front":
      spanU = size.x * m;
      spanV = size.y * m;
      eye = new THREE.Vector3(0, 0, 1);
      break;
    case "back":
      spanU = size.x * m;
      spanV = size.y * m;
      eye = new THREE.Vector3(0, 0, -1);
      break;
    case "left":
      spanU = size.z * m;
      spanV = size.y * m;
      eye = new THREE.Vector3(-1, 0, 0);
      break;
    case "right":
      spanU = size.z * m;
      spanV = size.y * m;
      eye = new THREE.Vector3(1, 0, 0);
      break;
  }

  let halfU = spanU / 2;
  let halfV = spanV / 2;
  const contentAspect = spanU / Math.max(spanV, 1e-9);
  if (contentAspect > viewAspect) {
    halfV = halfU / viewAspect;
  } else {
    halfU = halfV * viewAspect;
  }

  const dist = Math.max(size.x, size.y, size.z) * m * 2.8;
  camera.up.set(0, 1, 0);
  camera.position.copy(center).add(eye.multiplyScalar(dist));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  let left = -halfU;
  let right = halfU;
  /** Устранить зеркальность для сторон, где lookAt инвертирует горизонталь относительно чертежного фасада. */
  if (facing === "back" || facing === "right") {
    left = halfU;
    right = -halfU;
  }

  camera.left = left;
  camera.right = right;
  camera.top = halfV;
  camera.bottom = -halfV;
  camera.near = 0.05;
  camera.far = Math.max(size.length() * 8, 120);
  camera.updateProjectionMatrix();
}
