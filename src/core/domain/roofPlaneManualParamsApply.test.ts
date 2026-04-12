import { describe, expect, it } from "vitest";

import { newEntityId } from "./ids";
import type { Profile } from "./profile";
import { addProfile as addProfileToProject } from "./profileMutations";
import { createEmptyProject } from "./projectFactory";
import { applyManualRoofPlaneParamsInProject, roofPlaneGenerationMode } from "./roofPlaneManualParamsApply";
import { addRectangleRoofSystemToProject } from "./roofSystemToProject";

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

describe("applyManualRoofPlaneParamsInProject", () => {
  it("отклоняет скат генератора", () => {
    let p = createEmptyProject();
    const prof = minimalRoofProfile("rp");
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
      pitchDeg: 30,
      baseLevelMm: 0,
      profileId: prof.id,
      eaveOverhangMm: 300,
      sideOverhangMm: 150,
      ridgeAlong: "short",
      monoDrainCardinal: "s",
    });
    const gen = p.roofPlanes.find((r) => r.roofSystemId != null);
    expect(gen).toBeDefined();
    const r = applyManualRoofPlaneParamsInProject(p, gen!.id, {
      angleDeg: 20,
      levelMm: 0,
      profileId: prof.id,
    });
    expect(r.ok).toBe(false);
  });

  it("обновляет ручной скат без roofSystemId", () => {
    let p = createEmptyProject();
    const prof = minimalRoofProfile("rp2");
    p = addProfileToProject(p, prof);
    const now = new Date().toISOString();
    p = {
      ...p,
      roofPlanes: [
        {
          id: "manual-1",
          type: "roofPlane",
          layerId: p.activeLayerId,
          p1: { x: 0, y: 0 },
          p2: { x: 5000, y: 0 },
          depthMm: 3000,
          angleDeg: 25,
          levelMm: 100,
          profileId: prof.id,
          slopeDirection: { x: 0, y: 1 },
          slopeIndex: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const r = applyManualRoofPlaneParamsInProject(p, "manual-1", {
      angleDeg: 18,
      levelMm: 200,
      profileId: prof.id,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const rp = r.project.roofPlanes.find((x) => x.id === "manual-1");
      expect(rp?.angleDeg).toBe(18);
      expect(rp?.levelMm).toBe(200);
    }
  });
});

describe("roofPlaneGenerationMode", () => {
  it("различает генератор и ручной режим", () => {
    const now = new Date().toISOString();
    const manual = {
      id: "m",
      type: "roofPlane" as const,
      layerId: "L",
      p1: { x: 0, y: 0 },
      p2: { x: 1, y: 0 },
      depthMm: 1,
      angleDeg: 1,
      levelMm: 0,
      profileId: "p",
      slopeDirection: { x: 0, y: 1 },
      slopeIndex: 1,
      createdAt: now,
      updatedAt: now,
    };
    expect(roofPlaneGenerationMode(manual)).toBe("manual");
    expect(roofPlaneGenerationMode({ ...manual, roofSystemId: "sys" })).toBe("generator");
  });
});
