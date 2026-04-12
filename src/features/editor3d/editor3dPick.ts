import type { Camera, Intersection, Object3D, Vector3 } from "three";
import { Raycaster, Vector2 } from "three";

import type { Editor3dPickKind, Editor3dPickPayload } from "@/core/domain/editor3dPickPayload";

export type { Editor3dPickKind, Editor3dPickPayload } from "@/core/domain/editor3dPickPayload";

const PICK_PRIORITY: Record<Editor3dPickKind, number> = {
  opening: 3,
  foundationPile: 2,
  foundationStrip: 2,
  slab: 2,
  wall: 2,
  floorBeam: 2,
  roofBatten: 2,
  calc: 1,
};

function pickPriority(kind: Editor3dPickKind): number {
  return PICK_PRIORITY[kind] ?? 0;
}

export function readPickFromObjectChain(object: Object3D): Editor3dPickPayload | null {
  let o: Object3D | null = object;
  while (o) {
    const raw = o.userData as { editor3dPick?: Editor3dPickPayload };
    if (raw?.editor3dPick?.kind && raw.editor3dPick.entityId && raw.editor3dPick.reactKey) {
      return raw.editor3dPick;
    }
    o = o.parent;
  }
  return null;
}

/** Сетка/оси и пр.: не использовать как точку orbit-pivot. */
function hasExcludeOrbitPivotAncestor(object: Object3D): boolean {
  let o: Object3D | null = object;
  while (o) {
    if ((o.userData as { editor3dExcludeFromOrbitPivot?: boolean }).editor3dExcludeFromOrbitPivot) {
      return true;
    }
    o = o.parent;
  }
  return false;
}

/** Попадания ближе этого порога (м) к первому hit считаются «в одном месте» — тогда выигрывает приоритет (проём > стена > расчёт). */
const DEPTH_TIE_EPS_M = 0.04;

/**
 * Из пересечений Raycaster: среди попаданий почти у ближайшей поверхности выбираем максимальный приоритет,
 * затем минимальное расстояние. Так окно/дверь побеждают совпадающую по глубине стену, но не окно «сзади» стены.
 * Возвращает пересечение с {@link Intersection.point} на геометрии.
 */
export function nearestEditor3dPickIntersection(intersections: readonly Intersection[]): Intersection | null {
  let minDist = Infinity;
  for (const inter of intersections) {
    if (hasExcludeOrbitPivotAncestor(inter.object)) {
      continue;
    }
    if (readPickFromObjectChain(inter.object)) {
      minDist = Math.min(minDist, inter.distance);
    }
  }
  if (!Number.isFinite(minDist)) {
    return null;
  }
  const depthLimit = minDist + DEPTH_TIE_EPS_M;
  let best: { readonly dist: number; readonly inter: Intersection } | null = null;
  for (const inter of intersections) {
    if (hasExcludeOrbitPivotAncestor(inter.object)) {
      continue;
    }
    if (inter.distance > depthLimit) {
      continue;
    }
    const payload = readPickFromObjectChain(inter.object);
    if (!payload) {
      continue;
    }
    const dist = inter.distance;
    if (!best) {
      best = { dist, inter };
      continue;
    }
    const cp = pickPriority(payload.kind);
    const bp = pickPriority(readPickFromObjectChain(best.inter.object)!.kind);
    if (cp > bp || (cp === bp && dist < best.dist)) {
      best = { dist, inter };
    }
  }
  return best?.inter ?? null;
}

export function nearestEditor3dPickFromIntersections(intersections: readonly Intersection[]): Editor3dPickPayload | null {
  const hit = nearestEditor3dPickIntersection(intersections);
  return hit ? readPickFromObjectChain(hit.object) : null;
}

const ndcScratch = new Vector2();

export function pickEditor3dFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  camera: Camera,
  root: Object3D,
  raycaster: Raycaster,
): Editor3dPickPayload | null {
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  ndcScratch.set(x, y);
  raycaster.setFromCamera(ndcScratch, camera);
  const hits = raycaster.intersectObject(root, true);
  return nearestEditor3dPickFromIntersections(hits);
}

/**
 * Мировая точка попадания луча в pickable-геометрию (не центр объекта), для orbit-pivot.
 */
export function orbitPivotWorldPointFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  camera: Camera,
  root: Object3D,
  raycaster: Raycaster,
): Vector3 | null {
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  ndcScratch.set(x, y);
  raycaster.setFromCamera(ndcScratch, camera);
  const hits = raycaster.intersectObject(root, true);
  const best = nearestEditor3dPickIntersection(hits);
  return best ? best.point.clone() : null;
}

export function editor3dPickUserData(payload: Editor3dPickPayload): { readonly editor3dPick: Editor3dPickPayload } {
  return { editor3dPick: payload };
}
