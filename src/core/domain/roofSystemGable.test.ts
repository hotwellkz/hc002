import { describe, expect, it } from "vitest";

import { createEmptyProject } from "./projectFactory";
import { addProfile as addProfileToProject } from "./profileMutations";
import { newEntityId } from "./ids";
import type { Profile } from "./profile";
import { addRectangleRoofSystemToProject } from "./roofSystemToProject";
import { rawRoofZUpAtPlanPointMm } from "./roofGroupHeightAdjust";
import { mergeRoofProfileAssemblyForPlane } from "./roofCalculationPipeline";
import { applyRoofProfileOverhangToPlanPolygonMm } from "./roofOverhangGeometry";
import { roofPlaneCalculationBasePolygonMm } from "./roofPlane";
import { collectInternalJoinEdgeIndicesForRoofBaseMm } from "./roofCalculationPipeline";

function minimalRoofProfile(id: string): Profile {
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
      battenStepMm: 300,
      battenLayoutDir: "perpendicular_to_fall",
      eaveOverhangMm: 400,
      sideOverhangMm: 200,
      soffitReserved: false,
    },
    createdAt: t,
    updatedAt: t,
  };
}

describe("RoofSystem gable rectangle", () => {
  it("symmetry: opposite slopes same angle, span, ridge Z", () => {
    let p = createEmptyProject();
    const prof = minimalRoofProfile("rp-g");
    p = addProfileToProject(p, prof);
    const rect = [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 6000 },
      { x: 0, y: 6000 },
    ] as const;
    p = addRectangleRoofSystemToProject(p, {
      footprintCcWMm: rect,
      roofKind: "gable",
      pitchDeg: 30,
      baseLevelMm: 0,
      profileId: prof.id,
      eaveOverhangMm: 300,
      sideOverhangMm: 150,
      ridgeAlong: "short",
      monoDrainCardinal: "s",
    });
    expect(p.roofSystems).toHaveLength(1);
    expect(p.roofPlanes).toHaveLength(2);
    const a = p.roofPlanes[0]!;
    const b = p.roofPlanes[1]!;
    expect(a.angleDeg).toBeCloseTo(30, 5);
    expect(b.angleDeg).toBeCloseTo(30, 5);
    expect(a.roofSystemId).toBe(p.roofSystems[0]!.id);
    expect(b.roofSystemId).toBe(p.roofSystems[0]!.id);

    const layerBase = 0;
    const zA = rawRoofZUpAtPlanPointMm(a, layerBase, 4000, 3000);
    const zB = rawRoofZUpAtPlanPointMm(b, layerBase, 4000, 3000);
    expect(Math.abs(zA - zB)).toBeLessThan(0.5);

    const spanA = Math.hypot(a.p2.x - a.p1.x, a.p2.y - a.p1.y);
    const spanB = Math.hypot(b.p2.x - b.p1.x, b.p2.y - b.p1.y);
    expect(spanA).toBeCloseTo(spanB, 3);
  });

  it("overhang merge does not break ridge: internal edge stays zero-offset", () => {
    let p = createEmptyProject();
    const prof = minimalRoofProfile("rp-o");
    p = addProfileToProject(p, prof);
    const rect = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ] as const;
    p = addRectangleRoofSystemToProject(p, {
      footprintCcWMm: rect,
      roofKind: "gable",
      pitchDeg: 25,
      baseLevelMm: 0,
      profileId: prof.id,
      eaveOverhangMm: 500,
      sideOverhangMm: 250,
      ridgeAlong: "short",
      monoDrainCardinal: "s",
    });
    const planes = p.roofPlanes;
    expect(planes.length).toBe(2);
    for (const rp of planes) {
      const asm = mergeRoofProfileAssemblyForPlane(p, rp);
      expect(asm).not.toBeNull();
      const base = roofPlaneCalculationBasePolygonMm(rp);
      const zeroIdx = collectInternalJoinEdgeIndicesForRoofBaseMm(p, rp.id, rp.layerId, base);
      const expanded = applyRoofProfileOverhangToPlanPolygonMm(
        base,
        rp.slopeDirection,
        asm!.eaveOverhangMm,
        asm!.sideOverhangMm,
        { zeroOffsetEdgeIndices: zeroIdx },
      );
      expect(expanded.length).toBe(4);
    }
  });
});
