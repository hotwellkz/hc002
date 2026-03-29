import { describe, expect, it } from "vitest";

import { computeProfileTotalThicknessMm } from "./profileOps";
import type { Profile } from "./profile";

describe("profileOps", () => {
  it("computeProfileTotalThicknessMm для layered — сумма слоёв", () => {
    const p: Profile = {
      id: "1",
      name: "SIP",
      category: "wall",
      compositionMode: "layered",
      layers: [
        { id: "a", orderIndex: 0, materialName: "A", materialType: "osb", thicknessMm: 9 },
        { id: "b", orderIndex: 1, materialName: "B", materialType: "eps", thicknessMm: 145 },
        { id: "c", orderIndex: 2, materialName: "C", materialType: "osb", thicknessMm: 9 },
      ],
      createdAt: "",
      updatedAt: "",
    };
    expect(computeProfileTotalThicknessMm(p)).toBe(163);
  });

  it("computeProfileTotalThicknessMm для solid с одним слоем", () => {
    const p: Profile = {
      id: "2",
      name: "Брус",
      category: "board",
      compositionMode: "solid",
      layers: [
        { id: "a", orderIndex: 0, materialName: "Сосна", materialType: "wood", thicknessMm: 200 },
      ],
      createdAt: "",
      updatedAt: "",
    };
    expect(computeProfileTotalThicknessMm(p)).toBe(200);
  });
});
