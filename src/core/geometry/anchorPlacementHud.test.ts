import { describe, expect, it } from "vitest";

import { computeAnchorRelativeHud } from "@/core/geometry/anchorPlacementHud";

describe("computeAnchorRelativeHud", () => {
  it("считает смещение и угол", () => {
    const r = computeAnchorRelativeHud(0, 0, 1000, 1000);
    expect(r.dx).toBe(1000);
    expect(r.dy).toBe(1000);
    expect(Math.round(r.d)).toBe(1414);
    expect(Math.round(r.angleDeg)).toBe(45);
  });

  it("помечает почти горизонтальное направление", () => {
    const r = computeAnchorRelativeHud(0, 0, 500, 0.2);
    expect(r.axisHint).toBe("горизонталь");
  });
});
