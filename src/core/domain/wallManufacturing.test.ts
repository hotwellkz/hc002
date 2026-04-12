import { describe, expect, it } from "vitest";

import { newEntityId } from "./ids";
import type { Profile } from "./profile";
import {
  inferFrameMemberWidthMmFromProfile,
  inferWallCalculationModelFromProfileLayers,
  resolveEffectiveWallManufacturing,
} from "./wallManufacturing";

function minimalWallProfile(overrides: Partial<Profile>): Profile {
  const t = new Date().toISOString();
  return {
    id: newEntityId(),
    name: "T",
    category: "wall",
    markPrefix: "T",
    compositionMode: "layered",
    layers: [
      { id: newEntityId(), orderIndex: 0, materialName: "ГКЛ", materialType: "gypsum", thicknessMm: 12 },
      { id: newEntityId(), orderIndex: 1, materialName: "Каркас", materialType: "steel", thicknessMm: 76 },
      { id: newEntityId(), orderIndex: 2, materialName: "ГКЛ", materialType: "gypsum", thicknessMm: 12 },
    ],
    createdAt: t,
    updatedAt: t,
    ...overrides,
  };
}

describe("resolveEffectiveWallManufacturing", () => {
  it("для frame ширина листа берётся из defaultWidthMm, даже если в wallManufacturing остался SIP-дефолт 1250", () => {
    const p = minimalWallProfile({
      defaultWidthMm: 1200,
      defaultHeightMm: 2500,
      wallManufacturing: {
        calculationModel: "frame",
        panelNominalWidthMm: 1250,
        studSpacingMm: 400,
        frameMaterial: "steel",
      },
    });
    const m = resolveEffectiveWallManufacturing(p);
    expect(m.panelNominalWidthMm).toBe(1200);
    expect(m.panelNominalHeightMm).toBe(2500);
  });

  it("для frame без defaultWidthMm и без panelNominalWidthMm в профиле модуль листа 1200, не SIP 1250", () => {
    const p = minimalWallProfile({
      wallManufacturing: {
        calculationModel: "frame",
        studSpacingMm: 400,
        frameMaterial: "steel",
      },
    });
    const m = resolveEffectiveWallManufacturing(p);
    expect(m.panelNominalWidthMm).toBe(1200);
  });

  it("для SIP сохранённый panelNominalWidthMm в профиле имеет приоритет над defaultWidthMm", () => {
    const p = minimalWallProfile({
      defaultWidthMm: 1200,
      compositionMode: "layered",
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
        { id: newEntityId(), orderIndex: 1, materialName: "EPS", materialType: "eps", thicknessMm: 145 },
        { id: newEntityId(), orderIndex: 2, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
      ],
      wallManufacturing: {
        calculationModel: "sip",
        panelNominalWidthMm: 1250,
      },
    });
    const m = resolveEffectiveWallManufacturing(p);
    expect(m.panelNominalWidthMm).toBe(1250);
  });

  it("для frame + steel металлоперегородка: стойка 75×50 и направляющая 75×40 (не одно сечение слоя 76)", () => {
    const p = minimalWallProfile({
      defaultWidthMm: 1200,
      wallManufacturing: {
        calculationModel: "frame",
        studSpacingMm: 400,
        frameMaterial: "steel",
      },
    });
    expect(inferFrameMemberWidthMmFromProfile(p)).toBe(76);
    const m = resolveEffectiveWallManufacturing(p);
    expect(m.jointBoardThicknessMm).toBe(50);
    expect(m.jointBoardDepthMm).toBe(75);
    expect(m.plateBoardThicknessMm).toBe(40);
    expect(m.plateBoardDepthMm).toBe(75);
  });

  it("frameMemberWidthMm задаёт сечение явно (напр. 80 мм)", () => {
    const p = minimalWallProfile({
      wallManufacturing: {
        calculationModel: "frame",
        frameMemberWidthMm: 80,
      },
    });
    const m = resolveEffectiveWallManufacturing(p);
    expect(m.jointBoardThicknessMm).toBe(80);
    expect(m.jointBoardDepthMm).toBe(80);
  });

  it("для frame дверной пресет всегда frame_gkl_door, даже если в профиле сохранён sip_standard", () => {
    const p = minimalWallProfile({
      wallManufacturing: {
        calculationModel: "frame",
        doorOpeningFramingPreset: "sip_standard",
      },
    });
    expect(resolveEffectiveWallManufacturing(p).doorOpeningFramingPreset).toBe("frame_gkl_door");
  });

  it("для sheet модуль листа как у frame — из defaultWidthMm", () => {
    const p = minimalWallProfile({
      defaultWidthMm: 1250,
      defaultHeightMm: 2500,
      compositionMode: "layered",
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
      ],
      wallManufacturing: {
        calculationModel: "sheet",
      },
    });
    const m = resolveEffectiveWallManufacturing(p);
    expect(m.panelNominalWidthMm).toBe(1250);
    expect(m.panelNominalHeightMm).toBe(2500);
  });

  it("inferWallCalculationModel: ОСБ+EPS+ОСБ → sip; два ОСБ без ядра → sheet", () => {
    const t = new Date().toISOString();
    const sipLike: Profile = {
      id: newEntityId(),
      name: "S",
      category: "wall",
      markPrefix: "W",
      compositionMode: "layered",
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
        { id: newEntityId(), orderIndex: 1, materialName: "EPS", materialType: "eps", thicknessMm: 100 },
        { id: newEntityId(), orderIndex: 2, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
      ],
      createdAt: t,
      updatedAt: t,
    };
    const sheetLike: Profile = {
      ...sipLike,
      id: newEntityId(),
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
        { id: newEntityId(), orderIndex: 1, materialName: "OSB", materialType: "osb", thicknessMm: 9 },
      ],
    };
    expect(inferWallCalculationModelFromProfileLayers(sipLike)).toBe("sip");
    expect(inferWallCalculationModelFromProfileLayers(sheetLike)).toBe("sheet");
  });
});
