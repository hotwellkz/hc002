import { describe, expect, it } from "vitest";

import type { RoofQuad4 } from "@/core/domain/roofPlaneQuadEditGeometry";
import { buildViewportTransform } from "@/core/geometry/viewportTransform";

import { pickRoofPlaneEditHandleMm, pickRoofPlaneEditHandleScreen } from "./roofPlaneEditHandlesPick2d";

describe("pickRoofPlaneEditHandleMm", () => {
  /** Длинная «карнизная» сторона и короткая глубина — типичный скат. */
  const wideShallow: RoofQuad4 = [
    { x: 0, y: 0 },
    { x: 10_000, y: 0 },
    { x: 10_000, y: 80 },
    { x: 0, y: 80 },
  ];

  it("на короткой стороне в середине выбирает ребро, а не ближайший угол", () => {
    const tolMm = 150;
    const midRight: { x: number; y: number } = { x: 10_000, y: 40 };
    const hit = pickRoofPlaneEditHandleMm(midRight, wideShallow, tolMm);
    expect(hit).not.toBeNull();
    if (!hit) {
      return;
    }
    expect(hit.kind).toBe("edge");
    if (hit.kind === "edge") {
      expect(hit.edgeIndex).toBe(1);
    }
  });

  it("у вершины по-прежнему приоритет у угла", () => {
    const tolMm = 150;
    const nearCorner: { x: number; y: number } = { x: 10_000, y: 6 };
    const hit = pickRoofPlaneEditHandleMm(nearCorner, wideShallow, tolMm);
    expect(hit).not.toBeNull();
    if (!hit) {
      return;
    }
    expect(hit.kind).toBe("corner");
    if (hit.kind === "corner") {
      expect(hit.cornerIndex === 1 || hit.cornerIndex === 2).toBe(true);
    }
  });

  it("screen pick: короткая боковая сторона — ребро с щедрым px-допуском", () => {
    const wideShallow: RoofQuad4 = [
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 10_000, y: 80 },
      { x: 0, y: 80 },
    ];
    const w = 800;
    const h = 600;
    const panXMm = 10_000;
    const panYMm = 40;
    const z = 1;
    const vp = buildViewportTransform(w, h, panXMm, panYMm, z);
    const sx = w / 2;
    const sy = h / 2 + 6;
    const hit = pickRoofPlaneEditHandleScreen(sx, sy, wideShallow, vp, null);
    expect(hit).not.toBeNull();
    expect(hit?.kind).toBe("edge");
    if (hit?.kind === "edge") {
      expect(hit.edgeIndex).toBe(1);
    }
  });

  it("screen pick: гистерезис держит то же ребро при микросдвиге", () => {
    const wideShallow: RoofQuad4 = [
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 10_000, y: 80 },
      { x: 0, y: 80 },
    ];
    const w = 800;
    const h = 600;
    const vp = buildViewportTransform(w, h, 10_000, 40, 1);
    const sx0 = w / 2;
    const sy0 = h / 2 + 5;
    const h0 = pickRoofPlaneEditHandleScreen(sx0, sy0, wideShallow, vp, null);
    expect(h0?.kind).toBe("edge");
    if (h0?.kind !== "edge") {
      return;
    }
    const sticky = { kind: "edge" as const, edgeIndex: h0.edgeIndex };
    const sx1 = sx0 + 7;
    const sy1 = sy0 + 6;
    const h1 = pickRoofPlaneEditHandleScreen(sx1, sy1, wideShallow, vp, sticky);
    expect(h1?.kind).toBe("edge");
    if (h1?.kind === "edge") {
      expect(h1.edgeIndex).toBe(h0.edgeIndex);
    }
  });
});
