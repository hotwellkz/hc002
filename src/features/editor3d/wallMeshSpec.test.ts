import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/core/domain/demoProject";
import { createEmptyProject } from "@/core/domain/projectFactory";
import { buildWallCalculationForWall } from "@/core/domain/sipWallLayout";

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
    /** Без проёмов — по одному сегменту на слой (иначе грань режется на части). */
    const p0 = { ...p, openings: [] };
    const specs = wallToRenderSpecs(w, p0, true);
    expect(specs.length).toBe(3);
    const sumMm = specs.reduce((acc, s) => acc + s.width / 0.001, 0);
    expect(sumMm).toBeCloseTo(w.thicknessMm, 3);
    expect(specs.map((s) => s.materialType)).toEqual(["osb", "eps", "osb"]);
  });

  it("при showProfileLayers=false — один меш", () => {
    const p = createDemoProject();
    const w = p.walls[0]!;
    const p0 = { ...p, openings: [] };
    const specs = wallToRenderSpecs(w, p0, false);
    expect(specs.length).toBe(1);
    expect(specs[0]!.width).toBeCloseTo(w.thicknessMm * 0.001, 6);
  });

  it("листовый материал (sheet): один меш оболочки без EPS (не послойный SIP-сэндвич)", () => {
    const p = createDemoProject();
    const w = p.walls[0]!;
    const profile = {
      ...p.profiles[0]!,
      wallManufacturing: { ...p.profiles[0]!.wallManufacturing, calculationModel: "sheet" as const },
    };
    /** Без проёмов — по одному сегменту на слой (как в тесте SIP выше). */
    const proj = {
      ...p,
      openings: [],
      profiles: [profile],
      walls: p.walls.map((x) => (x.id === w.id ? { ...x } : x)),
    };
    const specs = wallToRenderSpecs(w, proj, true);
    expect(specs.some((s) => s.materialType === "eps")).toBe(false);
    expect(specs.length).toBeGreaterThanOrEqual(1);
    expect(specs.every((s) => s.materialType === "osb")).toBe(true);
    const sumMm = specs.reduce((acc, s) => acc + s.width / 0.001, 0);
    expect(sumMm).toBeCloseTo(w.thicknessMm, 3);
  });

  it("при сохранённом расчёте стены и show3dCalculation не показывает непрерывный EPS слой оболочки", () => {
    const p = createDemoProject();
    const w = p.walls[0]!;
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(w, profile);
    const proj = {
      ...p,
      openings: [],
      wallCalculations: [calc],
      viewState: { ...p.viewState, show3dCalculation: true },
    };
    const specs = wallToRenderSpecs(w, proj, true);
    expect(specs.some((s) => s.materialType === "eps")).toBe(false);
    expect(specs.filter((s) => s.materialType === "osb").length).toBe(2);
  });
});
