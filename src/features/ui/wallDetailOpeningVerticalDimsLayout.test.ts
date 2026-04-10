import { describe, expect, it } from "vitest";

import {
  computeOpeningVerticalDimColumnXmm,
  minVerticalOpeningDimLineXMm,
  verticalOpeningDimMinColumnDeltaMm,
  WALL_DETAIL_OPENING_V_DIM_BASE_OFFSET_MM,
} from "@/features/ui/wallDetailOpeningVerticalDimsLayout";
import { DIMENSION_V_LABEL_GAP_OPENING_EXTRA_PX, DIMENSION_V_LABEL_GAP_PX } from "@/shared/dimensionStyle";

const labelGap = DIMENSION_V_LABEL_GAP_PX + DIMENSION_V_LABEL_GAP_OPENING_EXTRA_PX;

describe("computeOpeningVerticalDimColumnXmm", () => {
  it("ставит одно окно справа от проёма с базовым отступом", () => {
    const m = computeOpeningVerticalDimColumnXmm(
      [
        {
          id: "w1",
          x0: 1000,
          x1: 2300,
          yDimTopMm: 400,
          yDimBottomMm: 2800,
          dimTexts: ["900", "1300"],
        },
      ],
      [],
      0.12,
      labelGap,
    );
    expect(m.get("w1")).toBeGreaterThanOrEqual(2300 + WALL_DETAIL_OPENING_V_DIM_BASE_OFFSET_MM - 0.5);
  });

  it("два окна в одном поясе по Y — второй столбец правее первого", () => {
    const zoom = 0.12;
    const m = computeOpeningVerticalDimColumnXmm(
      [
        {
          id: "a",
          x0: 500,
          x1: 1800,
          yDimTopMm: 300,
          yDimBottomMm: 2800,
          dimTexts: ["900", "1400"],
        },
        {
          id: "b",
          x0: 2400,
          x1: 3700,
          yDimTopMm: 300,
          yDimBottomMm: 2800,
          dimTexts: ["900", "1400"],
        },
      ],
      [],
      zoom,
      labelGap,
    );
    const xa = m.get("a")!;
    const xb = m.get("b")!;
    expect(xb).toBeGreaterThanOrEqual(xa + verticalOpeningDimMinColumnDeltaMm(zoom, labelGap) - 1);
  });

  it("сдвигает ось от вертикали-препятствия (стык)", () => {
    const base = computeOpeningVerticalDimColumnXmm(
      [
        {
          id: "w1",
          x0: 0,
          x1: 1200,
          yDimTopMm: 100,
          yDimBottomMm: 500,
          dimTexts: ["900"],
        },
      ],
      [],
      0.12,
      labelGap,
    ).get("w1")!;

    const shifted = computeOpeningVerticalDimColumnXmm(
      [
        {
          id: "w1",
          x0: 0,
          x1: 1200,
          yDimTopMm: 100,
          yDimBottomMm: 500,
          dimTexts: ["900"],
        },
      ],
      [base],
      0.12,
      labelGap,
    ).get("w1")!;

    expect(shifted).toBeGreaterThan(base + 8);
  });
});

describe("minVerticalOpeningDimLineXMm", () => {
  it("увеличивает X при длинной подписи", () => {
    const short = minVerticalOpeningDimLineXMm(2000, ["9"], 0.1, labelGap);
    const long = minVerticalOpeningDimLineXMm(2000, ["9999"], 0.1, labelGap);
    expect(long).toBeGreaterThanOrEqual(short);
  });
});
