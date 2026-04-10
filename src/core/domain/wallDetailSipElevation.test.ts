import { describe, expect, it } from "vitest";

import type { Opening } from "./opening";
import type { SipPanelRegion } from "./wallCalculation";
import type { Wall } from "./wall";
import {
  buildWallDetailSipFacadeSlices,
  openingTopSheetYMm,
  sipPanelHorizontalDimensionSegmentsWallDetailMm,
} from "./wallDetailSipElevation";

describe("sipPanelHorizontalDimensionSegmentsWallDetailMm", () => {
  it("добавляет разрезы по границам проёма (не один длинный сегмент через дверной зазор)", () => {
    const seam = [2000];
    const door: Opening = {
      id: "d1",
      wallId: "w1",
      kind: "door",
      offsetFromStartMm: 2000,
      widthMm: 1000,
      heightMm: 2100,
    };
    const noOpening = sipPanelHorizontalDimensionSegmentsWallDetailMm(0, 5000, seam, []);
    const withOpening = sipPanelHorizontalDimensionSegmentsWallDetailMm(0, 5000, seam, [door]);
    expect(withOpening.length).toBeGreaterThan(noOpening.length);
    expect(withOpening.some((s) => Math.abs(s.b - s.a - 1000) < 1)).toBe(true);
  });
});

describe("buildWallDetailSipFacadeSlices", () => {
  const baseRegion = (o: Partial<SipPanelRegion> & Pick<SipPanelRegion, "id" | "index" | "startOffsetMm" | "endOffsetMm">): SipPanelRegion => ({
    wallId: "w1",
    calculationId: "c",
    widthMm: o.endOffsetMm - o.startOffsetMm,
    pieceMark: "P",
    heightMm: 2410,
    thicknessMm: 163,
    ...o,
  });

  it("колонка: specHeight = высота стены, не heightMm региона", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const regions = [baseRegion({ id: "a", index: 0, startOffsetMm: 0, endOffsetMm: 1250 })];
    const slices = buildWallDetailSipFacadeSlices(regions, [], wall, frame);
    expect(slices).toHaveLength(1);
    const col = slices[0];
    expect(col?.kind).toBe("column");
    if (col?.kind === "column") {
      expect(col.specHeightMm).toBe(2500);
      expect(col.specWidthMm).toBe(1250);
    }
  });

  it("над дверью: ширина проёма и высота от верха стены до верха светового проёма", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const door: Opening = {
      id: "d1",
      wallId: "w1",
      kind: "door",
      offsetFromStartMm: 1250,
      widthMm: 1000,
      heightMm: 2100,
    };
    const regions = [
      baseRegion({ id: "l", index: 0, startOffsetMm: 0, endOffsetMm: 1250 }),
      baseRegion({ id: "r", index: 1, startOffsetMm: 2250, endOffsetMm: 3125 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [door], wall, frame);
    const above = slices.find((s) => s.kind === "above_opening");
    expect(above?.kind).toBe("above_opening");
    if (above?.kind === "above_opening") {
      expect(above.specWidthMm).toBe(1000);
      expect(above.specHeightMm).toBe(400);
      expect(above.drawY1).toBe(openingTopSheetYMm(door, frame.wallBottomMm));
    }
  });
});
