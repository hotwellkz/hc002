import { describe, expect, it } from "vitest";

import { createDemoProject } from "../domain/demoProject";
import { newEntityId } from "../domain/ids";
import { normalizeLayer } from "../domain/layer";
import type { Profile } from "../domain/profile";
import { addProfile } from "../domain/profileMutations";
import { createEmptyProject } from "../domain/projectFactory";
import { addRectangleRoofSystemToProject } from "../domain/roofSystemToProject";
import { compileReport } from "./compileReport";
import { getReportDefinition } from "./registry";
import { buildBuildingElevationWorld } from "./viewDefinitions/buildingElevation";
import { ELEV_ROOF_MM } from "./viewDefinitions/elevationStrokeConstants";

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

describe("facade_color_elevation compileReport", () => {
  it("собирает цветной фасад с растром (data URL)", () => {
    const p = createDemoProject();
    const def = getReportDefinition("facade_color_front");
    expect(def?.viewKind).toBe("facade_color_elevation");
    const model = compileReport(p, def!, {
      scaleDenominator: 100,
      reportDateIso: new Date().toISOString(),
      sheetIndex: 1,
      sheetCount: 1,
      facadeColor3dImageHref: "data:image/png;base64,AAAA",
    });
    const imgs = model.primitives.filter((x) => x.kind === "image");
    expect(imgs.length).toBe(1);
    expect(imgs[0]?.kind === "image" && imgs[0].href.startsWith("data:image")).toBe(true);
  });
});

describe("building_elevation compileReport", () => {
  it("собирает фасад для демо-проекта (стены без крыши)", () => {
    const p = createDemoProject();
    const def = getReportDefinition("facade_front");
    expect(def?.viewKind).toBe("building_elevation");
    const model = compileReport(p, def!, {
      scaleDenominator: 100,
      reportDateIso: new Date().toISOString(),
      sheetIndex: 1,
      sheetCount: 1,
    });
    expect(model.primitives.length).toBeGreaterThan(3);
    expect(model.messages.length).toBeGreaterThanOrEqual(0);
  });

  it("включает крышу на отдельном слое, даже если слой не в visibleLayerIds 2D", () => {
    let p = createEmptyProject();
    const roofLayerId = newEntityId();
    const t = new Date().toISOString();
    const roofLayer = normalizeLayer({
      id: roofLayerId,
      name: "Крыша",
      domain: "roof",
      orderIndex: 1,
      elevationMm: 3000,
      levelMode: "absolute",
      offsetFromBelowMm: 0,
      manualHeightMm: 0,
      isVisible: true,
      createdAt: t,
      updatedAt: t,
    });
    p = { ...p, layers: [...p.layers, roofLayer], visibleLayerIds: [] };
    const prof = minimalRoofProfile(newEntityId());
    p = addProfile(p, prof);
    const rect = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ] as const;
    p = addRectangleRoofSystemToProject(p, {
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
    p = {
      ...p,
      roofPlanes: p.roofPlanes.map((r) => ({ ...r, layerId: roofLayerId })),
      roofSystems: p.roofSystems.map((s) => ({ ...s, layerId: roofLayerId })),
    };

    const built = buildBuildingElevationWorld(p, "front");
    const roofGeom = built.primitives.filter((x) => {
      if (x.kind === "line") {
        return x.strokeMm === ELEV_ROOF_MM;
      }
      if (x.kind === "polyline") {
        return x.strokeMm === ELEV_ROOF_MM && x.closed;
      }
      return false;
    });
    expect(roofGeom.length).toBeGreaterThan(0);
    expect(built.messages.some((m) => m.includes("на фасаде контур кровли отсутствует"))).toBe(false);
    expect(built.messages.some((m) => m.includes("Не удалось построить силуэт крыши"))).toBe(false);
  });
});
