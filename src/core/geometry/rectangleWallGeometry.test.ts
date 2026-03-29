import { describe, expect, it } from "vitest";

import {
  adjustedRectForRectanglePlacement,
  axisAlignedRectFromCorners,
  fourWallCenterSegmentsFromRect,
} from "./rectangleWallGeometry";

describe("rectangleWallGeometry", () => {
  it("axisAlignedRectFromCorners", () => {
    const r = axisAlignedRectFromCorners({ x: 100, y: 200 }, { x: 0, y: 0 });
    expect(r.minX).toBe(0);
    expect(r.minY).toBe(0);
    expect(r.maxX).toBe(100);
    expect(r.maxY).toBe(200);
  });

  it("inset fails if rectangle too thin", () => {
    const ref = axisAlignedRectFromCorners({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(adjustedRectForRectanglePlacement(ref, 200, "leftEdge")).toBeNull();
  });

  it("four segments form closed loop", () => {
    const r = axisAlignedRectFromCorners({ x: 0, y: 0 }, { x: 1000, y: 500 });
    const segs = fourWallCenterSegmentsFromRect(r);
    expect(segs).toHaveLength(4);
    expect(segs[0]!.end.x).toBe(segs[1]!.start.x);
  });
});
