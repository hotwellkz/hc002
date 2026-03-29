import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/core/domain/demoProject";

import { computeMarqueeSelection } from "./computeMarqueeSelection";

describe("computeMarqueeSelection", () => {
  it("находит стены, пересекающие прямоугольник", () => {
    const p = createDemoProject();
    const ids = computeMarqueeSelection(p, -1000, -1000, 9000, 9000);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => p.walls.some((w) => w.id === id) || p.openings.some((o) => o.id === id))).toBe(true);
  });
});
