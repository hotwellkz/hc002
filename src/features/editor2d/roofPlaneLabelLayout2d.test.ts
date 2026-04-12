import { describe, expect, it } from "vitest";

import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { buildViewportTransform } from "@/core/geometry/viewportTransform";

import {
  computeArrowDrawableAabbPx,
  computeRoofLabelLayouts2d,
  estimateRoofLabelTextBlockPx,
  roofPlaneSlopeArrowLineScreenPx,
  type RectPx,
} from "./roofPlaneLabelLayout2d";

function rectRoof(
  id: string,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  slopeIndex: number,
  slopeDirection: { x: number; y: number },
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
    angleDeg: 15,
    levelMm: 0,
    profileId: "roof1",
    slopeDirection,
    slopeIndex,
    createdAt: t,
    updatedAt: t,
  };
}

function inflate(r: RectPx, p: number): RectPx {
  return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p };
}

function intersects(a: RectPx, b: RectPx): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("computeRoofLabelLayouts2d", () => {
  it("текстовый блок не пересекает расширенный AABB своей стрелки (вертикальный сток на плане)", () => {
    const t = buildViewportTransform(900, 700, 0, 0, 0.08);
    const rp = rectRoof("r1", 0, 8_000, 0, 4_000, 1, { x: 0, y: -1 });
    const [lay] = computeRoofLabelLayouts2d([rp], t, { style: { fontSizePx: 11, lineHeightFactor: 1.28 } });
    expect(lay).toBeDefined();
    const gap = 7;
    const arrowClear = inflate(lay!.arrowBoundsPx, gap);
    const textBox: RectPx = {
      x: lay!.textTopLeftPx.x,
      y: lay!.textTopLeftPx.y,
      w: lay!.textWidthPx,
      h: lay!.textHeightPx,
    };
    expect(intersects(textBox, arrowClear)).toBe(false);
  });

  it("два соседних ската: подписи не пересекают друг друга (AABB с паддингом)", () => {
    const t = buildViewportTransform(900, 700, 0, 0, 0.08);
    const a = rectRoof("a", 0, 7_000, 0, 4_000, 1, { x: 0, y: -1 });
    const b = rectRoof("b", 9_000, 16_000, 0, 4_000, 2, { x: 0, y: -1 });
    const layouts = computeRoofLabelLayouts2d([a, b], t, { style: { fontSizePx: 11 } });
    expect(layouts.length).toBe(2);
    const pad = 4;
    const r0 = inflate(
      {
        x: layouts[0]!.textTopLeftPx.x,
        y: layouts[0]!.textTopLeftPx.y,
        w: layouts[0]!.textWidthPx,
        h: layouts[0]!.textHeightPx,
      },
      pad,
    );
    const r1 = inflate(
      {
        x: layouts[1]!.textTopLeftPx.x,
        y: layouts[1]!.textTopLeftPx.y,
        w: layouts[1]!.textWidthPx,
        h: layouts[1]!.textHeightPx,
      },
      pad,
    );
    expect(intersects(r0, r1)).toBe(false);
  });
});

describe("roofPlaneSlopeArrowLineScreenPx / computeArrowDrawableAabbPx", () => {
  it("линия — укороченный отрезок вдоль исходного AB", () => {
    const ln = roofPlaneSlopeArrowLineScreenPx(100, 200, 100, 400);
    // Экран Pixi: Y вниз; от (100,200) к (100,400) — наконечник у большего Y.
    expect(ln.y2).toBeGreaterThan(ln.y1);
    const bb = computeArrowDrawableAabbPx(100, 200, 100, 400);
    expect(bb.w).toBeGreaterThan(4);
    expect(bb.h).toBeGreaterThan(4);
  });
});

describe("estimateRoofLabelTextBlockPx", () => {
  it("оценка ширины растёт с длиной строки", () => {
    const a = estimateRoofLabelTextBlockPx("15°", "Скат 1", 11, 1.28);
    const b = estimateRoofLabelTextBlockPx("15°", "Скат 100", 11, 1.28);
    expect(b.w).toBeGreaterThanOrEqual(a.w);
  });
});
