import { describe, expect, it } from "vitest";

import { isWallAxisMostlyHorizontalWorld, openingPlanLabelRotationRad } from "./openingPlanLabelOrientation2d";

const t = { centerX: 400, centerY: 300, zoomPixelsPerMm: 0.1, panXMm: 0, panYMm: 0 };

describe("openingPlanLabelOrientation2d", () => {
  it("горизонтальная стена (вдоль X) — без поворота", () => {
    expect(isWallAxisMostlyHorizontalWorld(5000, 0)).toBe(true);
    expect(openingPlanLabelRotationRad(5000, 0, t)).toBe(0);
  });

  it("вертикальная стена (вдоль Y) — ненулевой поворот, нормализованный", () => {
    expect(isWallAxisMostlyHorizontalWorld(0, 4000)).toBe(false);
    const r = openingPlanLabelRotationRad(0, 4000, t);
    expect(Math.abs(r)).toBeLessThanOrEqual(Math.PI / 2 + 1e-6);
    expect(Math.abs(r)).toBeGreaterThan(0.1);
  });
});
