import { describe, expect, it } from "vitest";

import { newEntityId } from "./ids";
import { createEmptyProject } from "./projectFactory";
import { addProfile as addProfileToProject } from "./profileMutations";
import type { Profile } from "./profile";
import { joinTwoRoofPlaneContoursMvp } from "./roofContourJoinGeometry";
import { applyRoofCalculationToProject } from "./roofCalculationPipeline";

function roofProfile(id: string): Profile {
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
      membraneUse: true,
      membraneThicknessMm: 0.5,
      membraneTypeName: "Мембрана",
      battenUse: true,
      battenMaterial: "Доска",
      battenWidthMm: 100,
      battenHeightMm: 40,
      battenStepMm: 300,
      battenLayoutDir: "perpendicular_to_fall",
      eaveOverhangMm: 0,
      sideOverhangMm: 0,
      soffitReserved: false,
    },
    createdAt: t,
    updatedAt: t,
  };
}

describe("applyRoofCalculationToProject", () => {
  it("отклоняет несвязные скаты", () => {
    let p = createEmptyProject();
    p = addProfileToProject(p, roofProfile("rp"));
    const t = new Date().toISOString();
    const a = {
      id: newEntityId(),
      type: "roofPlane" as const,
      layerId: p.activeLayerId,
      p1: { x: 0, y: 0 },
      p2: { x: 5000, y: 0 },
      depthMm: 3000,
      angleDeg: 30,
      levelMm: 2800,
      profileId: "rp",
      slopeDirection: { x: 0, y: 1 },
      slopeIndex: 1,
      createdAt: t,
      updatedAt: t,
    };
    const b = {
      ...a,
      id: newEntityId(),
      slopeIndex: 2,
      p1: { x: 20_000, y: 0 },
      p2: { x: 25_000, y: 0 },
    };
    p = { ...p, roofPlanes: [a, b] };
    const r = applyRoofCalculationToProject({ project: p, roofPlaneIds: [a.id, b.id] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toMatch(/связную/i);
    }
  });

  it("принимает один скат", () => {
    let p = createEmptyProject();
    p = addProfileToProject(p, roofProfile("rp"));
    const t = new Date().toISOString();
    const a = {
      id: newEntityId(),
      type: "roofPlane" as const,
      layerId: p.activeLayerId,
      p1: { x: 0, y: 0 },
      p2: { x: 5000, y: 0 },
      depthMm: 3000,
      angleDeg: 30,
      levelMm: 2800,
      profileId: "rp",
      slopeDirection: { x: 0, y: 1 },
      slopeIndex: 1,
      createdAt: t,
      updatedAt: t,
    };
    p = { ...p, roofPlanes: [a] };
    const r = applyRoofCalculationToProject({ project: p, roofPlaneIds: [a.id] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.roofAssemblyCalculations.length).toBe(1);
      expect(r.project.roofAssemblyCalculations[0]!.roofPlaneIds).toEqual([a.id]);
    }
  });

  it("после стыка боковой свес не разводит общую вертикаль у двух скатов", () => {
    const t = new Date().toISOString();
    let p = createEmptyProject();
    const roofProf = roofProfile("rp");
    const prof: Profile = {
      ...roofProf,
      roofAssembly: { ...roofProf.roofAssembly!, eaveOverhangMm: 300, sideOverhangMm: 200 },
    };
    p = addProfileToProject(p, prof);

    const left = {
      id: newEntityId(),
      type: "roofPlane" as const,
      layerId: p.activeLayerId,
      p1: { x: 0, y: 0 },
      p2: { x: 10_000, y: 0 },
      depthMm: 5000,
      angleDeg: 35,
      levelMm: 3000,
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
    const right = {
      id: newEntityId(),
      type: "roofPlane" as const,
      layerId: p.activeLayerId,
      p1: { x: 12_000, y: 0 },
      p2: { x: 22_000, y: 0 },
      depthMm: 5000,
      angleDeg: 35,
      levelMm: 3000,
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
    p = { ...p, roofPlanes: [j.a, j.b] };
    const r = applyRoofCalculationToProject({ project: p, roofPlaneIds: [j.a.id, j.b.id] });
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    const pa = r.project.roofPlanes.find((x) => x.id === j.a.id)!;
    const pb = r.project.roofPlanes.find((x) => x.id === j.b.id)!;
    const ca = pa.planContourMm!;
    const cb = pb.planContourMm!;
    const joinXsA = ca
      .flatMap((_, i) => {
        const a = ca[i]!;
        const b = ca[(i + 1) % ca.length]!;
        if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) > 400) {
          return [(a.x + b.x) * 0.5];
        }
        return [];
      });
    const joinXsB = cb.flatMap((_, i) => {
      const a = cb[i]!;
      const b = cb[(i + 1) % cb.length]!;
      if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) > 400) {
        return [(a.x + b.x) * 0.5];
      }
      return [];
    });
    const innerA = joinXsA.filter((x) => x > 5000 && x < 15_000);
    const innerB = joinXsB.filter((x) => x > 5000 && x < 15_000);
    expect(innerA.length).toBeGreaterThan(0);
    expect(innerB.length).toBeGreaterThan(0);
    expect(innerA[0]!).toBeCloseTo(innerB[0]!, 0);
  });
});
