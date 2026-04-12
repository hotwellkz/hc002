import { describe, expect, it } from "vitest";

import { perspectiveDistanceMmToFitSphereRadius } from "./editor3dCameraPresetsMath";

describe("perspectiveDistanceMmToFitSphereRadius", () => {
  it("возвращает минимум для невалидного радиуса", () => {
    expect(perspectiveDistanceMmToFitSphereRadius(0, 45, 1)).toBe(2_500);
    expect(perspectiveDistanceMmToFitSphereRadius(-1, 45, 1)).toBe(2_500);
  });

  it("растёт с радиусом и укладывает сферу в кадр", () => {
    const dSmall = perspectiveDistanceMmToFitSphereRadius(5, 45, 16 / 9, 1);
    const dLarge = perspectiveDistanceMmToFitSphereRadius(10, 45, 16 / 9, 1);
    expect(dLarge).toBeGreaterThan(dSmall);
    expect(dSmall).toBeGreaterThanOrEqual(2_500);
  });
});
