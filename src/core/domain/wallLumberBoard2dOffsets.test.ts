import { describe, expect, it } from "vitest";

import { createDemoProject } from "./demoProject";
import { boardCoreNormalOffsetsMm } from "./wallLumberBoard2dOffsets";
import { buildWallCalculationForWall } from "./sipWallLayout";

describe("boardCoreNormalOffsetsMm", () => {
  it("SIP: полоса ядра между оболочками (не на всю толщину)", () => {
    const p = createDemoProject();
    const w = p.walls[0]!;
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(w, profile);
    const off = boardCoreNormalOffsetsMm(w, calc, p);
    expect(off.offEndMm - off.offStartMm).toBeLessThan(w.thicknessMm - 1);
  });

  it("листовой материал: сегменты расчёта на полную толщину стены", () => {
    const p = createDemoProject();
    const w = p.walls[0]!;
    const base = p.profiles[0]!;
    const sheetProfile = {
      ...base,
      wallManufacturing: { ...base.wallManufacturing, calculationModel: "sheet" as const },
    };
    const proj = { ...p, profiles: [sheetProfile] };
    const calc = buildWallCalculationForWall(w, sheetProfile);
    const off = boardCoreNormalOffsetsMm(w, calc, proj);
    expect(off.offStartMm).toBeCloseTo(-w.thicknessMm / 2, 4);
    expect(off.offEndMm).toBeCloseTo(w.thicknessMm / 2, 4);
  });
});
