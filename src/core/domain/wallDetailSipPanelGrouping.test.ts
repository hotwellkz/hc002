import { describe, expect, it } from "vitest";

import type { SipPanelRegion } from "./wallCalculation";
import type { Wall } from "./wall";
import { buildWallDetailSipFacadeSlices } from "./wallDetailSipElevation";
import {
  buildWallDetailSipPanelDisplayGrouping,
  wallDetailSipFacadeSliceRole,
} from "./wallDetailSipPanelGrouping";

const baseRegion = (o: Partial<SipPanelRegion> & Pick<SipPanelRegion, "id" | "index" | "startOffsetMm" | "endOffsetMm">): SipPanelRegion => ({
  wallId: "w1",
  calculationId: "c",
  widthMm: o.endOffsetMm - o.startOffsetMm,
  pieceMark: "P",
  heightMm: 2410,
  thicknessMm: 163,
  ...o,
});

describe("wallDetailSipFacadeSliceRole", () => {
  it("крайние колонки — угловые роли", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const col = buildWallDetailSipFacadeSlices(
      [baseRegion({ id: "a", index: 0, startOffsetMm: 0, endOffsetMm: 1250 })],
      [],
      wall,
      { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 },
    )[0]!;
    expect(wallDetailSipFacadeSliceRole(col, 5000, [], "w1")).toBe("corner-left");

    const colR = buildWallDetailSipFacadeSlices(
      [baseRegion({ id: "z", index: 0, startOffsetMm: 3875, endOffsetMm: 5000 })],
      [],
      wall,
      { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 },
    )[0]!;
    expect(wallDetailSipFacadeSliceRole(colR, 5000, [], "w1")).toBe("corner-right");
  });

  it("колонка справа от окна, не у края стены — adjacent-window-right", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const win: import("./opening").Opening = {
      id: "ok1",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 1250,
      widthMm: 1250,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    const slices = buildWallDetailSipFacadeSlices(
      [
        baseRegion({ id: "l", index: 0, startOffsetMm: 0, endOffsetMm: 1250 }),
        baseRegion({ id: "r", index: 1, startOffsetMm: 2500, endOffsetMm: 4000 }),
        baseRegion({ id: "tail", index: 2, startOffsetMm: 4000, endOffsetMm: 6000 }),
      ],
      [win],
      wall,
      { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 },
    );
    const rightCol = slices.find((s) => s.kind === "column" && s.region.id === "r");
    expect(rightCol?.kind).toBe("column");
    if (rightCol?.kind === "column") {
      expect(wallDetailSipFacadeSliceRole(rightCol, 6000, [win], "w1")).toBe("adjacent-window-right");
    }
  });
});

describe("buildWallDetailSipPanelDisplayGrouping", () => {
  it("две одинаковые обычные колонки объединяются по количеству", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const regions = [
      baseRegion({ id: "a", index: 0, startOffsetMm: 0, endOffsetMm: 1250 }),
      baseRegion({ id: "b", index: 1, startOffsetMm: 1250, endOffsetMm: 2500 }),
      baseRegion({ id: "c", index: 2, startOffsetMm: 2500, endOffsetMm: 3750 }),
      baseRegion({ id: "d", index: 3, startOffsetMm: 3750, endOffsetMm: 5000 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [], wall, frame);
    const g = buildWallDetailSipPanelDisplayGrouping(slices, 5000, 163, [], wall.id, frame.wallBottomMm);
    expect(slices).toHaveLength(4);
    const regular = g.groupedRows.find((r) => r.role === "regular");
    expect(regular?.qty).toBe(2);
    expect(regular?.widthMm).toBe(1250);
    expect(regular?.heightMm).toBe(2500);
    expect(g.slicePositionOneBased.filter((p) => p === regular?.positionOneBased).length).toBe(2);
  });

  it("угловая и обычная одинакового размера — разные позиции", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const regions = [
      baseRegion({ id: "a", index: 0, startOffsetMm: 0, endOffsetMm: 1250 }),
      baseRegion({ id: "b", index: 1, startOffsetMm: 1250, endOffsetMm: 2500 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [], wall, frame);
    const g = buildWallDetailSipPanelDisplayGrouping(slices, 2500, 163, [], wall.id, frame.wallBottomMm);
    expect(g.groupedRows).toHaveLength(2);
    const roles = new Set(g.groupedRows.map((r) => r.role));
    expect(roles.has("corner-left")).toBe(true);
    expect(roles.has("corner-right")).toBe(true);
    expect(g.groupedRows.every((r) => r.qty === 1)).toBe(true);
  });

  it("полоса над окном не сливается с колонкой того же габарита по роли", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const win: import("./opening").Opening = {
      id: "ok1",
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
    const g = buildWallDetailSipPanelDisplayGrouping(slices, 3750, 163, [win], wall.id, frame.wallBottomMm);
    const top = g.groupedRows.find((r) => r.role === "adjacent-window-top");
    const bottom = g.groupedRows.find((r) => r.role === "adjacent-window-bottom");
    expect(top?.qty).toBe(1);
    expect(bottom?.qty).toBe(1);
    expect(top?.groupKey).not.toBe(bottom?.groupKey);
  });

  it("две панели справа от окон одинакового габарита не сливаются при разной высоте/геометрии проёмов", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const winHighSill: import("./opening").Opening = {
      id: "ok1",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 1000,
      widthMm: 1250,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    const winLowSill: import("./opening").Opening = {
      id: "ok2",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 5000,
      widthMm: 1250,
      heightMm: 1300,
      sillHeightMm: 600,
    };
    const regions = [
      baseRegion({ id: "a", index: 0, startOffsetMm: 0, endOffsetMm: 1000 }),
      baseRegion({ id: "r1", index: 1, startOffsetMm: 2250, endOffsetMm: 3500 }),
      baseRegion({ id: "mid", index: 2, startOffsetMm: 3500, endOffsetMm: 5000 }),
      baseRegion({ id: "r2", index: 3, startOffsetMm: 6250, endOffsetMm: 7500 }),
      baseRegion({ id: "tail", index: 4, startOffsetMm: 7500, endOffsetMm: 10000 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [winHighSill, winLowSill], wall, frame);
    const g = buildWallDetailSipPanelDisplayGrouping(
      slices,
      10000,
      163,
      [winHighSill, winLowSill],
      wall.id,
      frame.wallBottomMm,
    );
    const rightRows = g.groupedRows.filter((r) => r.role === "adjacent-window-right");
    const wideRights = rightRows.filter((r) => r.widthMm === 1250 && r.heightMm === 2500);
    expect(wideRights.length).toBe(2);
    expect(wideRights[0]!.groupKey).not.toBe(wideRights[1]!.groupKey);
    expect(wideRights.every((r) => r.qty === 1)).toBe(true);
  });

  it("два одинаковых окна на одной высоте — две одинаковые панели справа могут объединиться", () => {
    const wall = { id: "w1", heightMm: 2500 } as Wall;
    const frame = { wallTopMm: 96, wallBottomMm: 2596, wallHeightMm: 2500 };
    const w1: import("./opening").Opening = {
      id: "ok1",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 1000,
      widthMm: 1250,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    const w2: import("./opening").Opening = {
      id: "ok2",
      wallId: "w1",
      kind: "window",
      offsetFromStartMm: 5000,
      widthMm: 1250,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    const regions = [
      baseRegion({ id: "a", index: 0, startOffsetMm: 0, endOffsetMm: 1000 }),
      baseRegion({ id: "r1", index: 1, startOffsetMm: 2250, endOffsetMm: 3500 }),
      baseRegion({ id: "mid", index: 2, startOffsetMm: 3500, endOffsetMm: 5000 }),
      baseRegion({ id: "r2", index: 3, startOffsetMm: 6250, endOffsetMm: 7500 }),
      baseRegion({ id: "tail", index: 4, startOffsetMm: 7500, endOffsetMm: 10000 }),
    ];
    const slices = buildWallDetailSipFacadeSlices(regions, [w1, w2], wall, frame);
    const g = buildWallDetailSipPanelDisplayGrouping(slices, 10000, 163, [w1, w2], wall.id, frame.wallBottomMm);
    const rightRow = g.groupedRows.find((r) => r.role === "adjacent-window-right" && r.widthMm === 1250 && r.heightMm === 2500);
    expect(rightRow?.qty).toBe(2);
  });
});
