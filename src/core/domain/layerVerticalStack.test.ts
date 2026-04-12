import { describe, expect, it } from "vitest";

import { createEmptyProject } from "./projectFactory";
import { createLayerInProject, moveLayerToStackPosition, updateLayerInProject } from "./layerOps";
import { newEntityId } from "./ids";
import { normalizeLayer, type Layer } from "./layer";
import {
  computeLayerVerticalStack,
  maxGeometryTopMmForLayer,
  slabWorldBottomMm,
  slabWorldTopMm,
} from "./layerVerticalStack";
import { addSlabToProject, createSlabFromPolygon } from "./slabOps";
import type { Profile } from "./profile";
import type { Wall } from "./wall";

function wallOnLayer(layerId: string, heightMm: number, baseElevationMm?: number): Wall {
  const t = new Date().toISOString();
  return {
    id: newEntityId(),
    layerId,
    profileId: "p",
    start: { x: 0, y: 0 },
    end: { x: 3000, y: 0 },
    thicknessMm: 174,
    heightMm,
    baseElevationMm,
    createdAt: t,
    updatedAt: t,
  };
}

function minimalWallProfile(): Profile {
  const t = new Date().toISOString();
  return {
    id: "p",
    name: "Test",
    category: "wall",
    markPrefix: "W",
    compositionMode: "solid",
    defaultHeightMm: 2500,
    layers: [],
    createdAt: t,
    updatedAt: t,
  };
}

describe("computeLayerVerticalStack", () => {
  it("сценарий 1–2: относительный слой от верха стен + offset", () => {
    let p = createEmptyProject();
    p = { ...p, profiles: [minimalWallProfile()] };
    const l0 = p.layers[0]!.id;
    p = { ...p, walls: [wallOnLayer(l0, 2500)] };

    p = createLayerInProject(p, { name: "Пароплёнка", elevationMm: 0 });
    const l1 = p.activeLayerId;
    p = updateLayerInProject(p, l1, { levelMode: "relativeToBelow", offsetFromBelowMm: 0, manualHeightMm: 0 });

    const m = computeLayerVerticalStack(p);
    expect(m.get(l0)?.computedTopMm).toBe(2500);
    expect(m.get(l1)?.computedBaseMm).toBe(2500);

    p = updateLayerInProject(p, l1, { offsetFromBelowMm: 20 });
    const m2 = computeLayerVerticalStack(p);
    expect(m2.get(l1)?.computedBaseMm).toBe(2520);
  });

  it("сценарий 3: рост стены пересчитывает слой выше", () => {
    let p = createEmptyProject();
    p = { ...p, profiles: [minimalWallProfile()] };
    const l0 = p.layers[0]!.id;
    const wId = newEntityId();
    const t = new Date().toISOString();
    p = {
      ...p,
      walls: [
        {
          id: wId,
          layerId: l0,
          profileId: "p",
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
          thicknessMm: 174,
          heightMm: 2500,
          createdAt: t,
          updatedAt: t,
        },
      ],
    };
    p = createLayerInProject(p, { name: "Верх", elevationMm: 0 });
    const l1 = p.activeLayerId;
    p = updateLayerInProject(p, l1, { levelMode: "relativeToBelow", offsetFromBelowMm: 0 });

    const baseBefore = computeLayerVerticalStack(p).get(l1)!.computedBaseMm;
    expect(baseBefore).toBe(2500);

    p = {
      ...p,
      walls: p.walls.map((w) => (w.id === wId ? { ...w, heightMm: 2700 } : w)),
    };
    const baseAfter = computeLayerVerticalStack(p).get(l1)!.computedBaseMm;
    expect(baseAfter).toBe(2700);
  });

  it("сценарий 4: смена порядка меняет привязку относительного слоя", () => {
    let p = createEmptyProject();
    p = createLayerInProject(p, { name: "B", elevationMm: 100 });
    p = createLayerInProject(p, { name: "C", elevationMm: 0 });
    const c = p.activeLayerId;
    p = updateLayerInProject(p, c, { levelMode: "relativeToBelow", offsetFromBelowMm: 0, manualHeightMm: 50 });

    // stack bottom→top: A(0), B(100), C relative → base = top(B)+0; top(B)=100+0=100 from manual? B empty manual 0 -> top 100
    const m1 = computeLayerVerticalStack(p);
    expect(m1.get(c)?.computedBaseMm).toBe(100);

    p = moveLayerToStackPosition(p, c, 0);
    const m2 = computeLayerVerticalStack(p);
    // C first, relative with no below → absolute elevation 0
    expect(m2.get(c)?.computedBaseMm).toBe(0);
  });

  it("сценарий 6: старый слой без новых полей после normalize ведёт себя как абсолютный", () => {
    const t = new Date().toISOString();
    const legacy = normalizeLayer({
      id: "x",
      name: "L",
      orderIndex: 0,
      elevationMm: 3200,
      isVisible: true,
      createdAt: t,
      updatedAt: t,
    } as unknown as Layer);
    expect(legacy.levelMode).toBe("absolute");
    expect(legacy.offsetFromBelowMm).toBe(0);
    expect(legacy.domain).toBe("floorPlan");
    const p = {
      ...createEmptyProject(),
      layers: [legacy],
    };
    const m = computeLayerVerticalStack(p);
    expect(m.get("x")?.computedBaseMm).toBe(3200);
  });

  it("сценарий 5: пустой слой + manualHeight задаёт верх для следующего", () => {
    let p = createEmptyProject();
    const l0 = p.layers[0]!.id;
    p = updateLayerInProject(p, l0, { manualHeightMm: 120 });
    p = createLayerInProject(p, { name: "Над", elevationMm: 0 });
    const l1 = p.activeLayerId;
    p = updateLayerInProject(p, l1, { levelMode: "relativeToBelow", offsetFromBelowMm: 0 });

    const m = computeLayerVerticalStack(p);
    expect(m.get(l0)?.computedTopMm).toBe(120);
    expect(m.get(l1)?.computedBaseMm).toBe(120);
  });

  it("плита: локальный levelMm + computedBase слоя даёт мировой верх; maxGeometryTopMm учитывает слой", () => {
    let p = createEmptyProject();
    p = createLayerInProject(p, { name: "Пароплёнка", elevationMm: 2500 });
    const lPar = p.activeLayerId;

    const rect = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ] as const;
    const created = createSlabFromPolygon({
      layerId: lPar,
      pointsMm: rect,
      levelMm: 0,
      depthMm: 1,
    });
    if ("error" in created) {
      throw new Error(created.error);
    }
    p = addSlabToProject(p, created.slab);

    const stack = computeLayerVerticalStack(p);
    expect(stack.get(lPar)?.computedBaseMm).toBe(2500);
    expect(slabWorldTopMm(created.slab, p, stack)).toBe(2500);
    expect(slabWorldBottomMm(created.slab, p, stack)).toBe(2499);
    expect(maxGeometryTopMmForLayer(p, lPar, 2500)).toBe(2500);

    const created2 = createSlabFromPolygon({
      layerId: lPar,
      pointsMm: rect,
      levelMm: 100,
      depthMm: 1,
    });
    if ("error" in created2) {
      throw new Error(created2.error);
    }
    p = addSlabToProject(p, created2.slab);
    expect(slabWorldTopMm(created2.slab, p)).toBe(2600);
  });
});
