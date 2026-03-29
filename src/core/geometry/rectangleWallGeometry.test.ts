import { describe, expect, it } from "vitest";

import {
  adjustedRectForRectanglePlacement,
  axisAlignedRectFromCorners,
  fourWallCenterSegmentsFromRect,
  fourWallMiteredCenterSegmentsFromRect,
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

  it("four segments form closed loop (оси с общими вершинами)", () => {
    const r = axisAlignedRectFromCorners({ x: 0, y: 0 }, { x: 1000, y: 500 });
    const segs = fourWallCenterSegmentsFromRect(r);
    expect(segs).toHaveLength(4);
    expect(segs[0]!.end.x).toBe(segs[1]!.start.x);
  });

  it("miter: сегменты длиннее на T по каждой оси, углы закрываются перекрытием", () => {
    const r = axisAlignedRectFromCorners({ x: 0, y: 0 }, { x: 1000, y: 500 });
    const T = 200;
    const m = fourWallMiteredCenterSegmentsFromRect(r, T);
    expect(m).not.toBeNull();
    const h = T / 2;
    expect(m![0]!.start.x).toBe(0 - h);
    expect(m![0]!.end.x).toBe(1000 + h);
    expect(m![1]!.start.y).toBe(0 - h);
    expect(m![1]!.end.y).toBe(500 + h);
    const raw = fourWallCenterSegmentsFromRect(r);
    const len0 = Math.hypot(raw[0]!.end.x - raw[0]!.start.x, raw[0]!.end.y - raw[0]!.start.y);
    const lenM0 = Math.hypot(m![0]!.end.x - m![0]!.start.x, m![0]!.end.y - m![0]!.start.y);
    expect(lenM0).toBeCloseTo(len0 + T, 6);
  });
});
