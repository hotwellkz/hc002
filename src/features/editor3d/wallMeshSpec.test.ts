import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/core/domain/demoProject";
import { createEmptyProject } from "@/core/domain/projectFactory";

import { wallToMeshSpec, wallToRenderSpecs } from "./wallMeshSpec";

describe("wallToMeshSpec (упрощённый один меш)", () => {
  it("даёт валидный бокс для стены демо-проекта", () => {
    const p = createDemoProject();
    const w = p.walls[0];
    expect(w).toBeDefined();
    const spec = wallToMeshSpec(w!, p);
    expect(spec).not.toBeNull();
    expect(spec!.width).toBeGreaterThan(0);
    expect(spec!.height).toBeGreaterThan(0);
    expect(spec!.depth).toBeGreaterThan(0);
    expect(spec!.position[1]).toBeGreaterThan(0);
  });

  it("возвращает null при нулевой длине", () => {
    const p = createEmptyProject();
    const w = {
      id: "w0",
      layerId: p.activeLayerId,
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      thicknessMm: 100,
      heightMm: 2500,
      baseElevationMm: 0,
    };
    expect(wallToMeshSpec(w, p)).toBeNull();
  });
});

describe("wallToRenderSpecs (послойно)", () => {
  it("для SIP демо даёт 3 слоя при showProfileLayers=true", () => {
    const p = createDemoProject();
    const w = p.walls[0]!;
    const specs = wallToRenderSpecs(w, p, true);
    expect(specs.length).toBe(3);
    const sumMm = specs.reduce((acc, s) => acc + s.width / 0.001, 0);
    expect(sumMm).toBeCloseTo(w.thicknessMm, 3);
    expect(specs.map((s) => s.materialType)).toEqual(["osb", "eps", "osb"]);
  });

  it("при showProfileLayers=false — один меш", () => {
    const p = createDemoProject();
    const w = p.walls[0]!;
    const specs = wallToRenderSpecs(w, p, false);
    expect(specs.length).toBe(1);
    expect(specs[0]!.width).toBeCloseTo(w.thicknessMm * 0.001, 6);
  });
});
