/**
 * Мягкая привязка направления второй точки стены к шагу 45° (план: +X = 0°, +Y = 90°).
 * Ортогонали — более широкий допуск; диагонали — уже; гистерезис против «дрожания».
 */

import type { Point2D } from "./types";

/** 0°, 90°, 180°, 270° — приоритет и более широкий захват. */
export const WALL_ANGLE_SNAP_ORTH_TOL_DEG = 7;

/** 45°, 135°, … — чуть уже. */
export const WALL_ANGLE_SNAP_DIAG_TOL_DEG = 5;

/** Гистерезис: отпускание ортогонали (шире, чем у диагонали). */
export const WALL_ANGLE_SNAP_RELEASE_ORTH_DEG = 13;

/** Гистерезис для диагоналей 45°. */
export const WALL_ANGLE_SNAP_RELEASE_DIAG_DEG = 11;

const ORTH = [0, 90, 180, 270] as const;
const DIAG = [45, 135, 225, 315] as const;

function isOrthogonalSnapAngleDeg(deg: number): boolean {
  const n = normalizeAngleDeg360(deg);
  return ORTH.some((t) => circularDiffDeg(n, t) < 0.01);
}

export function normalizeAngleDeg360(angleDeg: number): number {
  let x = angleDeg % 360;
  if (x < 0) {
    x += 360;
  }
  return x;
}

/** Кратчайшая разница между двумя углами, 0…180°. */
export function circularDiffDeg(aDeg: number, bDeg: number): number {
  const d = Math.abs(normalizeAngleDeg360(aDeg) - normalizeAngleDeg360(bDeg)) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Возвращает целевой угол привязки или null (свободное направление).
 * `lockedDeg` — предыдущая защёлка для гистерезиса.
 */
export function wallDirectionAngleSnapDeg(
  rawDeg: number,
  lockedDeg: number | null,
): { readonly snappedDeg: number | null; readonly nextLockedDeg: number | null } {
  const raw = normalizeAngleDeg360(rawDeg);

  if (lockedDeg != null) {
    const dist = circularDiffDeg(raw, lockedDeg);
    const release = isOrthogonalSnapAngleDeg(lockedDeg)
      ? WALL_ANGLE_SNAP_RELEASE_ORTH_DEG
      : WALL_ANGLE_SNAP_RELEASE_DIAG_DEG;
    if (dist <= release) {
      return { snappedDeg: normalizeAngleDeg360(lockedDeg), nextLockedDeg: normalizeAngleDeg360(lockedDeg) };
    }
  }

  let bestOrth: { readonly t: number; readonly d: number } | null = null;
  for (const t of ORTH) {
    const d = circularDiffDeg(raw, t);
    if (d <= WALL_ANGLE_SNAP_ORTH_TOL_DEG && (!bestOrth || d < bestOrth.d)) {
      bestOrth = { t, d };
    }
  }
  if (bestOrth) {
    return { snappedDeg: bestOrth.t, nextLockedDeg: bestOrth.t };
  }

  let bestDiag: { readonly t: number; readonly d: number } | null = null;
  for (const t of DIAG) {
    const d = circularDiffDeg(raw, t);
    if (d <= WALL_ANGLE_SNAP_DIAG_TOL_DEG && (!bestDiag || d < bestDiag.d)) {
      bestDiag = { t, d };
    }
  }
  if (bestDiag) {
    return { snappedDeg: bestDiag.t, nextLockedDeg: bestDiag.t };
  }

  return { snappedDeg: null, nextLockedDeg: null };
}

export function secondPointAlongSnappedDirectionMm(
  first: { readonly x: number; readonly y: number },
  previewEnd: { readonly x: number; readonly y: number },
  snappedDeg: number,
): { readonly x: number; readonly y: number } {
  const vx = previewEnd.x - first.x;
  const vy = previewEnd.y - first.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-9) {
    return { x: first.x, y: first.y };
  }
  const rad = (normalizeAngleDeg360(snappedDeg) * Math.PI) / 180;
  return { x: first.x + len * Math.cos(rad), y: first.y + len * Math.sin(rad) };
}

/**
 * После геометрического snap второй точки — мягкая угловая привязка направления от `first`.
 */
export function applyWallDirectionAngleSnapToPoint(
  first: Point2D,
  rawEnd: Point2D,
  lockedDeg: number | null,
  opts?: { readonly altKey?: boolean },
): { readonly point: Point2D; readonly nextLockedDeg: number | null } {
  if (opts?.altKey) {
    return { point: rawEnd, nextLockedDeg: null };
  }
  const vx = rawEnd.x - first.x;
  const vy = rawEnd.y - first.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-4) {
    return { point: rawEnd, nextLockedDeg: null };
  }
  const rawDeg = (Math.atan2(vy, vx) * 180) / Math.PI;
  const { snappedDeg, nextLockedDeg } = wallDirectionAngleSnapDeg(rawDeg, lockedDeg);
  if (snappedDeg == null) {
    return { point: rawEnd, nextLockedDeg: null };
  }
  return {
    point: secondPointAlongSnappedDirectionMm(first, rawEnd, snappedDeg),
    nextLockedDeg,
  };
}
