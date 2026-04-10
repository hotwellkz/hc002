import { describe, expect, it } from "vitest";
import { computeLumberPieceNumberLabelPx } from "@/features/ui/wallDetailLumberPieceLabelLayout";

describe("computeLumberPieceNumberLabelPx", () => {
  it("центрирует подпись и укладывает подложку внутри доски", () => {
    const leftPx = 100;
    const topPx = 200;
    const wPx = 80;
    const hPx = 24;
    const r = computeLumberPieceNumberLabelPx({ leftPx, topPx, wPx, hPx, n: 3 });
    expect(r.cx).toBeCloseTo(leftPx + wPx / 2, 4);
    expect(r.cy).toBeCloseTo(topPx + hPx / 2, 4);
    expect(r.pillX).toBeGreaterThanOrEqual(leftPx);
    expect(r.pillY).toBeGreaterThanOrEqual(topPx);
    expect(r.pillX + r.pillW).toBeLessThanOrEqual(leftPx + wPx + 0.01);
    expect(r.pillY + r.pillH).toBeLessThanOrEqual(topPx + hPx + 0.01);
    expect(r.fontSizePx).toBe(10);
  });

  it("на узкой доске ужимает отступы и/или кегль", () => {
    const r = computeLumberPieceNumberLabelPx({
      leftPx: 0,
      topPx: 0,
      wPx: 14,
      hPx: 18,
      n: 12,
    });
    expect(r.pillX + r.pillW).toBeLessThanOrEqual(14 + 0.01);
    expect(r.pillY + r.pillH).toBeLessThanOrEqual(18 + 0.01);
    expect(r.fontSizePx).toBeLessThanOrEqual(10);
  });
});
