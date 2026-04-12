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
  const removedFloorBeamIds = new Set(project.floorBeams.filter((b) => selectedIds.has(b.id)).map((b) => b.id));
  const floorBeamsKept = project.floorBeams.filter((b) => !selectedIds.has(b.id));
  const floorInsulationPiecesKept = project.floorInsulationPieces.filter((p) => !selectedIds.has(p.id));
  const roofPlanesKept = project.roofPlanes.filter((r) => !selectedIds.has(r.id));
  const keptRoofIds = new Set(roofPlanesKept.map((r) => r.id));
  const removedRoofIds = new Set(project.roofPlanes.filter((r) => selectedIds.has(r.id)).map((r) => r.id));
  const systemsTouched = new Set(
    project.roofSystems.filter((s) => s.generatedPlaneIds.some((id) => removedRoofIds.has(id))).map((s) => s.id),
  );
  const roofSystemsKept = project.roofSystems.filter((s) => !systemsTouched.has(s.id));
  const roofPlanesStripped = roofPlanesKept.map((r) =>
    r.roofSystemId && systemsTouched.has(r.roofSystemId) ? { ...r, roofSystemId: undefined } : r,
  );
  const roofAssemblyCalculationsKept = project.roofAssemblyCalculations.filter((c) =>
    c.roofPlaneIds.every((id) => keptRoofIds.has(id)),
  );

  const roofRaftersKept = project.roofRafters.filter(
    (r) => !selectedIds.has(r.id) && !removedFloorBeamIds.has(r.supportingFloorBeamId),
  );
  const roofRaftersPaired = roofRaftersKept.map((r) => {
    if (r.pairedRoofRafterId && !roofRaftersKept.some((x) => x.id === r.pairedRoofRafterId)) {
      return { ...r, pairedRoofRafterId: null };
    }
    return r;
  });

  const roofPostsKept = project.roofPosts.filter(
    (p) => !selectedIds.has(p.id) && !removedFloorBeamIds.has(p.supportingFloorBeamId),
  );
  const roofPurlinsKept = project.roofPurlins.filter((p) => !selectedIds.has(p.id));
  const keptPostIds = new Set(roofPostsKept.map((p) => p.id));
  const keptRafterIds = new Set(roofRaftersPaired.map((r) => r.id));
  const roofStrutsKept = project.roofStruts.filter(
    (s) =>
      !selectedIds.has(s.id) &&
      keptPostIds.has(s.roofPostId) &&
      keptRafterIds.has(s.roofRafterId),
  );

  return touchProjectMeta({
    ...project,
    walls: wallsKept,
    planLines: planLinesKept,
    foundationStrips: foundationStripsKept,
    foundationPiles: foundationPilesKept,
    slabs: slabsKept,
    floorBeams: floorBeamsKept,
    floorInsulationPieces: floorInsulationPiecesKept,
    roofPlanes: roofPlanesStripped,
    roofSystems: roofSystemsKept,
    roofAssemblyCalculations: roofAssemblyCalculationsKept,
    roofRafters: roofRaftersPaired,
    roofPurlins: roofPurlinsKept,
    roofPosts: roofPostsKept,
    roofStruts: roofStrutsKept,
    wallCalculations: wallCalculationsKept,
    wallJoints: wallJointsKept,
    openings: openingsKept,
    openingFramingPieces: framingKept,
    dimensions: dimensionsKept,
  });
}
