import { describe, expect, it } from "vitest";

import { newEntityId } from "./ids";
import type { Profile } from "./profile";
import { addProfile as addProfileToProject } from "./profileMutations";
import { createEmptyProject } from "./projectFactory";
import {
  applyRoofCalculationToProject,
  collectInternalJoinEdgeIndicesForRoofBaseMm,
  refreshCalculatedRoofPlaneOverhangMm,
  ROOF_INTERNAL_JOIN_SHARED_EDGE_TOL_MM,
} from "./roofCalculationPipeline";
import { computeAllRoofPlanesZAdjustMmByPlaneIdInProject, rawRoofZUpAtPlanPointMm } from "./roofGroupHeightAdjust";
import { roofPlaneContourUvExtentsMm } from "./roofPlaneDrainExtents";
import type { RoofPlaneEntity } from "./roofPlane";
import { roofPlaneDrainUnitPlanMm, roofPlanePolygonMm } from "./roofPlane";
import type { Point2D } from "../geometry/types";

function roofProfileMinimal(id: string, eaveMm: number, sideMm: number): Profile {
  const t = new Date().toISOString();
  return {
    id,
    name: "Кровля мин",
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
      battenStepMm: 300,
      battenLayoutDir: "perpendicular_to_fall",
      eaveOverhangMm: eaveMm,
      sideOverhangMm: sideMm,
      soffitReserved: false,
    },
    createdAt: t,
    updatedAt: t,
  };
}

function symmetricAxisGable15(): { south: RoofPlaneEntity; north: RoofPlaneEntity; layerId: string } {
  const t = new Date().toISOString();
  const layerId = "Lg";
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
    layerId,
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
    layerId,
    p1: { x: 0, y: 6000 },
    p2: { x: 8000, y: 6000 },
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
  return { south, north, layerId };
}

function rotatePointMm(p: Point2D, cx: number, cy: number, deg: number): Point2D {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const x = p.x - cx;
  const y = p.y - cy;
  return { x: c * x - s * y + cx, y: s * x + c * y + cy };
}

function rotateContourMm(poly: readonly Point2D[], cx: number, cy: number, deg: number): Point2D[] {
  return poly.map((p) => rotatePointMm(p, cx, cy, deg));
}

function rotateVec(v: Point2D, deg: number): Point2D {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y };
}

/** Тот же двускат, повёрнутый вокруг центра дома: проверка, что длина по û, а не по world Y. */
function symmetricRotatedGable15(deg: number): { south: RoofPlaneEntity; north: RoofPlaneEntity; layerId: string } {
  const ax = symmetricAxisGable15();
  const cx = 4000;
  const cy = 3000;
  const sC = rotateContourMm(ax.south.planContourMm!, cx, cy, deg);
  const nC = rotateContourMm(ax.north.planContourMm!, cx, cy, deg);
  const t = ax.south.createdAt;
  const layerId = ax.layerId;
  const south: RoofPlaneEntity = {
    ...ax.south,
    p1: sC[0]!,
    p2: sC[1]!,
    depthMm: 3000,
    slopeDirection: rotateVec(ax.south.slopeDirection, deg),
    planContourMm: sC,
    planContourBaseMm: sC.map((p) => ({ x: p.x, y: p.y })),
    updatedAt: t,
  };
  const north: RoofPlaneEntity = {
    ...ax.north,
    p1: nC[2]!,
    p2: nC[3]!,
    depthMm: 3000,
    slopeDirection: rotateVec(ax.north.slopeDirection, deg),
    planContourMm: nC,
    planContourBaseMm: nC.map((p) => ({ x: p.x, y: p.y })),
    updatedAt: t,
  };
  return { south, north, layerId };
}

function spanU(rp: RoofPlaneEntity): number {
  const poly = roofPlanePolygonMm(rp);
  const { uxn, uyn } = roofPlaneDrainUnitPlanMm(rp);
  return roofPlaneContourUvExtentsMm(poly, uxn, uyn).spanUMm;
}

function assertPolysClose(a: readonly Point2D[], b: readonly Point2D[], eps: number) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y)).toBeLessThan(eps);
  }
}

describe("roofSymmetryPipeline", () => {
  it("внутренний стык конька находится для обоих скатов (база 4 мм допуск)", () => {
    const { south, north, layerId } = symmetricAxisGable15();
    let p = createEmptyProject();
    p = { ...p, roofPlanes: [south, north] };
    const zS = collectInternalJoinEdgeIndicesForRoofBaseMm(p, south.id, layerId, south.planContourBaseMm!);
    const zN = collectInternalJoinEdgeIndicesForRoofBaseMm(p, north.id, layerId, north.planContourBaseMm!);
    expect(zS.size).toBeGreaterThan(0);
    expect(zN.size).toBeGreaterThan(0);
    expect(ROOF_INTERNAL_JOIN_SHARED_EDGE_TOL_MM).toBeGreaterThanOrEqual(4);
  });

  it("двускат без свесов: одинаковая длина по оси стока û и Z на коньке", () => {
    const { south, north } = symmetricAxisGable15();
    let p = createEmptyProject();
    p = addProfileToProject(p, roofProfileMinimal("rp", 0, 0));
    p = { ...p, roofPlanes: [south, north] };
    const r = applyRoofCalculationToProject({ project: p, roofPlaneIds: [south.id, north.id] });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    const ps = r.project.roofPlanes.find((x) => x.id === south.id)!;
    const pn = r.project.roofPlanes.find((x) => x.id === north.id)!;
    expect(spanU(ps)).toBeCloseTo(spanU(pn), 1);
    const adj = computeAllRoofPlanesZAdjustMmByPlaneIdInProject(r.project, () => 0);
    for (let x = 1000; x <= 7000; x += 2000) {
      const zA = rawRoofZUpAtPlanPointMm(ps, 0, x, 3000) + (adj.get(ps.id) ?? 0);
      const zB = rawRoofZUpAtPlanPointMm(pn, 0, x, 3000) + (adj.get(pn.id) ?? 0);
      expect(Math.abs(zA - zB)).toBeLessThan(0.08);
    }
  });

  it("двускат со свесами: длина по û совпадает, конёк не разъезжается", () => {
    const { south, north } = symmetricAxisGable15();
    let p = createEmptyProject();
    p = addProfileToProject(p, roofProfileMinimal("rp", 300, 200));
    p = { ...p, roofPlanes: [south, north] };
    const r = applyRoofCalculationToProject({ project: p, roofPlaneIds: [south.id, north.id] });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    const ps = r.project.roofPlanes.find((x) => x.id === south.id)!;
    const pn = r.project.roofPlanes.find((x) => x.id === north.id)!;
    expect(spanU(ps)).toBeCloseTo(spanU(pn), 1);
  });

  it("повторный «Рассчитать» идемпотентен (контур, levelMm, spanU)", () => {
    const { south, north } = symmetricAxisGable15();
    let p = createEmptyProject();
    p = addProfileToProject(p, roofProfileMinimal("rp", 300, 200));
    p = { ...p, roofPlanes: [south, north] };
    const r1 = applyRoofCalculationToProject({ project: p, roofPlaneIds: [south.id, north.id] });
    expect(r1.ok).toBe(true);
    if (!r1.ok) {
      return;
    }
    const r2 = applyRoofCalculationToProject({
      project: r1.project,
      roofPlaneIds: [south.id, north.id],
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) {
      return;
    }
    const a1s = r1.project.roofPlanes.find((x) => x.id === south.id)!;
    const a2s = r2.project.roofPlanes.find((x) => x.id === south.id)!;
    const a1n = r1.project.roofPlanes.find((x) => x.id === north.id)!;
    const a2n = r2.project.roofPlanes.find((x) => x.id === north.id)!;
    assertPolysClose(roofPlanePolygonMm(a1s), roofPlanePolygonMm(a2s), 0.02);
    assertPolysClose(roofPlanePolygonMm(a1n), roofPlanePolygonMm(a2n), 0.02);
    expect(a2s.levelMm).toBeCloseTo(a1s.levelMm, 4);
    expect(a2n.levelMm).toBeCloseTo(a1n.levelMm, 4);
    expect(spanU(a2s)).toBeCloseTo(spanU(a2n), 1);
  });

  it("refreshCalculatedRoofPlaneOverhangMm дважды не дрейфует", () => {
    const { south, north } = symmetricAxisGable15();
    let p = createEmptyProject();
    p = addProfileToProject(p, roofProfileMinimal("rp", 250, 150));
    p = { ...p, roofPlanes: [south, north] };
    const r1 = applyRoofCalculationToProject({ project: p, roofPlaneIds: [south.id, north.id] });
    expect(r1.ok).toBe(true);
    if (!r1.ok) {
      return;
    }
    let q = r1.project;
    const once = q.roofPlanes.map((rp) => refreshCalculatedRoofPlaneOverhangMm(q, rp));
    q = { ...q, roofPlanes: once };
    const twice = q.roofPlanes.map((rp) => refreshCalculatedRoofPlaneOverhangMm(q, rp));
    const s0 = r1.project.roofPlanes.find((x) => x.id === south.id)!;
    const s2 = twice.find((x) => x.id === south.id)!;
    assertPolysClose(roofPlanePolygonMm(s0), roofPlanePolygonMm(s2), 0.02);
    expect(s2.levelMm).toBeCloseTo(s0.levelMm, 4);
  });

  it("повёрнутый двускат: span по û симметричен (world Y span может отличаться)", () => {
    const { south, north } = symmetricRotatedGable15(33);
    let p = createEmptyProject();
    p = addProfileToProject(p, roofProfileMinimal("rp", 0, 0));
    p = { ...p, roofPlanes: [south, north] };
    const r = applyRoofCalculationToProject({ project: p, roofPlaneIds: [south.id, north.id] });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    const ps = r.project.roofPlanes.find((x) => x.id === south.id)!;
    const pn = r.project.roofPlanes.find((x) => x.id === north.id)!;
    expect(spanU(ps)).toBeCloseTo(spanU(pn), 1);
  });
});
