import { describe, expect, it } from "vitest";

import { computeAllRoofPlanesZAdjustMmByPlaneIdInProject, rawRoofZUpAtPlanPointMm } from "./roofGroupHeightAdjust";
import { roofPlaneHeightDebugSnapMm } from "./roofJoinDiagnostics";
import { createEmptyProject } from "./projectFactory";
import type { RoofPlaneEntity } from "./roofPlane";

/**
 * Классический двускат: общий **горизонтальный** конёк (y = const), сток на юг и на север.
 * Вдоль такого конька p·û постоянен → Z одинаков при симметричных угле и levelMm.
 */
function symmetricGablePair15deg(): { readonly south: RoofPlaneEntity; readonly north: RoofPlaneEntity } {
  const t = "2000-01-01T00:00:00.000Z";
  const southContour = [
    { x: 0, y: 0 },
    { x: 8000, y: 0 },
    { x: 8000, y: 3000 },
    { x: 0, y: 3000 },
  ] as const;
  const northContour = [
    { x: 0, y: 3000 },
    { x: 8000, y: 3000 },
    { x: 8000, y: 6000 },
    { x: 0, y: 6000 },
  ] as const;
  const south: RoofPlaneEntity = {
    id: "south",
    type: "roofPlane",
    layerId: "L1",
    p1: { x: 0, y: 0 },
    p2: { x: 8000, y: 0 },
    depthMm: 3000,
    angleDeg: 15,
    levelMm: 0,
    profileId: "roof1",
    slopeDirection: { x: 0, y: -1 },
    slopeIndex: 1,
    planContourMm: [...southContour],
    planContourBaseMm: [...southContour],
    createdAt: t,
    updatedAt: t,
  };
  const north: RoofPlaneEntity = {
    id: "north",
    type: "roofPlane",
    layerId: "L1",
    p1: { x: 0, y: 6000 },
    p2: { x: 8000, y: 6000 },
    depthMm: 3000,
    angleDeg: 15,
    levelMm: 0,
    profileId: "roof1",
    slopeDirection: { x: 0, y: 1 },
    slopeIndex: 2,
    planContourMm: [...northContour],
    planContourBaseMm: [...northContour],
    createdAt: t,
    updatedAt: t,
  };
  return { south, north };
}

describe("встречные скаты (двускат): симметрия", () => {
  it("на горизонтальном коньке Z совпадает по всей длине при 15° и симметричных карнизах", () => {
    const { south, north } = symmetricGablePair15deg();
    let proj = createEmptyProject();
    proj = { ...proj, roofPlanes: [south, north] };
    const adj = computeAllRoofPlanesZAdjustMmByPlaneIdInProject(proj, () => 0);
    const yRidge = 3000;
    for (let x = 500; x <= 7500; x += 1000) {
      const zS = rawRoofZUpAtPlanPointMm(south, 0, x, yRidge) + (adj.get(south.id) ?? 0);
      const zN = rawRoofZUpAtPlanPointMm(north, 0, x, yRidge) + (adj.get(north.id) ?? 0);
      expect(Math.abs(zS - zN)).toBeLessThan(0.05);
    }
  });

  it("прогон вдоль стока до конька одинаков у южного и северного ската", () => {
    const { south, north } = symmetricGablePair15deg();
    let proj = createEmptyProject();
    proj = { ...proj, roofPlanes: [south, north] };
    const adj = computeAllRoofPlanesZAdjustMmByPlaneIdInProject(proj, () => 0);
    const sa = roofPlaneHeightDebugSnapMm(south, 0, adj.get(south.id) ?? 0);
    const na = roofPlaneHeightDebugSnapMm(north, 0, adj.get(north.id) ?? 0);
    expect(sa.runAlongDrainSpanMm).toBeCloseTo(na.runAlongDrainSpanMm, 0);
    expect(sa.angleDeg).toBe(na.angleDeg);
    expect(sa.levelMm).toBeCloseTo(na.levelMm, 2);
  });
});
