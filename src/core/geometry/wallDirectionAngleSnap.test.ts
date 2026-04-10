import { describe, expect, it } from "vitest";

import {
  circularDiffDeg,
  normalizeAngleDeg360,
  secondPointAlongSnappedDirectionMm,
  wallDirectionAngleSnapDeg,
} from "./wallDirectionAngleSnap";

describe("wallDirectionAngleSnapDeg", () => {
  it("прилипает к 0° около горизонтали", () => {
    const r = wallDirectionAngleSnapDeg(3, null);
    expect(r.snappedDeg).toBe(0);
    expect(r.nextLockedDeg).toBe(0);
  });

  it("прилипает к 90° около вертикали вверх (план)", () => {
    const r = wallDirectionAngleSnapDeg(88, null);
    expect(r.snappedDeg).toBe(90);
  });

  it("диагональ 45° с более узким допуском", () => {
    const r = wallDirectionAngleSnapDeg(46, null);
    expect(r.snappedDeg).toBe(45);
  });

  it("ортогональ имеет приоритет над диагональю при близости к оси", () => {
    const r = wallDirectionAngleSnapDeg(2, null);
    expect(r.snappedDeg).toBe(0);
  });

  it("гистерезис: держит защёлку пока в зоне release", () => {
    const first = wallDirectionAngleSnapDeg(89, null);
    expect(first.snappedDeg).toBe(90);
    const locked = first.nextLockedDeg;
    const hold = wallDirectionAngleSnapDeg(80, locked);
    expect(hold.snappedDeg).toBe(90);
  });

  it("после выхода из release можно сменить угол", () => {
    const first = wallDirectionAngleSnapDeg(89, null);
    const locked = first.nextLockedDeg;
    const far = wallDirectionAngleSnapDeg(0, locked);
    expect(far.snappedDeg).toBe(0);
  });

  it("secondPointAlongSnappedDirectionMm сохраняет длину вектора до preview", () => {
    const first = { x: 0, y: 0 };
    const end = { x: 100, y: 5 };
    const len = Math.hypot(end.x - first.x, end.y - first.y);
    const p = secondPointAlongSnappedDirectionMm(first, end, 0);
    expect(Math.hypot(p.x - first.x, p.y - first.y)).toBeCloseTo(len, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });
});

describe("normalizeAngleDeg360 / circularDiffDeg", () => {
  it("normalizeAngleDeg360", () => {
    expect(normalizeAngleDeg360(-10)).toBeCloseTo(350, 5);
  });
  it("circularDiffDeg", () => {
    expect(circularDiffDeg(350, 10)).toBeCloseTo(20, 5);
  });
});
