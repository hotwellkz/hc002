/** Префикс синтетического id доски обрешётки в 3D (не сущность проекта). */
export const ROOF_BATTEN_PICK_PREFIX = "roofBatten:";

export function roofBattenPickEntityId(planeId: string, battenIndex: number): string {
  return `${ROOF_BATTEN_PICK_PREFIX}${planeId}:${battenIndex}`;
}

export function roofBattenPickReactKey(planeId: string, battenIndex: number): string {
  return `roofBatten-${planeId}-${battenIndex}`;
}

export function parseRoofBattenPickEntityId(entityId: string): { readonly planeId: string; readonly battenIndex: number } | null {
  if (!entityId.startsWith(ROOF_BATTEN_PICK_PREFIX)) {
    return null;
  }
  const rest = entityId.slice(ROOF_BATTEN_PICK_PREFIX.length);
  const lastColon = rest.lastIndexOf(":");
  if (lastColon <= 0) {
    return null;
  }
  const planeId = rest.slice(0, lastColon);
  const battenIndex = Number(rest.slice(lastColon + 1));
  if (!Number.isFinite(battenIndex) || !Number.isInteger(battenIndex) || battenIndex < 0) {
    return null;
  }
  return { planeId, battenIndex };
}
