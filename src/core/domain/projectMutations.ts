import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";

/**
 * Удаляет сущности по id из проекта; стены и проёмы — каскадно (проём на удалённой стене тоже удаляется).
 */
export function deleteEntitiesFromProject(project: Project, selectedIds: ReadonlySet<string>): Project {
  const wallsKept = project.walls.filter((w) => !selectedIds.has(w.id));
  const keptWallIds = new Set(wallsKept.map((w) => w.id));
  const removedWallIds = new Set(project.walls.filter((w) => selectedIds.has(w.id)).map((w) => w.id));
  const wallCalculationsKept = project.wallCalculations.filter((c) => keptWallIds.has(c.wallId));
  const wallJointsKept = project.wallJoints.filter(
    (j) => keptWallIds.has(j.wallAId) && keptWallIds.has(j.wallBId),
  );
  const removedOpeningIds = new Set(
    project.openings.filter((o) => selectedIds.has(o.id)).map((o) => o.id),
  );
  for (const o of project.openings) {
    if (o.wallId != null && removedWallIds.has(o.wallId)) {
      removedOpeningIds.add(o.id);
    }
  }
  const openingsKept = project.openings.filter((o) => !removedOpeningIds.has(o.id));
  const framingKept = project.openingFramingPieces.filter(
    (p) => !removedOpeningIds.has(p.openingId) && !removedWallIds.has(p.wallId),
  );

  const dimensionsKept = project.dimensions.filter((d) => {
    if (!d.wallIds?.length) {
      return true;
    }
    return !d.wallIds.some((id) => selectedIds.has(id));
  });

  const planLinesKept = project.planLines.filter((l) => !selectedIds.has(l.id));
  const foundationStripsKept = project.foundationStrips.filter((s) => !selectedIds.has(s.id));
  const foundationPilesKept = project.foundationPiles.filter((p) => !selectedIds.has(p.id));
  const slabsKept = project.slabs.filter((s) => !selectedIds.has(s.id));
  const floorBeamsKept = project.floorBeams.filter((b) => !selectedIds.has(b.id));
  const roofPlanesKept = project.roofPlanes.filter((r) => !selectedIds.has(r.id));

  return touchProjectMeta({
    ...project,
    walls: wallsKept,
    planLines: planLinesKept,
    foundationStrips: foundationStripsKept,
    foundationPiles: foundationPilesKept,
    slabs: slabsKept,
    floorBeams: floorBeamsKept,
    roofPlanes: roofPlanesKept,
    wallCalculations: wallCalculationsKept,
    wallJoints: wallJointsKept,
    openings: openingsKept,
    openingFramingPieces: framingKept,
    dimensions: dimensionsKept,
  });
}
