import { describe, expect, it } from "vitest";

import { snapWorldToGridAlignedToOrigin, worldMmToPlanMm } from "./projectOriginPlan";

describe("snapWorldToGridAlignedToOrigin", () => {
  it("смещает сетку относительно базы", () => {
    const o = { x: 50, y: 30 };
    const p = snapWorldToGridAlignedToOrigin({ x: 144, y: 88 }, 100, o);
    expect(p.x).toBe(150);
    expect(p.y).toBe(130);
  });

  it("при null-базе ведёт себя как раньше", () => {
    const p = snapWorldToGridAlignedToOrigin({ x: 144, y: 88 }, 100, null);
    expect(p.x).toBe(100);
    expect(p.y).toBe(100);
  });
});

describe("worldMmToPlanMm", () => {
  it("вычитает базу", () => {
    expect(worldMmToPlanMm({ x: 1000, y: 500 }, { projectOrigin: { x: 200, y: 100 } })).toEqual({
      x: 800,
      y: 400,
    });
  });
});
