import { describe, expect, it } from "vitest";

import { newEntityId } from "./ids";
import { createEmptyProject } from "./projectFactory";
import { addProfile as addProfileToProject } from "./profileMutations";
import type { Profile } from "./profile";
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
});
