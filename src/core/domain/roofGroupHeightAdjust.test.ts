import { describe, expect, it } from "vitest";

import { newEntityId } from "./ids";
import {
  computeAllRoofPlanesZAdjustMmByPlaneIdInProject,
  computeRoofGroupZAdjustMmByPlaneId,
  findRoofPlanAdjacencyTiePointMm,
  findSharedPlanPointBetweenRoofPlanesMm,
  rawRoofZUpAtPlanPointMm,
} from "./roofGroupHeightAdjust";
import { roofPlanePolygonMm } from "./roofPlane";
import type { RoofPlaneEntity } from "./roofPlane";
import { createEmptyProject } from "./projectFactory";

function mkRoof(partial: Omit<RoofPlaneEntity, "id" | "type" | "createdAt" | "updatedAt">): RoofPlaneEntity {
  const t = new Date().toISOString();
  return {
    id: newEntityId(),
    type: "roofPlane",
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

describe("computeRoofGroupZAdjustMmByPlaneId", () => {
  it("выравнивает Z на общей кромке двух скатов с разным maxDot", () => {
    const layerId = "L";
    const a = mkRoof({
      layerId,
      p1: { x: 0, y: 0 },
      p2: { x: 5000, y: 0 },
      depthMm: 3000,
      angleDeg: 30,
      levelMm: 0,
      profileId: "p",
      slopeDirection: { x: 0, y: 1 },
      slopeIndex: 1,
    });
    const b = mkRoof({
      layerId,
      p1: { x: 5000, y: 0 },
      p2: { x: 5000, y: -3000 },
      depthMm: 4000,
      angleDeg: 30,
      levelMm: 0,
      profileId: "p",
      slopeDirection: { x: 1, y: 0 },
      slopeIndex: 2,
    });
    const polyA = [...roofPlanePolygonMm(a)];
    const polyB = [...roofPlanePolygonMm(b)];
    const shared = findSharedPlanPointBetweenRoofPlanesMm(polyA, polyB);
    expect(shared).not.toBeNull();

    const base = () => 0;
    const adj = computeRoofGroupZAdjustMmByPlaneId([a, b], base);

    const zA =
      rawRoofZUpAtPlanPointMm(a, 0, shared!.x, shared!.y) + (adj.get(a.id) ?? 0);
    const zB =
      rawRoofZUpAtPlanPointMm(b, 0, shared!.x, shared!.y) + (adj.get(b.id) ?? 0);
    expect(Math.abs(zA - zB)).toBeLessThan(0.05);
  });

  it("findRoofPlanAdjacencyTiePointMm: примыкание по вершине к ребру, без пары вершин ≤2.5 мм", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const b = [
      { x: 103.5, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 103.5, y: 100 },
    ];
    expect(findSharedPlanPointBetweenRoofPlanesMm(a, b)).toBeNull();
    expect(findRoofPlanAdjacencyTiePointMm(a, b)).not.toBeNull();
  });

  it("computeAllRoofPlanesZAdjustMmByPlaneIdInProject выравнивает связные скаты без roofAssemblyCalculations", () => {
    const layerId = "L";
    const a = mkRoof({
      layerId,
      p1: { x: 0, y: 0 },
      p2: { x: 5000, y: 0 },
      depthMm: 3000,
      angleDeg: 30,
      levelMm: 0,
      profileId: "p",
      slopeDirection: { x: 0, y: 1 },
      slopeIndex: 1,
    });
    const b = mkRoof({
      layerId,
      p1: { x: 5000, y: 0 },
      p2: { x: 5000, y: -3000 },
      depthMm: 4000,
      angleDeg: 30,
      levelMm: 0,
      profileId: "p",
      slopeDirection: { x: 1, y: 0 },
      slopeIndex: 2,
    });
    const polyA = [...roofPlanePolygonMm(a)];
    const polyB = [...roofPlanePolygonMm(b)];
    const tie = findRoofPlanAdjacencyTiePointMm(polyA, polyB);
    expect(tie).not.toBeNull();

    let p = createEmptyProject();
    p = {
      ...p,
      roofPlanes: [a, b],
      roofAssemblyCalculations: [],
    };
    const adj = computeAllRoofPlanesZAdjustMmByPlaneIdInProject(p, () => 0);
    const zA = rawRoofZUpAtPlanPointMm(a, 0, tie!.x, tie!.y) + (adj.get(a.id) ?? 0);
    const zB = rawRoofZUpAtPlanPointMm(b, 0, tie!.x, tie!.y) + (adj.get(b.id) ?? 0);
    expect(Math.abs(zA - zB)).toBeLessThan(0.05);
  });
});
