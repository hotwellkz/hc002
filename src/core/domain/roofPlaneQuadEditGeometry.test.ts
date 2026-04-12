import { describe, expect, it } from "vitest";

import {
  clampRoofQuadCornerTargetMm,
  clampRoofQuadEdgeDeltaMm,
  isRoofQuadEditorCompatible,
  roofQuadEdgeOffsetNormalUnit,
  roofQuadEdgeOutwardNormalUnit,
  tryMoveRoofQuadCornerMm,
  tryMoveRoofQuadEdgeMm,
  type RoofQuad4,
} from "./roofPlaneQuadEditGeometry";

describe("roofPlaneQuadEditGeometry", () => {
  const rect: RoofQuad4 = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 500 },
    { x: 0, y: 500 },
  ];

  it("isRoofQuadEditorCompatible accepts rectangle", () => {
    expect(isRoofQuadEditorCompatible(rect)).toBe(true);
  });

  it("outward normal for bottom edge points roughly south", () => {
    const n = roofQuadEdgeOutwardNormalUnit(rect, 0);
    expect(n).not.toBeNull();
    expect(n!.y).toBeLessThan(-0.9);
  });

  it("moving bottom edge outward increases depth", () => {
    const delta = 100;
    const r = tryMoveRoofQuadEdgeMm(rect, 0, delta);
    expect(r.ok).toBe(true);
    expect(r.ok && r.quad[0]!.y).toBeLessThan(rect[0]!.y);
    expect(r.ok && r.quad[1]!.y).toBeLessThan(rect[1]!.y);
  });

  it("axis-aligned rectangle: vertical edge moves strictly horizontally", () => {
    const r = tryMoveRoofQuadEdgeMm(rect, 1, 60);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.quad[1]!.y).toBeCloseTo(rect[1]!.y, 3);
      expect(r.quad[2]!.y).toBeCloseTo(rect[2]!.y, 3);
      expect(r.quad[1]!.x).toBeGreaterThan(rect[1]!.x);
      expect(r.quad[2]!.x).toBeGreaterThan(rect[2]!.x);
    }
    const n1 = roofQuadEdgeOffsetNormalUnit(rect, 1);
    expect(n1).not.toBeNull();
    expect(n1!.y).toBeCloseTo(0, 5);
    expect(Math.abs(n1!.x)).toBeCloseTo(1, 5);
  });

  it("moving bottom edge inward is negative delta", () => {
    const r = tryMoveRoofQuadEdgeMm(rect, 0, -120);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.quad[0]!.y).toBeGreaterThan(rect[0]!.y);
    }
  });

  it("clamp prevents crossing opposite edge", () => {
    const huge = clampRoofQuadEdgeDeltaMm(rect, 0, 800);
    const r = tryMoveRoofQuadEdgeMm(rect, 0, huge);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const minY = Math.min(r.quad[0]!.y, r.quad[1]!.y);
      const maxY = Math.max(r.quad[2]!.y, r.quad[3]!.y);
      expect(minY).toBeLessThan(maxY);
    }
  });

  it("corner drag keeps opposite vertex fixed", () => {
    const target = { x: -80, y: -40 };
    const r = tryMoveRoofQuadCornerMm(rect, 0, target);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.quad[2]!.x).toBeCloseTo(rect[2]!.x, 3);
      expect(r.quad[2]!.y).toBeCloseTo(rect[2]!.y, 3);
    }
  });

  it("clampRoofQuadCornerTargetMm reaches partial move when target invalid", () => {
    const far = { x: -50000, y: -50000 };
    const q = clampRoofQuadCornerTargetMm(rect, 0, far);
    expect(isRoofQuadEditorCompatible(q)).toBe(true);
  });

  it("rotated parallelogram: edge delta along normal", () => {
    const rot: RoofQuad4 = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1300, y: 400 },
      { x: 300, y: 400 },
    ];
    expect(isRoofQuadEditorCompatible(rot)).toBe(true);
    const n = roofQuadEdgeOutwardNormalUnit(rot, 1);
    expect(n).not.toBeNull();
    const r = tryMoveRoofQuadEdgeMm(rot, 1, 50);
    expect(r.ok).toBe(true);
  });
});
