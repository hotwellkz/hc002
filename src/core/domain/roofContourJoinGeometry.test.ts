import { describe, expect, it } from "vitest";

import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import {
  findCompatibleRoofJoinTargetEdge,
  joinTwoRoofPlaneContoursMvp,
  roofJoinArrowUnitWorldMm,
} from "@/core/domain/roofContourJoinGeometry";

function rectPlane(
  id: string,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
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
    angleDeg: 35,
    levelMm: 3000,
    profileId: "roof1",
    slopeDirection: { x: 0, y: -1 },
    slopeIndex: 1,
    createdAt: t,
    updatedAt: t,
  };
}

describe("findCompatibleRoofJoinTargetEdge", () => {
  it("находит параллельное ребро второго прямоугольника для типового стыка вдоль вертикали", () => {
    const left = rectPlane("a", 0, 10_000, 0, 5_000);
    const right = rectPlane("b", 12_000, 22_000, 0, 5_000);
    const polyA = roofPlanePolygonMm(left);
    const polyB = roofPlanePolygonMm(right);
    const te = findCompatibleRoofJoinTargetEdge(polyA, 1, polyB);
    expect(te).toBe(3);
  });
});

describe("roofJoinArrowUnitWorldMm", () => {
  it("даёт перпендикуляр к ребру, а не вдоль ребра", () => {
    const left = rectPlane("a", 0, 10_000, 0, 5_000);
    const poly = roofPlanePolygonMm(left);
    const a = poly[1]!;
    const b = poly[2]!;
    const eu = { x: b.x - a.x, y: b.y - a.y };
    const arrow = roofJoinArrowUnitWorldMm(poly, 1, null);
    expect(arrow).not.toBeNull();
    const dot = arrow!.x * eu.x + arrow!.y * eu.y;
    const en = Math.hypot(eu.x, eu.y);
    expect(Math.abs(dot) / en).toBeLessThan(0.02);
  });
});

describe("joinTwoRoofPlaneContoursMvp", () => {
  it("сдвигает два прямоугольника к средней линии между внутренними рёбрами", () => {
    const left = rectPlane("a", 0, 10_000, 0, 5_000);
    const right = rectPlane("b", 12_000, 22_000, 0, 5_000);
    const r = joinTwoRoofPlaneContoursMvp(left, 1, right, 3);
    expect("error" in r).toBe(false);
    if ("error" in r) {
      return;
    }
    const ca = r.a.planContourMm!;
    const cb = r.b.planContourMm!;
    expect(ca.length).toBe(4);
    expect(cb.length).toBe(4);
    const xsA = ca.map((p) => p.x);
    expect(Math.max(...xsA)).toBeCloseTo(11_000, 1);
    const xsB = cb.map((p) => p.x);
    expect(Math.min(...xsB)).toBeCloseTo(11_000, 1);
  });

  it("отказывает при непараллельных рёбрах", () => {
    const left = rectPlane("a", 0, 10_000, 0, 5_000);
    const right = rectPlane("b", 12_000, 22_000, 0, 5_000);
    const r = joinTwoRoofPlaneContoursMvp(left, 1, right, 0);
    expect("error" in r).toBe(true);
  });

  it("при встречных направлениях стока стыкует внутренние рёбра по средней линии без ошибки", () => {
    const left = {
      ...rectPlane("a", 0, 10_000, 0, 5_000),
      slopeDirection: { x: 0, y: -1 },
    };
    const right = {
      ...rectPlane("b", 12_000, 22_000, 0, 5_000),
      slopeDirection: { x: 0, y: 1 },
    };
    const r = joinTwoRoofPlaneContoursMvp(left, 1, right, 3);
    expect("error" in r).toBe(false);
    if ("error" in r) {
      return;
    }
    const ca = r.a.planContourMm!;
    const cb = r.b.planContourMm!;
    expect(ca.length).toBeGreaterThanOrEqual(3);
    expect(cb.length).toBeGreaterThanOrEqual(3);
    expect(r.a.p1).toBeDefined();
    expect(r.b.depthMm).toBeGreaterThan(100);
  });
});
