import { describe, expect, it } from "vitest";

import {
  applyRoofProfileOverhangToPlanPolygonMm,
  offsetConvexPolygonByEdgeDistancesMm,
  quadEdgeOverhangDistancesMm,
} from "./roofOverhangGeometry";

function verticalJoinXsMm(poly: { readonly x: number; readonly y: number }[], xExpect: number): number[] {
  const xs: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    if (Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) > 80 && Math.abs((a.x + b.x) * 0.5 - xExpect) < 4000) {
      xs.push((a.x + b.x) * 0.5);
    }
  }
  return xs;
}

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

  it("внутренний стык: нулевой свес на общем ребре не разводит вертикаль (два ската)", () => {
    const baseA = [
      { x: 0, y: 0 },
      { x: 11_000, y: 0 },
      { x: 11_000, y: 5000 },
      { x: 0, y: 5000 },
    ];
    const baseB = [
      { x: 11_000, y: 0 },
      { x: 22_000, y: 0 },
      { x: 22_000, y: 5000 },
      { x: 11_000, y: 5000 },
    ];
    const oaBad = applyRoofProfileOverhangToPlanPolygonMm(baseA, { x: 0, y: -1 }, 300, 200);
    const obBad = applyRoofProfileOverhangToPlanPolygonMm(baseB, { x: 0, y: 1 }, 300, 200);
    const xsBadA = verticalJoinXsMm(oaBad, 11_000);
    const xsBadB = verticalJoinXsMm(obBad, 11_000);
    expect(Math.min(...xsBadA) - Math.max(...xsBadB)).toBeGreaterThan(100);

    const oa = applyRoofProfileOverhangToPlanPolygonMm(baseA, { x: 0, y: -1 }, 300, 200, {
      zeroOffsetEdgeIndices: new Set([1]),
    });
    const ob = applyRoofProfileOverhangToPlanPolygonMm(baseB, { x: 0, y: 1 }, 300, 200, {
      zeroOffsetEdgeIndices: new Set([3]),
    });
    const xsA = verticalJoinXsMm(oa, 11_000);
    const xsB = verticalJoinXsMm(ob, 11_000);
    expect(xsA.length).toBeGreaterThan(0);
    expect(xsB.length).toBeGreaterThan(0);
    expect(xsA[0]!).toBeCloseTo(xsB[0]!, 0);
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
