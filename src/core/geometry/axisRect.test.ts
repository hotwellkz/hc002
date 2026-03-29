import { describe, expect, it } from "vitest";

import { normalizeRectMmFromCorners, pointInRectMm, rectsIntersectMm, segmentBoundsMm } from "./axisRect";

describe("axisRect", () => {
  it("normalizeRectMmFromCorners", () => {
    const r = normalizeRectMmFromCorners(10, 20, 0, 0);
    expect(r.minX).toBe(0);
    expect(r.maxX).toBe(10);
    expect(r.minY).toBe(0);
    expect(r.maxY).toBe(20);
  });

  it("rectsIntersectMm", () => {
    const a = normalizeRectMmFromCorners(0, 0, 10, 10);
    const b = normalizeRectMmFromCorners(5, 5, 15, 15);
    expect(rectsIntersectMm(a, b)).toBe(true);
    const c = normalizeRectMmFromCorners(20, 20, 30, 30);
    expect(rectsIntersectMm(a, c)).toBe(false);
  });

  it("pointInRectMm", () => {
    const r = normalizeRectMmFromCorners(0, 0, 10, 10);
    expect(pointInRectMm({ x: 5, y: 5 }, r)).toBe(true);
    expect(pointInRectMm({ x: 11, y: 5 }, r)).toBe(false);
  });

  it("segmentBoundsMm", () => {
    const r = segmentBoundsMm({ x: 5, y: 10 }, { x: -1, y: 3 });
    expect(r.minX).toBe(-1);
    expect(r.maxX).toBe(5);
  });
});
