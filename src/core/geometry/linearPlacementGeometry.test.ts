import { describe, expect, it } from "vitest";

import {
  computeWallCenterlineFromReferenceLine,
  computeWallFrameAxes,
} from "./linearPlacementGeometry";

describe("linearPlacementGeometry", () => {
  it("axes: horizontal segment, normalLeft is +Y", () => {
    const a = computeWallFrameAxes({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(a).not.toBeNull();
    expect(a!.tangent.x).toBeCloseTo(1);
    expect(a!.tangent.y).toBeCloseTo(0);
    expect(a!.normalLeft.x).toBeCloseTo(0);
    expect(a!.normalLeft.y).toBeCloseTo(1);
    expect(a!.normalRight.x).toBeCloseTo(0);
    expect(a!.normalRight.y).toBeCloseTo(-1);
  });

  it("center mode: centerline equals reference", () => {
    const r = computeWallCenterlineFromReferenceLine(
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      200,
      "center",
    );
    expect(r).not.toBeNull();
    expect(r!.centerStart.x).toBe(0);
    expect(r!.centerEnd.x).toBe(1000);
  });

  it("leftEdge: axis shifted by t/2 along normalRight", () => {
    const t = 200;
    const r = computeWallCenterlineFromReferenceLine(
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      t,
      "leftEdge",
    );
    expect(r).not.toBeNull();
    /* tangent +X → normalRight = (0,-1): ось ниже опорной линии */
    expect(r!.centerStart.y).toBeCloseTo(-t / 2);
    expect(r!.centerEnd.y).toBeCloseTo(-t / 2);
  });

  it("rightEdge: axis shifted by t/2 along normalLeft", () => {
    const t = 200;
    const r = computeWallCenterlineFromReferenceLine(
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      t,
      "rightEdge",
    );
    expect(r).not.toBeNull();
    expect(r!.centerStart.y).toBeCloseTo(t / 2);
    expect(r!.centerEnd.y).toBeCloseTo(t / 2);
  });
});
