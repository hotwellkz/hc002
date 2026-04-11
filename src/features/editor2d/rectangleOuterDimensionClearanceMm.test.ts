import { describe, expect, it } from "vitest";

import { appendRectangleOverallDimensions } from "@/core/domain/rectangleWallDimensions";
import type { Project } from "@/core/domain/project";
import { createEmptyProject } from "@/core/domain/projectFactory";
import type { Wall } from "@/core/domain/wall";

import { computeRectangleOuterDimensionMinEffectiveOffsetMm } from "./rectangleOuterDimensionClearanceMm";

function wall(
  id: string,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  t: number,
  placementGroupId?: string,
): Wall {
  const now = new Date().toISOString();
  return {
    id,
    layerId: "L1",
    start: { x: sx, y: sy },
    end: { x: ex, y: ey },
    thicknessMm: t,
    heightMm: 2500,
    placementGroupId,
    createdAt: now,
    updatedAt: now,
  };
}

describe("computeRectangleOuterDimensionMinEffectiveOffsetMm", () => {
  it("увеличивает минимальный offset для нижнего габарита при двери снизу (подпись и дуга вниз)", () => {
    const t = 100;
    const walls = [
      wall("b", -50, 0, 5050, 0, t, "grp"),
      wall("r", 5000, -50, 5000, 3050, t, "grp"),
      wall("t", 5050, 3000, -50, 3000, t, "grp"),
      wall("l", 0, 3050, 0, -50, t, "grp"),
    ];
    const base = createEmptyProject();
    const lid = base.activeLayerId;
    const wallsOnLayer = walls.map((w) => ({ ...w, layerId: lid }));
    let p: Project = { ...base, walls: wallsOnLayer };
    p = appendRectangleOverallDimensions(p, wallsOnLayer, "grp");

    const doorId = "door1";
    p = {
      ...p,
      openings: [
        {
          id: doorId,
          wallId: "b",
          kind: "door" as const,
          offsetFromStartMm: 2050,
          widthMm: 1000,
          heightMm: 2100,
          doorSwing: "in_right" as const,
        },
      ],
    } as Project;

    const hDim = p.dimensions.find((d) => d.kind === "rectangle_outer_horizontal");
    expect(hDim).toBeDefined();
    if (!hDim) {
      return;
    }

    const auto = computeRectangleOuterDimensionMinEffectiveOffsetMm(p, hDim);
    expect(auto).not.toBeNull();
    expect(auto!).toBeGreaterThan(420 + 100);
  });

  it("увеличивает offset для правого габарита при окне на правой стене (подпись наружу вправо)", () => {
    const t = 100;
    const walls = [
      wall("b", -50, 0, 5050, 0, t, "grp"),
      wall("r", 5000, -50, 5000, 3050, t, "grp"),
      wall("t", 5050, 3000, -50, 3000, t, "grp"),
      wall("l", 0, 3050, 0, -50, t, "grp"),
    ];
    const base = createEmptyProject();
    const lid = base.activeLayerId;
    const wallsOnLayer = walls.map((w) => ({ ...w, layerId: lid }));
    let p: Project = { ...base, walls: wallsOnLayer };
    p = appendRectangleOverallDimensions(p, wallsOnLayer, "grp");

    p = {
      ...p,
      openings: [
        {
          id: "w1",
          wallId: "r",
          kind: "window" as const,
          offsetFromStartMm: 1000,
          widthMm: 1250,
          heightMm: 1300,
        },
      ],
    } as Project;

    const vDim = p.dimensions.find((d) => d.kind === "rectangle_outer_vertical");
    expect(vDim).toBeDefined();
    if (!vDim) {
      return;
    }

    const auto = computeRectangleOuterDimensionMinEffectiveOffsetMm(p, vDim);
    expect(auto).not.toBeNull();
    expect(auto!).toBeGreaterThan(420 + 100);
  });
});
