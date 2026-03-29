import { describe, expect, it } from "vitest";

import { bboxWidth, emptyBBox, expandBBoxToPoint } from "./bbox";
import { nearlyEqual } from "./compare";
import { intersectLineSegments, projectPointToSegment } from "./lineSegment";
import { distance, pointsEqual } from "./point";
import { angleBetween, dot, length, normalize } from "./vector";

describe("geometry core", () => {
  it("distance and nearlyEqual", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(nearlyEqual(1.0001, 1.0002, 1e-3)).toBe(true);
  });

  it("vector normalize and dot", () => {
    const n = normalize({ x: 3, y: 4 });
    expect(n).not.toBeNull();
    expect(length(n!)).toBeCloseTo(1);
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 2 })).toBe(0);
  });

  it("angleBetween", () => {
    const a = angleBetween({ x: 1, y: 0 }, { x: 0, y: 1 });
    expect(a).toBeCloseTo(Math.PI / 2);
  });

  it("segment intersection", () => {
    const r = intersectLineSegments(
      { a: { x: 0, y: 0 }, b: { x: 2, y: 0 } },
      { a: { x: 1, y: -1 }, b: { x: 1, y: 1 } },
    );
    expect(r.type).toBe("point");
    expect(r.point).toEqual({ x: 1, y: 0 });
  });

  it("projectPointToSegment", () => {
    const seg = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    const p = projectPointToSegment({ x: 5, y: 4 }, seg);
    expect(pointsEqual(p.point, { x: 5, y: 0 })).toBe(true);
  });

  it("bbox helpers", () => {
    let b = emptyBBox();
    b = expandBBoxToPoint(b, { x: 1, y: 2 });
    b = expandBBoxToPoint(b, { x: -1, y: 0 });
    expect(bboxWidth(b)).toBeCloseTo(2);
  });
});
