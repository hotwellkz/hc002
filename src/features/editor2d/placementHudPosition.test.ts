import { describe, expect, it } from "vitest";

import { computePlacementHudScreenPosition } from "./placementHudPosition";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return {};
    },
  };
}

describe("computePlacementHudScreenPosition", () => {
  it("при открытой модалке паркует hint внизу слева и скрывает coord HUD", () => {
    const canvasRect = rect(100, 80, 800, 600);
    const r = computePlacementHudScreenPosition({
      canvasRect,
      cursorCanvasX: 400,
      cursorCanvasY: 300,
      wallCoordinateModalOpen: true,
      showCoordHud: true,
    });
    expect(r.hintLeft).toBe(100 + 12);
    expect(r.coordHudLeft).toBeNull();
    expect(r.coordHudTop).toBeNull();
  });

  it("держит hint внутри canvas при курсоре у правого края", () => {
    const canvasRect = rect(0, 0, 400, 300);
    const r = computePlacementHudScreenPosition({
      canvasRect,
      cursorCanvasX: 390,
      cursorCanvasY: 150,
      wallCoordinateModalOpen: false,
      showCoordHud: false,
    });
    expect(r.hintLeft).toBeLessThanOrEqual(400 - 300 - 12);
    expect(r.hintLeft).toBeGreaterThanOrEqual(12);
  });
});
