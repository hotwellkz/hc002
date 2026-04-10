import { describe, expect, it } from "vitest";

import type { Opening } from "./opening";
import type { SipPanelRegion } from "./wallCalculation";
import type { Wall } from "./wall";
import {
  buildWallDetailSipFacadeSlices,
  openingBottomSheetYMm,
  openingStripVerticalCutXsMm,
  openingTopSheetYMm,
  sheetInteriorCutXsAlongWallFromRegionsMm,
  sheetSeamCentersBetweenSipRegionsMm,
  sipPanelHorizontalDimensionSegmentsWallDetailMm,
  wallDetailSipFullHeightOsbSeamXsMm,
  wallDetailSipOpeningStripVerticalSeamSegmentsMm,
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

  it("каркас/ГКЛ: границы листов по световому проёму + без срезов по clear — шаги по sipRegions", () => {
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
        { startOffsetMm: 1200, endOffsetMm: 2000 },
        { startOffsetMm: 3000, endOffsetMm: 4200 },
        { startOffsetMm: 4200, endOffsetMm: 5000 },
      ],
      0,
      5000,
    );
    expect(cuts).toEqual([1200, 2000, 3000, 4200]);
    const segs = sipPanelHorizontalDimensionSegmentsWallDetailMm(0, 5000, cuts, [door], {
      omitClearOpeningCutsAlongWall: true,
    });
    expect(segs.map((s) => Math.round(s.b - s.a))).toEqual([1200, 800, 1000, 1200, 800]);
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
      expect(above.segmentIndex).toBe(0);
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
      expect(below.segmentIndex).toBe(0);
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

  it("над и под окном 1875 мм — два сегмента 1250 + 625 (модуль 1250)", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const win: Opening = {
      id: "w1875",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 1250,
      widthMm: 1875,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    const regions = [
      baseRegion({ id: "l", index: 0, startOffsetMm: 0, endOffsetMm: 1250 }),
      baseRegion({ id: "r", index: 1, startOffsetMm: 3125, endOffsetMm: 4375 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [win], wall, frame, { panelNominalWidthMm: 1250 });
    const above = slices.filter((s) => s.kind === "above_opening");
    const below = slices.filter((s) => s.kind === "below_opening");
    expect(above).toHaveLength(2);
    expect(below).toHaveLength(2);
    expect(above.map((s) => (s.kind === "above_opening" ? Math.round(s.specWidthMm) : 0))).toEqual([1250, 625]);
    expect(below.map((s) => (s.kind === "below_opening" ? Math.round(s.specWidthMm) : 0))).toEqual([1250, 625]);
  });

  it("wallDetailSipFullHeightOsbSeamXsMm не включает внутренний шов 2500 (только полоса над/под окном)", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const win: Opening = {
      id: "w1875b",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 1250,
      widthMm: 1875,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    const regions = [
      baseRegion({ id: "l", index: 0, startOffsetMm: 0, endOffsetMm: 1250 }),
      baseRegion({ id: "r", index: 1, startOffsetMm: 3125, endOffsetMm: 4375 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [win], wall, frame, { panelNominalWidthMm: 1250 });
    const xs = wallDetailSipFullHeightOsbSeamXsMm(slices, []);
    expect(xs).not.toContain(2500);
    expect(xs).toEqual([0, 1250, 3125, 4375]);
  });

  it("wallDetailSipOpeningStripVerticalSeamSegmentsMm: шов 1250|625 только в полосах над и под окном, не через проём", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const win: Opening = {
      id: "w1875c",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 1250,
      widthMm: 1875,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    const regions = [
      baseRegion({ id: "l", index: 0, startOffsetMm: 0, endOffsetMm: 1250 }),
      baseRegion({ id: "r", index: 1, startOffsetMm: 3125, endOffsetMm: 4375 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [win], wall, frame, { panelNominalWidthMm: 1250 });
    const segs = wallDetailSipOpeningStripVerticalSeamSegmentsMm(slices);
    expect(segs).toHaveLength(2);
    const xSplit = 1250 + 1250;
    const yOpenTop = openingTopSheetYMm(win, frame.wallBottomMm);
    const yOpenBottom = openingBottomSheetYMm(win, frame.wallBottomMm);
    for (const s of segs) {
      expect(s.xMm).toBeCloseTo(xSplit, 2);
      expect(s.y1Mm).toBeGreaterThan(s.y0Mm);
      const throughOpening = s.y0Mm < yOpenBottom - 0.5 && s.y1Mm > yOpenTop + 0.5;
      expect(throughOpening).toBe(false);
    }
    const aboveSeg = segs.find((s) => s.y1Mm <= yOpenTop + 0.5);
    const belowSeg = segs.find((s) => s.y0Mm >= yOpenBottom - 0.5);
    expect(aboveSeg).toBeDefined();
    expect(belowSeg).toBeDefined();
  });

  it("openingStripVerticalCutXsMm: 2500 → 1250+1250; 1300 → 1250+50; шов на краю проёма не дублируется", () => {
    expect(openingStripVerticalCutXsMm(0, 2500, [], 1250)).toEqual([0, 1250, 2500]);
    expect(openingStripVerticalCutXsMm(1000, 2300, [], 1250)).toEqual([1000, 2250, 2300]);
    expect(openingStripVerticalCutXsMm(0, 1300, [], 1250)).toEqual([0, 1250, 1300]);
    expect(openingStripVerticalCutXsMm(1250, 3125, [], 1250)).toEqual([1250, 2500, 3125]);
  });
});

describe("openingStripVerticalCutXsMm with interior region seams", () => {
  it("добавляет внутренний шов из sipRegions внутри проёма", () => {
    const regions = [
      { startOffsetMm: 0, endOffsetMm: 1000 },
      { startOffsetMm: 2400, endOffsetMm: 3000 },
    ];
    const xs = openingStripVerticalCutXsMm(1000, 3000, regions, 1250);
    expect(xs).toContain(2400);
    expect(xs).toContain(2250);
  });
});
