import { describe, expect, it } from "vitest";

import { createEmptyProject } from "../domain/projectFactory";
import type { Wall } from "../domain/wall";
import {
  closestPointOnSegment,
  collectWallPlanVertexSnapCandidatesMm,
  layerIdsForSnapGeometry,
  resolveSnap2d,
} from "./snap2d";
import { buildViewportTransform } from "./viewportTransform";

describe("closestPointOnSegment", () => {
  it("проекция внутри сегмента", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1000, y: 0 };
    const p = { x: 400, y: 300 };
    const { point, t } = closestPointOnSegment(p, a, b);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    expect(point.x).toBe(400);
    expect(point.y).toBe(0);
  });
});

describe("resolveSnap2d", () => {
  const project = createEmptyProject();

  it("без viewport возвращает raw", () => {
    const r = resolveSnap2d({
      rawWorldMm: { x: 123, y: 456 },
      viewport: null,
      project,
      snapSettings: { snapToVertex: true, snapToEdge: true, snapToGrid: true },
      gridStepMm: 100,
    });
    expect(r.kind).toBe("none");
    expect(r.point).toEqual({ x: 123, y: 456 });
  });

  it("приоритет: вершина ближе чем сетка", () => {
    const wallStart = { x: 500, y: 500 };
    const p = createEmptyProject();
    const tHi = buildViewportTransform(800, 600, 0, 0, 1);
    const w: Wall = {
      id: "w1",
      layerId: p.activeLayerId,
      start: wallStart,
      end: { x: 2000, y: 500 },
      thicknessMm: 100,
      heightMm: 2500,
      baseElevationMm: 0,
    };
    const withWall = { ...p, walls: [w] };
    const rawNearVertex = { x: wallStart.x + 5, y: wallStart.y };
    const r = resolveSnap2d({
      rawWorldMm: rawNearVertex,
      viewport: tHi,
      project: withWall,
      snapSettings: { snapToVertex: true, snapToEdge: true, snapToGrid: true },
      gridStepMm: 100,
    });
    expect(r.kind).toBe("vertex");
    expect(r.point.x).toBeCloseTo(wallStart.x);
    expect(r.point.y).toBeCloseTo(wallStart.y);
  });

  it("мягкая сетка: далеко от узла — без привязки", () => {
    const tZoom1 = buildViewportTransform(800, 600, 0, 0, 1);
    const r = resolveSnap2d({
      rawWorldMm: { x: 153, y: 247 },
      viewport: tZoom1,
      project,
      snapSettings: { snapToVertex: false, snapToEdge: false, snapToGrid: true },
      gridStepMm: 100,
    });
    expect(r.kind).toBe("none");
  });

  it("вершина контура полосы (наружный/внутренний угол), а не только ось стены", () => {
    const p = createEmptyProject();
    const tHi = buildViewportTransform(800, 600, 0, 0, 1);
    const w: Wall = {
      id: "w1",
      layerId: p.activeLayerId,
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      thicknessMm: 100,
      heightMm: 2500,
      baseElevationMm: 0,
    };
    const outerCornerStart = { x: 0, y: -50 };
    const raw = { x: 4, y: -51 };
    const r = resolveSnap2d({
      rawWorldMm: raw,
      viewport: tHi,
      project: { ...p, walls: [w] },
      snapSettings: { snapToVertex: true, snapToEdge: true, snapToGrid: true },
      gridStepMm: 100,
    });
    expect(r.kind).toBe("vertex");
    expect(r.point.x).toBeCloseTo(outerCornerStart.x);
    expect(r.point.y).toBeCloseTo(outerCornerStart.y);
  });

  it("collectWallPlanVertexSnapCandidatesMm включает углы полосы и концы оси", () => {
    const p = createEmptyProject();
    const w: Wall = {
      id: "w1",
      layerId: p.activeLayerId,
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      thicknessMm: 100,
      heightMm: 2500,
      baseElevationMm: 0,
    };
    const proj = { ...p, walls: [w] };
    const ids = layerIdsForSnapGeometry(proj);
    const c = collectWallPlanVertexSnapCandidatesMm(proj, ids);
    expect(c.length).toBeGreaterThanOrEqual(4);
    expect(c.some((v) => v.x === 0 && v.y === 0)).toBe(true);
    expect(c.some((v) => v.x === 0 && v.y === -50)).toBe(true);
    expect(c.some((v) => v.x === 0 && v.y === 50)).toBe(true);
  });
});
