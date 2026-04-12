import { describe, expect, it } from "vitest";

import {
  applyRoofProfileOverhangToPlanPolygonMm,
  offsetConvexPolygonByEdgeDistancesMm,
  quadEdgeOverhangDistancesMm,
} from "./roofOverhangGeometry";

describe("roofOverhangGeometry", () => {
  it("повторное применение тех же свесов к тому же базовому четырёхугольнику даёт тот же результат", () => {
    const base = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const fall = { x: 0, y: 1 };
    const eave = 450;
    const side = 450;
    const a = applyRoofProfileOverhangToPlanPolygonMm(base, fall, eave, side);
    const b = applyRoofProfileOverhangToPlanPolygonMm(base, fall, eave, side);
    expect(a.length).toBe(4);
    expect(b.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(a[i]!.x).toBeCloseTo(b[i]!.x, 3);
      expect(a[i]!.y).toBeCloseTo(b[i]!.y, 3);
    }
  });

  it("увеличение только eave увеличивает вылет по карнизу, а не накопительно от уже расширенного", () => {
    const base = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 0, y: 2000 },
    ];
    const fall = { x: 0, y: 1 };
    const small = applyRoofProfileOverhangToPlanPolygonMm(base, fall, 200, 100);
    const big = applyRoofProfileOverhangToPlanPolygonMm(base, fall, 400, 100);
    const dSmall = quadEdgeOverhangDistancesMm(base, fall, 200, 100);
    const dBig = quadEdgeOverhangDistancesMm(base, fall, 400, 100);
    expect(dSmall.some((x) => x === 200)).toBe(true);
    expect(dBig.some((x) => x === 400)).toBe(true);
    const areaSmall = polygonAreaMm(small);
    const areaBig = polygonAreaMm(big);
    expect(areaBig).toBeGreaterThan(areaSmall);
  });

  it("карниз — сторона по направлению стока: стрелка вверх (+Y) расширяет верхнее ребро", () => {
    const base = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const d = quadEdgeOverhangDistancesMm(base, { x: 0, y: 1 }, 400, 0);
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(400);
    expect(d[3]).toBe(0);
  });

  it("карниз при стоке вниз (-Y) — нижнее ребро", () => {
    const base = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const d = quadEdgeOverhangDistancesMm(base, { x: 0, y: -1 }, 400, 0);
    expect(d[0]).toBe(400);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(0);
  });

  it("карниз при стоке вправо (+X) — правое ребро", () => {
    const base = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const d = quadEdgeOverhangDistancesMm(base, { x: 1, y: 0 }, 400, 0);
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(400);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(0);
  });

  it("карниз при стоке влево (-X) — левое ребро", () => {
    const base = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const d = quadEdgeOverhangDistancesMm(base, { x: -1, y: 0 }, 400, 0);
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(0);
    expect(d[3]).toBe(400);
  });

  it("боковой свес по-прежнему на двух сторонах между карнизом и коньком", () => {
    const base = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const d = quadEdgeOverhangDistancesMm(base, { x: 0, y: 1 }, 100, 200);
    expect(d.filter((x) => x === 100).length).toBe(1);
    expect(d.filter((x) => x === 200).length).toBe(2);
    expect(d.filter((x) => x === 0).length).toBe(1);
  });

  it("offsetConvexPolygonByEdgeDistancesMm с нулевыми смещениями возвращает тот же многоугольник", () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const z = [0, 0, 0, 0];
    const out = offsetConvexPolygonByEdgeDistancesMm(poly, z);
    expect(out).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      expect(out![i]!.x).toBeCloseTo(poly[i]!.x, 2);
      expect(out![i]!.y).toBeCloseTo(poly[i]!.y, 2);
    }
  });
});

function polygonAreaMm(poly: { x: number; y: number }[]): number {
  let s = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s * 0.5);
}
