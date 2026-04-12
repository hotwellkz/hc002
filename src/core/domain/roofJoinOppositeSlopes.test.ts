import { describe, expect, it } from "vitest";

import { newEntityId } from "./ids";
import { computeAllRoofPlanesZAdjustMmByPlaneIdInProject, rawRoofZUpAtPlanPointMm } from "./roofGroupHeightAdjust";
import { joinTwoRoofPlaneContoursMvp } from "./roofContourJoinGeometry";
import { addProfile as addProfileToProject } from "./profileMutations";
import type { Profile } from "./profile";
import { createEmptyProject } from "./projectFactory";
import {
  refreshAllCalculatedRoofPlaneOverhangsInProject,
  refreshRoofOverhangForJoinPairInProject,
} from "./roofCalculationPipeline";
import { roofPlaneContourUvExtentsMm } from "./roofPlaneDrainExtents";
import type { RoofPlaneEntity } from "./roofPlane";
import { roofPlaneDrainUnitPlanMm, roofPlanePolygonMm } from "./roofPlane";

function signedDoubleAreaMm(poly: readonly { x: number; y: number }[]): number {
  let s = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += poly[i]!.x * poly[j]!.y - poly[j]!.x * poly[i]!.y;
  }
  return s;
}

function spanDrain(rp: RoofPlaneEntity): number {
  const poly = roofPlanePolygonMm(rp);
  const { uxn, uyn } = roofPlaneDrainUnitPlanMm(rp);
  return roofPlaneContourUvExtentsMm(poly, uxn, uyn).spanUMm;
}

function testRoofProfileWithOverhang(id: string, eaveMm: number, sideMm: number): Profile {
  const t = new Date().toISOString();
  return {
    id,
    name: "Кровля тест",
    category: "roof",
    compositionMode: "solid",
    defaultThicknessMm: 1,
    layers: [{ id: newEntityId(), orderIndex: 0, materialName: "—", materialType: "custom", thicknessMm: 1 }],
    roofAssembly: {
      coveringKind: "metal_tile",
      coveringMaterial: "Металл",
      coveringThicknessMm: 0.5,
      coveringAppearance3d: "color",
      coveringColorHex: "#778899",
      coveringTextureId: null,
      membraneUse: false,
      membraneThicknessMm: 0,
      membraneTypeName: "",
      battenUse: false,
      battenMaterial: "",
      battenWidthMm: 0,
      battenHeightMm: 0,
      battenStepMm: 0,
      battenLayoutDir: "perpendicular_to_fall",
      eaveOverhangMm: eaveMm,
      sideOverhangMm: sideMm,
      soffitReserved: false,
    },
    createdAt: t,
    updatedAt: t,
  };
}

/** Двускат: южный и северный прямоугольники, между коньками зазор 40 мм (как перед join). */
function gablePairWithRidgeGap(): { south: RoofPlaneEntity; north: RoofPlaneEntity } {
  const t = "2000-01-01T00:00:00.000Z";
  const southContour = [
    { x: 0, y: 0 },
    { x: 8000, y: 0 },
    { x: 8000, y: 3000 },
    { x: 0, y: 3000 },
  ] as const;
  /** Карниз севера на y=6040 → прогон 3000 мм, как у юга (до join зазор только между коньками). */
  const northContour = [
    { x: 0, y: 3040 },
    { x: 8000, y: 3040 },
    { x: 8000, y: 6040 },
    { x: 0, y: 6040 },
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
    profileId: "rp",
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
    p1: { x: 0, y: 6040 },
    p2: { x: 8000, y: 6040 },
    depthMm: 3000,
    angleDeg: 15,
    levelMm: 0,
    profileId: "rp",
    slopeDirection: { x: 0, y: 1 },
    slopeIndex: 2,
    planContourMm: [...northContour],
    planContourBaseMm: [...northContour],
    createdAt: t,
    updatedAt: t,
  };
  return { south, north };
}

describe("join: встречные скаты (конёк)", () => {
  it("twoOppositeSlopes_beforeJoin_areSymmetric по spanU и levelMm", () => {
    const { south, north } = gablePairWithRidgeGap();
    expect(spanDrain(south)).toBeCloseTo(3000, 1);
    expect(spanDrain(north)).toBeCloseTo(3000, 1);
    expect(south.levelMm).toBe(north.levelMm);
  });

  it("join_doesNotFlipSlopeDirectionUnexpectedly: направления стока не меняются", () => {
    const { south, north } = gablePairWithRidgeGap();
    const r = joinTwoRoofPlaneContoursMvp(south, 2, north, 0);
    expect("error" in r).toBe(false);
    if ("error" in r) {
      return;
    }
    expect(r.a.slopeDirection).toEqual(south.slopeDirection);
    expect(r.b.slopeDirection).toEqual(north.slopeDirection);
  });

  it("xorCalc_onlyOneSlopeInAssembly_afterJoin_refreshPair_restoresEqualSpanU", () => {
    let p = createEmptyProject();
    p = addProfileToProject(p, testRoofProfileWithOverhang("rp", 400, 250));
    const tIso = new Date().toISOString();
    const lid = p.activeLayerId;
    const { south, north } = gablePairWithRidgeGap();
    const s0: RoofPlaneEntity = { ...south, layerId: lid };
    const n0: RoofPlaneEntity = { ...north, layerId: lid };
    p = {
      ...p,
      roofPlanes: [s0, n0],
      roofAssemblyCalculations: [
        { id: newEntityId(), createdAt: tIso, updatedAt: tIso, roofPlaneIds: [s0.id] },
      ],
    };
    const r = joinTwoRoofPlaneContoursMvp(s0, 2, n0, 0);
    expect("error" in r).toBe(false);
    if ("error" in r) {
      return;
    }
    const pJoined = { ...p, roofPlanes: [r.a, r.b] };

    const pOnlyAll = refreshAllCalculatedRoofPlaneOverhangsInProject(pJoined);
    const southOnly = pOnlyAll.roofPlanes.find((x) => x.id === s0.id)!;
    const northOnly = pOnlyAll.roofPlanes.find((x) => x.id === n0.id)!;
    expect(Math.abs(spanDrain(southOnly) - spanDrain(northOnly))).toBeGreaterThan(80);

    const pFixed = refreshAllCalculatedRoofPlaneOverhangsInProject(
      refreshRoofOverhangForJoinPairInProject(pJoined, r.a.id, r.b.id),
    );
    const southF = pFixed.roofPlanes.find((x) => x.id === s0.id)!;
    const northF = pFixed.roofPlanes.find((x) => x.id === n0.id)!;
    expect(spanDrain(southF)).toBeCloseTo(spanDrain(northF), 0);
    expect(southF.levelMm).toBeCloseTo(northF.levelMm, 2);
  });

  it("twoOppositeSlopes_afterJoin_remainSymmetric: spanU, levelMm, площадь>0", () => {
    const { south, north } = gablePairWithRidgeGap();
    // Южный: ребро 2 — конёк (8000,3000)-(0,3000); северный: ребро 0 — нижняя кромка конька (0,3040)-(8000,3040)
    const r = joinTwoRoofPlaneContoursMvp(south, 2, north, 0);
    expect("error" in r).toBe(false);
    if ("error" in r) {
      return;
    }
    const a = r.a;
    const b = r.b;
    expect(signedDoubleAreaMm(roofPlanePolygonMm(a))).toBeGreaterThan(0);
    expect(signedDoubleAreaMm(roofPlanePolygonMm(b))).toBeGreaterThan(0);
    expect(spanDrain(a)).toBeCloseTo(spanDrain(b), 0);
    expect(a.levelMm).toBeCloseTo(b.levelMm, 2);
  });

  it("sharedJoinLine_hasSameZ_forBothPlanes вдоль общего конька после join", () => {
    const { south, north } = gablePairWithRidgeGap();
    const r = joinTwoRoofPlaneContoursMvp(south, 2, north, 0);
    expect("error" in r).toBe(false);
    if ("error" in r) {
      return;
    }
    const proj = { roofPlanes: [r.a, r.b], roofSystems: [] } as unknown as Parameters<
      typeof computeAllRoofPlanesZAdjustMmByPlaneIdInProject
    >[0];
    const adj = computeAllRoofPlanesZAdjustMmByPlaneIdInProject(proj, () => 0);
    const yJoin = 3020;
    for (let x = 500; x <= 7500; x += 1500) {
      const zS = rawRoofZUpAtPlanPointMm(r.a, 0, x, yJoin) + (adj.get(r.a.id) ?? 0);
      const zN = rawRoofZUpAtPlanPointMm(r.b, 0, x, yJoin) + (adj.get(r.b.id) ?? 0);
      expect(Math.abs(zS - zN)).toBeLessThan(0.1);
    }
  });

  it("join_doesNotDependOnPlaneOrder: swap A/B даёт ту же геометрию (spanU, levelMm)", () => {
    const t = "2000-01-01T00:00:00.000Z";
    const left: RoofPlaneEntity = {
      id: "L",
      type: "roofPlane",
      layerId: "L1",
      p1: { x: 0, y: 0 },
      p2: { x: 10_000, y: 0 },
      depthMm: 5000,
      angleDeg: 15,
      levelMm: 0,
      profileId: "rp",
      slopeDirection: { x: 0, y: -1 },
      slopeIndex: 1,
      planContourMm: [
        { x: 0, y: 0 },
        { x: 10_000, y: 0 },
        { x: 10_000, y: 5000 },
        { x: 0, y: 5000 },
      ],
      planContourBaseMm: [
        { x: 0, y: 0 },
        { x: 10_000, y: 0 },
        { x: 10_000, y: 5000 },
        { x: 0, y: 5000 },
      ],
      createdAt: t,
      updatedAt: t,
    };
    const rightContour = [
      { x: 12_000, y: 0 },
      { x: 22_000, y: 0 },
      { x: 22_000, y: 5000 },
      { x: 12_000, y: 5000 },
    ] as const;
    const right: RoofPlaneEntity = {
      id: "R",
      type: "roofPlane",
      layerId: "L1",
      p1: { x: 12_000, y: 0 },
      p2: { x: 22_000, y: 0 },
      depthMm: 5000,
      angleDeg: 15,
      levelMm: 0,
      profileId: "rp",
      slopeDirection: { x: 0, y: 1 },
      slopeIndex: 2,
      planContourMm: [...rightContour],
      planContourBaseMm: [...rightContour],
      createdAt: t,
      updatedAt: t,
    };
    const jLR = joinTwoRoofPlaneContoursMvp(left, 1, right, 3);
    const jRL = joinTwoRoofPlaneContoursMvp(right, 3, left, 1);
    expect("error" in jLR).toBe(false);
    expect("error" in jRL).toBe(false);
    if ("error" in jLR || "error" in jRL) {
      return;
    }
    expect(spanDrain(jLR.a)).toBeCloseTo(spanDrain(jLR.b), 2);
    expect(spanDrain(jRL.a)).toBeCloseTo(spanDrain(jRL.b), 2);
    expect(jLR.a.levelMm).toBeCloseTo(jRL.b.levelMm, 2);
    expect(jLR.b.levelMm).toBeCloseTo(jRL.a.levelMm, 2);
    expect(spanDrain(jLR.a)).toBeCloseTo(spanDrain(jRL.b), 2);
    expect(spanDrain(jLR.b)).toBeCloseTo(spanDrain(jRL.a), 2);
  });

  it("join_preservesEqualSpanAlongDrainAxis для бокового стыка (как в UI двух прямоугольников)", () => {
    const t = "2000-01-01T00:00:00.000Z";
    const left: RoofPlaneEntity = {
      id: "L",
      type: "roofPlane",
      layerId: "L1",
      p1: { x: 0, y: 0 },
      p2: { x: 10_000, y: 0 },
      depthMm: 5000,
      angleDeg: 15,
      levelMm: 0,
      profileId: "rp",
      slopeDirection: { x: 0, y: -1 },
      slopeIndex: 1,
      createdAt: t,
      updatedAt: t,
    };
    const rightContour = [
      { x: 12_000, y: 0 },
      { x: 22_000, y: 0 },
      { x: 22_000, y: 5000 },
      { x: 12_000, y: 5000 },
    ] as const;
    const right: RoofPlaneEntity = {
      id: "R",
      type: "roofPlane",
      layerId: "L1",
      p1: { x: 12_000, y: 0 },
      p2: { x: 22_000, y: 0 },
      depthMm: 5000,
      angleDeg: 15,
      levelMm: 0,
      profileId: "rp",
      slopeDirection: { x: 0, y: 1 },
      slopeIndex: 2,
      planContourMm: [...rightContour],
      planContourBaseMm: [...rightContour],
      createdAt: t,
      updatedAt: t,
    };
    const j = joinTwoRoofPlaneContoursMvp(left, 1, right, 3);
    expect("error" in j).toBe(false);
    if ("error" in j) {
      return;
    }
    expect(spanDrain(j.a)).toBeCloseTo(spanDrain(j.b), 0);
    expect(j.a.levelMm).toBeCloseTo(j.b.levelMm, 2);
  });
});
