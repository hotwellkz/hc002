import type { Opening3dMeshKind } from "./opening3dAssemblySpecs";
import type { Editor3dPickPayload } from "./editor3dPickPayload";
import type { Project } from "./project";

const NON_TEXTURABLE_OPENING: ReadonlySet<Opening3dMeshKind> = new Set(["window_glass"]);

export function isOpeningMeshKindTexturable(kind: Opening3dMeshKind | undefined): boolean {
  if (kind == null) {
    return true;
  }
  return !NON_TEXTURABLE_OPENING.has(kind);
}

/** Raycast-попадание можно назначить текстуру (стекло исключаем). */
export function isEditor3dPickTexturable(pick: Editor3dPickPayload): boolean {
  if (pick.kind === "roofBatten") {
    return false;
  }
  if (pick.kind !== "opening") {
    return true;
  }
  return isOpeningMeshKindTexturable(pick.openingMeshKind);
}

export function pickLayerIdForSurfaceTexture(project: Project, pick: Editor3dPickPayload): string | null {
  switch (pick.kind) {
    case "wall":
      return project.walls.find((w) => w.id === pick.entityId)?.layerId ?? null;
    case "slab":
      return project.slabs.find((s) => s.id === pick.entityId)?.layerId ?? null;
    case "foundationStrip":
      return project.foundationStrips.find((s) => s.id === pick.entityId)?.layerId ?? null;
    case "foundationPile":
      return project.foundationPiles.find((p) => p.id === pick.entityId)?.layerId ?? null;
    case "calc":
      return project.walls.find((w) => w.id === pick.entityId)?.layerId ?? null;
    case "opening": {
      const op = project.openings.find((o) => o.id === pick.entityId);
      const wallId = op?.wallId;
      if (wallId == null) {
        return null;
      }
      return project.walls.find((w) => w.id === wallId)?.layerId ?? null;
    }
    case "roofBatten":
      return null;
    default:
      return null;
  }
}
