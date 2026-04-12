import { describe, expect, it } from "vitest";

import { rawRoofZUpAtPlanPointMm } from "./roofGroupHeightAdjust";
import { updateRoofPlaneEntityAfterContourEdit } from "./roofContourJoin";
import type { RoofPlaneEntity } from "./roofPlane";
import { roofPlanePolygonMm } from "./roofPlane";

function rectPlane(
  id: string,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  angleDeg: number,
  levelMm: number,
): RoofPlaneEntity {
  const t = "2000-01-01T00:00:00.000Z";
  const h = y1 - y0;
  return {
    id,
    type: "roofPlane",
    layerId: "L1",
    p1: { x: x0, y: y0 },
    p2: { x: x1, y: y0 },
    depthMm: h,
    angleDeg,
    levelMm,
    profileId: "roof1",
    slopeDirection: { x: 0, y: -1 },
    slopeIndex: 1,
    createdAt: t,
    updatedAt: t,
  };
}

describe("updateRoofPlaneEntityAfterContourEdit", () => {
  it("сохраняет бесконечную плоскость ската при смене maxDot вдоль стока (коррекция levelMm)", () => {
    const rp = rectPlane("r1", 0, 10_000, 0, 5_000, 35, 3000);
    const px = 2_000;
    const py = 2_500;
    const layerBase = 0;
    const zBefore = rawRoofZUpAtPlanPointMm(rp, layerBase, px, py);

    const poly = [...roofPlanePolygonMm(rp)];
    const shifted = poly.map((p) => ({ x: p.x, y: p.y + 800 }));
    const next = updateRoofPlaneEntityAfterContourEdit(rp, shifted);
    expect(next).not.toBeNull();
    const zAfter = rawRoofZUpAtPlanPointMm(next!, layerBase, px, py);
    expect(Math.abs(zAfter - zBefore)).toBeLessThan(1e-3);
  });
});
