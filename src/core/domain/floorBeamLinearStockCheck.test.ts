import { describe, expect, it } from "vitest";

import type { FloorBeamEntity } from "./floorBeam";
import { floorBeamExceedsLinearStockLength } from "./floorBeamLinearStockCheck";
import { createEmptyProject, touchProjectMeta } from "./projectFactory";
import type { Profile } from "./profile";

describe("floorBeamExceedsLinearStockLength", () => {
  it("true когда длина больше max из профиля", () => {
    const profile: Profile = {
      id: "pr",
      name: "b",
      category: "beam",
      compositionMode: "solid",
      layers: [],
      linearStockMaxLengthMm: 6000,
      createdAt: "",
      updatedAt: "",
    };
    const p0 = createEmptyProject();
    const beam: FloorBeamEntity = {
      id: "b1",
      layerId: p0.activeLayerId,
      profileId: "pr",
      refStartMm: { x: 0, y: 0 },
      refEndMm: { x: 7000, y: 0 },
      linearPlacementMode: "center",
      sectionRolled: false,
      baseElevationMm: 0,
      createdAt: "",
      updatedAt: "",
    };
    const p = touchProjectMeta({
      ...p0,
      profiles: [...p0.profiles, profile],
      floorBeams: [beam],
    });
    expect(floorBeamExceedsLinearStockLength(p, beam)).toBe(true);
  });

  it("false когда короче лимита", () => {
    const profile: Profile = {
      id: "pr",
      name: "b",
      category: "beam",
      compositionMode: "solid",
      layers: [],
      linearStockMaxLengthMm: 6000,
      createdAt: "",
      updatedAt: "",
    };
    const p0 = createEmptyProject();
    const beam: FloorBeamEntity = {
      id: "b1",
      layerId: p0.activeLayerId,
      profileId: "pr",
      refStartMm: { x: 0, y: 0 },
      refEndMm: { x: 5000, y: 0 },
      linearPlacementMode: "center",
      sectionRolled: false,
      baseElevationMm: 0,
      createdAt: "",
      updatedAt: "",
    };
    const p = touchProjectMeta({
      ...p0,
      profiles: [...p0.profiles, profile],
      floorBeams: [beam],
    });
    expect(floorBeamExceedsLinearStockLength(p, beam)).toBe(false);
  });
});
