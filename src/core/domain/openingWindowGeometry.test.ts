import { describe, expect, it } from "vitest";

import type { Opening } from "./opening";
import { createEmptyProject, touchProjectMeta } from "./projectFactory";
import type { Project } from "./project";
import type { Wall } from "./wall";
import {
  hitTestPlacedWindowOnWall,
  pickPlacedWindowOnLayerSlice,
  projectWorldToAlongMm,
  snapOpeningLeftEdgeMm,
} from "./openingWindowGeometry";

function wallH(layerId: string): Wall {
  return {
    id: "w1",
    layerId,
    start: { x: 0, y: 0 },
    end: { x: 6000, y: 0 },
    thicknessMm: 200,
    heightMm: 3000,
    baseElevationMm: 0,
  };
}

function win(left: number, w: number, id = "o1"): Opening {
  return {
    id,
    wallId: "w1",
    kind: "window",
    offsetFromStartMm: left,
    widthMm: w,
    heightMm: 1200,
    formKey: "rectangle",
    isEmptyOpening: false,
    createdAt: "t",
    updatedAt: "t",
  };
}

describe("openingWindowGeometry", () => {
  it("projectWorldToAlongMm проецирует на ось стены", () => {
    const w = wallH("L1");
    expect(projectWorldToAlongMm(w, { x: 1000, y: 50 })).toBeCloseTo(1000, 3);
    expect(projectWorldToAlongMm(w, { x: -100, y: 0 })).toBe(0);
    expect(projectWorldToAlongMm(w, { x: 99999, y: 0 })).toBe(6000);
  });

  it("hitTestPlacedWindowOnWall — попадание в полосу проёма", () => {
    const w = wallH("L1");
    const o = win(2000, 1000);
    expect(hitTestPlacedWindowOnWall(w, o, { x: 2500, y: 0 }, 5, 5)).toBe(true);
    expect(hitTestPlacedWindowOnWall(w, o, { x: 1500, y: 0 }, 5, 5)).toBe(false);
    expect(hitTestPlacedWindowOnWall(w, o, { x: 2500, y: 400 }, 5, 5)).toBe(false);
  });

  it("pickPlacedWindowOnLayerSlice — последнее в списке при перекрытии", () => {
    const base = createEmptyProject();
    const lid = base.activeLayerId;
    const w = wallH(lid);
    const p: Project = touchProjectMeta({
      ...base,
      walls: [w],
      openings: [win(1000, 800, "o1"), win(1400, 800, "o2")],
    });
    const slice: Project = { ...p, walls: [w], openings: p.openings };
    const hit = pickPlacedWindowOnLayerSlice(slice, { x: 1500, y: 0 }, 10, 10);
    expect(hit?.id).toBe("o2");
  });

  it("snapOpeningLeftEdgeMm снапает центр к сетке", () => {
    const w = wallH("L1");
    const left = snapOpeningLeftEdgeMm(w, 1000, 123, 100, true);
    expect(left + 500).toBeCloseTo(Math.round((123 + 500) / 100) * 100, 3);
  });
});
