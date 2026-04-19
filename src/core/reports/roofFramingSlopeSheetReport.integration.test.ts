import { describe, expect, it } from "vitest";

import { newEntityId } from "../domain/ids";
import type { Profile } from "../domain/profile";
import type { RoofRafterEntity } from "../domain/roofRafter";
import { addProfile } from "../domain/profileMutations";
import { createEmptyProject } from "../domain/projectFactory";
import { roofPlanePolygonMm } from "../domain/roofPlane";
import { addRectangleRoofSystemToProject } from "../domain/roofSystemToProject";
import { pointInPolygonMm } from "../domain/wallLumberPlan2dGeometry";
import { compileReport } from "./compileReport";
import { evaluateReportReadiness } from "./readiness";
import { resolveReportDefinition, ROOF_FRAMING_SLOPE_REPORT_ID_PREFIX } from "./registry";

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

describe("roof_framing_slope_sheet", () => {
  it("resolveReportDefinition и readiness для ската со стропилом", () => {
    const p0 = projectWithGableRoof();
    const sys = p0.roofSystems[0]!;
    const footProbe = { x: 3000, y: 800 };
    const southPlane =
      p0.roofPlanes.find((rp) => pointInPolygonMm(footProbe.x, footProbe.y, roofPlanePolygonMm(rp))) ?? p0.roofPlanes[0]!;
    const t = new Date().toISOString();
    const rafter: RoofRafterEntity = {
      id: newEntityId(),
      type: "roofRafter",
      layerId: p0.activeLayerId,
      roofSystemId: sys.id,
      profileId: sys.profileId,
      supportingFloorBeamId: newEntityId(),
      pairedRoofRafterId: null,
      roofPlaneId: southPlane.id,
      footPlanMm: { x: 3000, y: 800 },
      ridgePlanMm: { x: 3000, y: 2000 },
      footElevationMm: 2600,
      ridgeElevationMm: 4200,
      sectionRolled: true,
      createdAt: t,
      updatedAt: t,
    };
    const p = { ...p0, roofRafters: [rafter] as const };
    const id = `${ROOF_FRAMING_SLOPE_REPORT_ID_PREFIX}${southPlane.id}`;
    const def = resolveReportDefinition(p, id);
    expect(def?.viewKind).toBe("roof_framing_slope_sheet");
    expect(def?.roofPlaneId).toBe(southPlane.id);

    const r = evaluateReportReadiness(p, def!);
    expect(r.status).toBe("ready");

    const model = compileReport(p, def!, {
      scaleDenominator: 100,
      reportDateIso: new Date().toISOString(),
      sheetIndex: 1,
      sheetCount: 1,
    });
    expect(model.primitives.some((x) => x.kind === "tableBlock")).toBe(true);
    expect(model.primitives.filter((x) => x.kind === "line").length).toBeGreaterThan(0);
  });
});
