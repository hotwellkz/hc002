import { describe, expect, it } from "vitest";

import {
  computeEditorInstructionScreenPosition,
  computeEditorLiveHudScreenPosition,
  computeEditorOverlayLayout,
  getEditorInstructionAvoidanceRect,
} from "./placementHudPosition";

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

describe("computeEditorInstructionScreenPosition", () => {
  it("фиксирует инструкцию в верхнем левом углу canvas", () => {
    const canvasRect = rect(100, 80, 800, 600);
    const r = computeEditorInstructionScreenPosition({
      canvasRect,
      wallCoordinateModalOpen: false,
    });
    expect(r.left).toBe(100 + 12);
    expect(r.top).toBe(80 + 12);
  });

  it("при открытой модалке координат паркует подсказку внизу слева", () => {
    const canvasRect = rect(100, 80, 800, 600);
    const r = computeEditorInstructionScreenPosition({
      canvasRect,
      wallCoordinateModalOpen: true,
    });
    expect(r.left).toBe(100 + 12);
    expect(r.top).toBeGreaterThanOrEqual(80 + 12);
    expect(r.top).toBeLessThanOrEqual(canvasRect.bottom - 12);
  });
});

describe("computeEditorLiveHudScreenPosition", () => {
  it("возвращает null при модалке координат", () => {
    const canvasRect = rect(100, 80, 800, 600);
    const avoid = getEditorInstructionAvoidanceRect(canvasRect, true);
    const r = computeEditorLiveHudScreenPosition({
      canvasRect,
      cursorCanvasX: 400,
      cursorCanvasY: 300,
      viewportWidth: 1200,
      viewportHeight: 800,
      showCoordHud: true,
      anyCoordModalOpen: true,
      instructionAvoidRect: avoid,
    });
    expect(r).toBeNull();
  });

  it("возвращает позицию рядом с курсором, вне зоны инструкции", () => {
    const canvasRect = rect(0, 0, 900, 700);
    const avoid = getEditorInstructionAvoidanceRect(canvasRect, false);
    const r = computeEditorLiveHudScreenPosition({
      canvasRect,
      cursorCanvasX: 40,
      cursorCanvasY: 40,
      viewportWidth: 1200,
      viewportHeight: 900,
      showCoordHud: true,
      anyCoordModalOpen: false,
      instructionAvoidRect: avoid,
    });
    expect(r).not.toBeNull();
    if (!r) {
      return;
    }
    const hudRight = r.left + 300;
    const hudBottom = r.top + 56;
    const overlaps =
      hudRight > avoid.left && r.left < avoid.right && hudBottom > avoid.top && r.top < avoid.bottom;
    expect(overlaps).toBe(false);
  });

  it("удерживает HUD внутри viewport", () => {
    const canvasRect = rect(0, 0, 400, 300);
    const avoid = getEditorInstructionAvoidanceRect(canvasRect, false);
    const r = computeEditorLiveHudScreenPosition({
      canvasRect,
      cursorCanvasX: 390,
      cursorCanvasY: 290,
      viewportWidth: 420,
      viewportHeight: 320,
      showCoordHud: true,
      anyCoordModalOpen: false,
      instructionAvoidRect: avoid,
    });
    expect(r).not.toBeNull();
    if (!r) {
      return;
    }
    expect(r.left).toBeGreaterThanOrEqual(8);
    expect(r.top).toBeGreaterThanOrEqual(8);
    expect(r.left + 300).toBeLessThanOrEqual(420 - 8);
    expect(r.top + 56).toBeLessThanOrEqual(320 - 8);
  });
});

describe("computeEditorOverlayLayout", () => {
  it("агрегирует instruction и liveHud", () => {
    const canvasRect = rect(50, 60, 700, 500);
    const lay = computeEditorOverlayLayout({
      canvasRect,
      cursorCanvasX: 200,
      cursorCanvasY: 220,
      viewportWidth: 1100,
      viewportHeight: 720,
      wallCoordinateModalOpen: false,
      showCoordHud: true,
    });
    expect(lay.instruction.left).toBe(62);
    expect(lay.instruction.top).toBe(72);
    expect(lay.liveHud).not.toBeNull();
    expect(lay.anyCoordModalOpen).toBe(false);
  });
});
