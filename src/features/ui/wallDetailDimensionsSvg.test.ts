import { describe, expect, it } from "vitest";

import { layoutHorizontalDimLabelsForRowPx } from "./wallDetailDimensionsSvg";

describe("layoutHorizontalDimLabelsForRowPx", () => {
  it("узкий средний сегмент остаётся на линии, если между подписями есть место (расширение за пределы сегмента)", () => {
    const items = [
      { segIndex: 0, L: 0, R: 150, mid: 75, w: 38 },
      { segIndex: 1, L: 150, R: 186, mid: 168, w: 32 },
      { segIndex: 2, L: 186, R: 260, mid: 223, w: 36 },
    ];
    const m = layoutHorizontalDimLabelsForRowPx(items);
    expect(m.get(0)?.kind).toBe("inline");
    expect(m.get(1)?.kind).toBe("inline");
    expect(m.get(2)?.kind).toBe("inline");
  });

  it("при невозможности уложить без пересечений — выноска у самого узкого сегмента", () => {
    const items = [
      { segIndex: 0, L: 0, R: 30, mid: 15, w: 100 },
      { segIndex: 1, L: 30, R: 60, mid: 45, w: 100 },
    ];
    const m = layoutHorizontalDimLabelsForRowPx(items);
    const leaders = [...m.entries()].filter(([, p]) => p.kind === "leader");
    expect(leaders.length).toBeGreaterThanOrEqual(1);
    expect(leaders[0]![0]).toBe(0);
  });
});
