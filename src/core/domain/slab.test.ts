import { describe, expect, it } from "vitest";

import { slabStructuralCategoryFor3d, type SlabEntity } from "./slab";

function slab(partial: Partial<SlabEntity>): SlabEntity {
  return {
    id: "s1",
    layerId: "L1",
    pointsMm: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
    levelMm: 0,
    depthMm: 200,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("slabStructuralCategoryFor3d", () => {
  it("foundation → foundation", () => {
    expect(slabStructuralCategoryFor3d(slab({ structuralPurpose: "foundation" }))).toBe("foundation");
  });

  it("overlap → overlap", () => {
    expect(slabStructuralCategoryFor3d(slab({ structuralPurpose: "overlap" }))).toBe("overlap");
  });

  it("без тега → overlap (старые проекты)", () => {
    expect(slabStructuralCategoryFor3d(slab({}))).toBe("overlap");
  });
});
