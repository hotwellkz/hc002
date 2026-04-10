import { describe, expect, it } from "vitest";

import {
  buildWallDetailOpeningChainSegmentsWithEdit,
  classifyWallDetailHorizontalSegment,
  wallDetailDimEditHandleKey,
} from "./wallDetailDimensionEdit";

describe("wallDetailDimensionEdit", () => {
  it("classify: полная длина стены без проёмов", () => {
    const h = classifyWallDetailHorizontalSegment(0, 5000, 5000, [], 1);
    expect(h?.kind).toBe("wall_total_length");
    expect(wallDetailDimEditHandleKey(h!)).toBe("wd:w:total");
  });

  it("classify: отступ, ширина, зазор, хвост", () => {
    const openings = [
      { id: "a", wallId: "w", kind: "window" as const, offsetFromStartMm: 800, widthMm: 1200, heightMm: 1400 },
      { id: "b", wallId: "w", kind: "window" as const, offsetFromStartMm: 3200, widthMm: 900, heightMm: 1400 },
    ];
    expect(classifyWallDetailHorizontalSegment(0, 800, 6000, openings, 1)?.kind).toBe("opening_offset_from_wall_start");
    expect(classifyWallDetailHorizontalSegment(800, 2000, 6000, openings, 1)?.kind).toBe("opening_width");
    expect(classifyWallDetailHorizontalSegment(2000, 3200, 6000, openings, 1)?.kind).toBe("gap_between_openings");
    expect(classifyWallDetailHorizontalSegment(4100, 6000, 6000, openings, 1)?.kind).toBe("trailing_segment_to_wall_end");
  });

  it("buildWallDetailOpeningChainSegmentsWithEdit собирает цепочку с edit", () => {
    const openings = [
      { id: "d", wallId: "w", kind: "door" as const, offsetFromStartMm: 500, widthMm: 900, heightMm: 2100 },
    ];
    const segs = buildWallDetailOpeningChainSegmentsWithEdit(4000, openings);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    expect(segs.some((s) => s.edit?.kind === "opening_offset_from_wall_start")).toBe(true);
    expect(segs.some((s) => s.edit?.kind === "opening_width")).toBe(true);
    expect(segs.some((s) => s.edit?.kind === "trailing_segment_to_wall_end")).toBe(true);
  });
});
