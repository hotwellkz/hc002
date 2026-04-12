import type { ViewportState3D } from "@/core/domain/viewState";
import * as THREE from "three";

const MM = 0.001;
const MIN_DISTANCE_MM = 2_500;
const FIT_MARGIN_COVER = 1.12;

/** Углы «спереди-сбоку»: между фасадами по азимуту, умеренный наклон (не рыбий глаз). */
export type CoverCameraCorner = "front_left" | "front_right" | "rear_left" | "rear_right";

function perspectiveDistanceMmToFitSphereRadius(
  radiusM: number,
  verticalFovDeg: number,
  aspect: number,
  margin: number,
): number {
  if (!(radiusM > 0) || !Number.isFinite(radiusM)) {
    return MIN_DISTANCE_MM;
  }
  const vFov = THREE.MathUtils.degToRad(verticalFovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.2, aspect));
  const dVert = radiusM / Math.tan(vFov / 2);
  const dHorz = radiusM / Math.tan(hFov / 2);
  const dM = Math.max(dVert, dHorz) * margin;
  return Math.max(MIN_DISTANCE_MM, dM / MM);
}

function planTargetMmFromBox3Center(box: THREE.Box3): THREE.Vector3 {
  const c = new THREE.Vector3();
  box.getCenter(c);
  return new THREE.Vector3(c.x / MM, -c.z / MM, c.y / MM);
}

function boundingSphereRadiusM(box: THREE.Box3): number {
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return Math.max(sphere.radius, 0.25);
}

/**
 * Угол «cover_front_corner»: слегка выше горизонта, между двумя фасадами.
 * phi — полярный угол Three.Spherical (от +Y), theta — азимут в плоскости XZ.
 */
export function coverCornerAngles(corner: CoverCameraCorner): { readonly phi: number; readonly theta: number } {
  const phi = 1.12;
  switch (corner) {
    case "front_left":
      return { phi, theta: -Math.PI / 4 };
    case "front_right":
      return { phi, theta: Math.PI / 4 };
    case "rear_left":
      return { phi, theta: (-3 * Math.PI) / 4 };
    case "rear_right":
      return { phi, theta: (3 * Math.PI) / 4 };
    default: {
      const _e: never = corner;
      return _e;
    }
  }
}

/**
 * Пресет камеры «cover_front_corner» и варианты углов: центр bbox дома, дистанция по сфере ограничения.
 */
export function viewport3dForCoverCorner(
  box: THREE.Box3,
  corner: CoverCameraCorner,
  verticalFovDeg: number,
  aspect: number,
): ViewportState3D {
  const empty = box.isEmpty();
  const target = empty ? new THREE.Vector3(0, 0, 1500) : planTargetMmFromBox3Center(box);
  const radiusM = empty ? 6 : boundingSphereRadiusM(box);
  const { phi, theta } = coverCornerAngles(corner);
  const distMm = perspectiveDistanceMmToFitSphereRadius(radiusM, verticalFovDeg, aspect, FIT_MARGIN_COVER);
  return {
    polarAngle: phi,
    azimuthalAngle: theta,
    distance: distMm,
    targetXMm: target.x,
    targetYMm: target.y,
    targetZMm: target.z,
  };
}

export { MM };
