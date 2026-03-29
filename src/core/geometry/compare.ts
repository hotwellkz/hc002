import { GEOMETRY_EPSILON_MM } from "./constants";

export function nearlyEqual(a: number, b: number, eps = GEOMETRY_EPSILON_MM): boolean {
  return Math.abs(a - b) <= eps;
}

export function nearlyZero(value: number, eps = GEOMETRY_EPSILON_MM): boolean {
  return nearlyEqual(value, 0, eps);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
