import { describe, expect, it } from "vitest";

import { createEmptyProject } from "@/core/domain/projectFactory";

import type { WallRenderMeshSpec } from "./wallMeshSpec";
import { isCalculationSolidVisible, isProfileMaterialGypsumBoard, isWallMeshSpecVisible } from "./view3dVisibility";

describe("view3dVisibility", () => {
  it("isProfileMaterialGypsumBoard: только тип gypsum из профиля", () => {
    expect(isProfileMaterialGypsumBoard("gypsum")).toBe(true);
    expect(isProfileMaterialGypsumBoard("osb")).toBe(false);
    expect(isProfileMaterialGypsumBoard("steel")).toBe(false);
    expect(isProfileMaterialGypsumBoard("default")).toBe(false);
  });

  it("ГКЛ в слоях стены: видимость только от show3dLayerGypsum", () => {
    const base = createEmptyProject();
    const spec: WallRenderMeshSpec = {
      reactKey: "w1-l1",
      wallId: "w1",
      position: [0, 0, 0],
      rotationY: 0,
      width: 0.01,
      height: 2,
      depth: 1,
      materialType: "gypsum",
    };
    const on = { ...base, viewState: { ...base.viewState, show3dLayerGypsum: true } };
    const off = { ...base, viewState: { ...base.viewState, show3dLayerGypsum: false } };
    expect(isWallMeshSpecVisible(spec, on)).toBe(true);
    expect(isWallMeshSpecVisible(spec, off)).toBe(false);
  });

  it("расчётный solid с materialType gypsum управляется show3dLayerGypsum", () => {
    const base = createEmptyProject();
    const spec = {
      reactKey: "k",
      wallId: "w1",
      calculationId: "c1",
      source: "sip" as const,
      position: [0, 0, 0] as const,
      rotationY: 0,
      width: 0.1,
      height: 0.1,
      depth: 0.1,
      materialType: "gypsum" as const,
    };
    const offGy = { ...base, viewState: { ...base.viewState, show3dLayerGypsum: false, show3dLayerEps: true } };
    const offEps = { ...base, viewState: { ...base.viewState, show3dLayerGypsum: true, show3dLayerEps: false } };
    expect(isCalculationSolidVisible(spec, offGy)).toBe(false);
    expect(isCalculationSolidVisible(spec, offEps)).toBe(true);
  });
});
