import { describe, expect, it } from "vitest";

import { newEntityId } from "@/core/domain/ids";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { DEFAULT_ROOF_PROFILE_ASSEMBLY } from "@/core/domain/roofProfileAssembly";

import { buildRoofBattenPlanSegmentsMm, buildRoofBattenStripSegmentsOnSlopeThreeMm } from "./roofAssemblyGeometry3d";

function testRoofPlane(): RoofPlaneEntity {
  const t = new Date().toISOString();
  return {
    id: newEntityId(),
    type: "roofPlane",
    layerId: "L",
    p1: { x: 0, y: 0 },
    p2: { x: 5000, y: 0 },
    depthMm: 3000,
    angleDeg: 30,
    levelMm: 2800,
    profileId: "p",
    slopeDirection: { x: 0, y: 1 },
    slopeIndex: 1,
    planContourMm: [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 0, y: 3000 },
    ],
    createdAt: t,
    updatedAt: t,
  };
}

describe("buildRoofBattenPlanSegmentsMm", () => {
  it("пусто при battenUse: false", () => {
    const rp = testRoofPlane();
    const asm = { ...DEFAULT_ROOF_PROFILE_ASSEMBLY, battenUse: false };
    expect(buildRoofBattenPlanSegmentsMm(rp, 0, asm, 0)).toEqual([]);
    expect(buildRoofBattenStripSegmentsOnSlopeThreeMm(rp, 0, asm, 0)).toEqual([]);
  });

  it("даёт ненабор отрезков с шагом внутри контура (проекция совпадает по числу с 3D-полосами)", () => {
    const rp = testRoofPlane();
    const asm = {
      ...DEFAULT_ROOF_PROFILE_ASSEMBLY,
      battenUse: true,
      battenStepMm: 600,
      battenLayoutDir: "perpendicular_to_fall" as const,
    };
    const plan = buildRoofBattenPlanSegmentsMm(rp, 0, asm, 0);
    const strips = buildRoofBattenStripSegmentsOnSlopeThreeMm(rp, 0, asm, 0);
    expect(plan.length).toBe(strips.length);
    expect(plan.length).toBeGreaterThan(2);
    for (const s of plan) {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      expect(Number.isFinite(s.x1)).toBe(true);
      expect(len).toBeGreaterThan(100);
    }
  });

  it("на плане расстояние между осями соседних досок равно battenStepMm (перпендикулярно стоку)", () => {
    const rp = testRoofPlane();
    const asm = {
      ...DEFAULT_ROOF_PROFILE_ASSEMBLY,
      battenUse: true,
      battenStepMm: 350,
      battenWidthMm: 100,
      battenLayoutDir: "perpendicular_to_fall" as const,
    };
    const segs = buildRoofBattenPlanSegmentsMm(rp, 0, asm, 0);
    expect(segs.length).toBeGreaterThan(2);
    const midY = segs.map((s) => (s.y1 + s.y2) * 0.5).sort((a, b) => a - b);
    for (let i = 1; i < midY.length; i++) {
      expect(midY[i]! - midY[i - 1]!).toBeCloseTo(350, 0);
    }
  });

  it("parallel_to_fall меняет ориентацию линий относительно perpendicular_to_fall", () => {
    const rp = testRoofPlane();
    const base = { ...DEFAULT_ROOF_PROFILE_ASSEMBLY, battenUse: true, battenStepMm: 800 };
    const perp = buildRoofBattenPlanSegmentsMm(rp, 0, { ...base, battenLayoutDir: "perpendicular_to_fall" }, 0);
    const para = buildRoofBattenPlanSegmentsMm(rp, 0, { ...base, battenLayoutDir: "parallel_to_fall" }, 0);
    expect(perp.length).toBeGreaterThan(0);
    expect(para.length).toBeGreaterThan(0);
    const dirPerp = Math.hypot(perp[0]!.x2 - perp[0]!.x1, perp[0]!.y2 - perp[0]!.y1);
    const dirPara = Math.hypot(para[0]!.x2 - para[0]!.x1, para[0]!.y2 - para[0]!.y1);
    expect(dirPerp).toBeGreaterThan(1);
    expect(dirPara).toBeGreaterThan(1);
    const uxP = (perp[0]!.x2 - perp[0]!.x1) / dirPerp;
    const uyP = (perp[0]!.y2 - perp[0]!.y1) / dirPerp;
    const uxA = (para[0]!.x2 - para[0]!.x1) / dirPara;
    const uyA = (para[0]!.y2 - para[0]!.y1) / dirPara;
    const dot = Math.abs(uxP * uxA + uyP * uyA);
    expect(dot).toBeLessThan(0.99);
  });
});
