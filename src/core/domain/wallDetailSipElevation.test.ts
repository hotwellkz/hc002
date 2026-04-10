import { describe, expect, it } from "vitest";

import type { Opening } from "./opening";
import type { SipPanelRegion } from "./wallCalculation";
import type { Wall } from "./wall";
import {
  buildWallDetailSipFacadeSlices,
  openingBottomSheetYMm,
  openingTopSheetYMm,
  sheetInteriorCutXsAlongWallFromRegionsMm,
  sheetSeamCentersBetweenSipRegionsMm,
  sipPanelHorizontalDimensionSegmentsWallDetailMm,
} from "./wallDetailSipElevation";

describe("sheetSeamCentersBetweenSipRegionsMm", () => {
  it("возвращает X стыков между соседними регионами без зазора (листы 1200+1200+остаток)", () => {
    const seams = sheetSeamCentersBetweenSipRegionsMm([
      { startOffsetMm: 0, endOffsetMm: 1200 },
      { startOffsetMm: 1200, endOffsetMm: 2400 },
      { startOffsetMm: 2400, endOffsetMm: 2846 },
    ]);
    expect(seams).toEqual([1200, 2400]);
  });
});

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

  it("каркас/ГКЛ: границы листов у проёма + без срезов по световому проёму — нет ложного модуля 1250", () => {
    const door: Opening = {
      id: "d1",
      wallId: "w1",
      kind: "door",
      offsetFromStartMm: 2000,
      widthMm: 1000,
      heightMm: 2100,
    };
    const cuts = sheetInteriorCutXsAlongWallFromRegionsMm(
      [
        { startOffsetMm: 0, endOffsetMm: 1200 },
        { startOffsetMm: 1200, endOffsetMm: 1950 },
        { startOffsetMm: 3050, endOffsetMm: 4250 },
        { startOffsetMm: 4250, endOffsetMm: 5000 },
      ],
      0,
      5000,
    );
    expect(cuts).toEqual([1200, 1950, 3050, 4250]);
    const segs = sipPanelHorizontalDimensionSegmentsWallDetailMm(0, 5000, cuts, [door], {
      omitClearOpeningCutsAlongWall: true,
    });
    expect(segs.map((s) => Math.round(s.b - s.a))).toEqual([1200, 750, 1100, 1200, 750]);
    expect(segs.some((s) => Math.abs(s.b - s.a - 1250) < 1)).toBe(false);
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
    expect(slices.some((s) => s.kind === "below_opening")).toBe(false);
  });

  it("под окном: отдельная полоса SIP шириной проёма и высотой до подоконника", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const win: Opening = {
      id: "w1",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 1250,
      widthMm: 1250,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    const regions = [
      baseRegion({ id: "l", index: 0, startOffsetMm: 0, endOffsetMm: 1250 }),
      baseRegion({ id: "r", index: 1, startOffsetMm: 2500, endOffsetMm: 3750 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [win], wall, frame);
    const below = slices.find((s) => s.kind === "below_opening");
    expect(below?.kind).toBe("below_opening");
    if (below?.kind === "below_opening") {
      expect(below.specWidthMm).toBe(1250);
      expect(below.specHeightMm).toBe(900);
      expect(below.drawY0).toBe(openingBottomSheetYMm(win, frame.wallBottomMm));
      expect(below.drawY1).toBe(frame.wallBottomMm);
    }
    const idxBelow = slices.findIndex((s) => s.kind === "below_opening");
    const idxAbove = slices.findIndex((s) => s.kind === "above_opening");
    expect(idxAbove).toBeGreaterThanOrEqual(0);
    expect(idxBelow).toBeGreaterThan(idxAbove);
  });
});
