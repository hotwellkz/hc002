import { describe, expect, it } from "vitest";

import { newEntityId } from "../domain/ids";
import type { Profile } from "../domain/profile";
import { addProfile } from "../domain/profileMutations";
import { createEmptyProject } from "../domain/projectFactory";
import { addRectangleRoofSystemToProject } from "../domain/roofSystemToProject";
import { compileReport } from "./compileReport";
import { getReportDefinition } from "./registry";

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

function projectWithGableRoof() {
  let p = createEmptyProject();
  const prof = minimalRoofProfile(newEntityId());
  p = addProfile(p, prof);
  const rect = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4000 },
    { x: 0, y: 4000 },
  ] as const;
  return addRectangleRoofSystemToProject(p, {
    footprintCcWMm: rect,
    roofKind: "gable",
    pitchDeg: 30,
    baseLevelMm: 0,
    profileId: prof.id,
    eaveOverhangMm: 300,
    sideOverhangMm: 150,
    roofCoverEaveProjectionMm: 0,
    ridgeAlong: "short",
    monoDrainCardinal: "s",
  });
}

describe("roof_slope_plan compileReport", () => {
  it("собирает модель с геометрией для проекта со скатами", () => {
    const p = projectWithGableRoof();
    const def = getReportDefinition("roof_slope_plan");
    expect(def).toBeDefined();
    const model = compileReport(p, def!, {
      scaleDenominator: 100,
      reportDateIso: new Date().toISOString(),
      sheetIndex: 1,
      sheetCount: 1,
    });
    expect(model.primitives.length).toBeGreaterThan(10);
    expect(model.messages.some((m) => m.includes("Скатов"))).toBe(true);
  });
});
