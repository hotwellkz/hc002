import type { ViewportState3D } from "@/core/domain/viewState";
import * as THREE from "three";

/** Пресеты ориентации камеры относительно осей плана (Front = смотрим вдоль +Y плана, камера с стороны −Y). */
export type Editor3dCameraPresetKind =
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "isometric"
  | "reset";

const MM = 0.001;

/** Минимальная дистанция (мм), чтобы не схлопываться на пустой сцене. */
const MIN_DISTANCE_MM = 2_500;

/** Отступ при подгонке кадра (радиус сферы). */
const FIT_MARGIN = 1.14;

const POLAR_NEAR_POLE = 0.02;
const POLAR_BOTTOM = Math.PI - POLAR_NEAR_POLE;

/**
 * Расстояние камеры (мм) от target, чтобы сфера `radiusM` целиком попала в кадр перспективной камеры.
 */
export function perspectiveDistanceMmToFitSphereRadius(
  radiusM: number,
  verticalFovDeg: number,
  aspect: number,
  margin = FIT_MARGIN,
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

/** Центр AABB в координатах плана (мм): X, Y плана и мировая высота Z. */
export function planTargetMmFromBox3Center(box: THREE.Box3): THREE.Vector3 {
  const c = new THREE.Vector3();
  box.getCenter(c);
  return new THREE.Vector3(c.x / MM, -c.z / MM, c.y / MM);
}

/** Углы орбиты Three.js (polar = от +Y, azimuth в плоскости XZ от +X). */
export function presetViewAngles(kind: Editor3dCameraPresetKind): { phi: number; theta: number } {
  switch (kind) {
    case "front":
      return { phi: Math.PI / 2, theta: 0 };
    case "back":
      return { phi: Math.PI / 2, theta: Math.PI };
    case "right":
      return { phi: Math.PI / 2, theta: Math.PI / 2 };
    case "left":
      return { phi: Math.PI / 2, theta: -Math.PI / 2 };
    case "top":
      return { phi: POLAR_NEAR_POLE, theta: 0 };
    case "bottom":
      return { phi: POLAR_BOTTOM, theta: 0 };
    case "isometric":
    case "reset":
      return { phi: Math.PI / 4, theta: Math.PI / 4 };
    default: {
      const x: never = kind;
      return x;
    }
  }
}

function boundingSphereRadiusM(box: THREE.Box3): number {
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  return Math.max(sphere.radius, 0.25);
}

/**
 * Строит {@link ViewportState3D} для пресета: target в центре bbox, дистанция по FOV, углы — стабильные мировые направления.
 */
export function viewport3dForPresetFromBox(
  kind: Editor3dCameraPresetKind,
  box: THREE.Box3,
  verticalFovDeg: number,
  aspect: number,
): ViewportState3D {
  const empty = box.isEmpty();
  const target = empty ? new THREE.Vector3(0, 0, 1500) : planTargetMmFromBox3Center(box);
  const radiusM = empty ? 6 : boundingSphereRadiusM(box);
  const { phi, theta } = presetViewAngles(kind);
  const distMm = perspectiveDistanceMmToFitSphereRadius(radiusM, verticalFovDeg, aspect);

  return {
    polarAngle: phi,
    azimuthalAngle: theta,
    distance: distMm,
    targetXMm: target.x,
    targetYMm: target.y,
    targetZMm: target.z,
  };
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function normalizeAzimuthRad(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) {
    x -= Math.PI * 2;
  }
  if (x <= -Math.PI) {
    x += Math.PI * 2;
  }
  return x;
}

/** Грубое сопоставление текущего вида с пресетом (для подсветки кнопки). */
export function viewportLikelyMatchesPreset(
  v: ViewportState3D,
  kind: Editor3dCameraPresetKind,
  angleEps = 0.07,
): boolean {
  const { phi, theta } = presetViewAngles(kind);
  const dPhi = Math.abs(v.polarAngle - phi);
  const dTheta = Math.abs(normalizeAzimuthRad(v.azimuthalAngle) - normalizeAzimuthRad(theta));
  if (kind === "top") {
    return v.polarAngle < 0.12 && dTheta < angleEps;
  }
  if (kind === "bottom") {
    return v.polarAngle > Math.PI - 0.12 && dTheta < angleEps;
  }
  return dPhi < angleEps && dTheta < angleEps;
}
