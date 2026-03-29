import { describe, expect, it } from "vitest";

import { createEmptyProject } from "./projectFactory";
import {
  addWallToProject,
  computeProfileThickness,
  createWallEntity,
  setProjectOrigin,
  snapPoint2dToGridMm,
} from "./wallOps";
import { addProfile as addProfileToProject } from "./profileMutations";
import type { Profile } from "./profile";

function wallProfile(id: string): Profile {
  const t = new Date().toISOString();
  return {
    id,
    name: "Test wall",
    category: "wall",
    compositionMode: "layered",
    layers: [
      { id: "l1", orderIndex: 0, materialName: "A", materialType: "osb", thicknessMm: 50 },
      { id: "l2", orderIndex: 1, materialName: "B", materialType: "eps", thicknessMm: 74 },
    ],
    createdAt: t,
    updatedAt: t,
  };
}

describe("wallOps", () => {
  it("computeProfileThickness sums layered profile", () => {
    const p = wallProfile("p1");
    expect(computeProfileThickness(p)).toBe(124);
  });

  it("snapPoint2dToGridMm", () => {
    expect(snapPoint2dToGridMm({ x: 105, y: 204 }, 100)).toEqual({ x: 100, y: 200 });
  });

  it("createWallEntity rejects zero length", () => {
    const w = createWallEntity({
      layerId: "L",
      profileId: "P",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      thicknessMm: 100,
      heightMm: 2500,
      baseElevationMm: 0,
    });
    expect(w).toBeNull();
  });

  it("setProjectOrigin and addWall round-trip", () => {
    let p = createEmptyProject();
    p = addProfileToProject(p, wallProfile("prof1"));
    p = setProjectOrigin(p, { x: 10, y: 20 });
    expect(p.projectOrigin).toEqual({ x: 10, y: 20 });

    const wall = createWallEntity({
      layerId: p.activeLayerId,
      profileId: "prof1",
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 },
      thicknessMm: 124,
      heightMm: 2800,
      baseElevationMm: 0,
    });
    expect(wall).not.toBeNull();
    p = addWallToProject(p, wall!);
    expect(p.walls).toHaveLength(1);
    expect(p.walls[0]?.profileId).toBe("prof1");
  });
});
