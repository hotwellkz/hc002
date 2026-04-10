import { describe, expect, it } from "vitest";

import { createDemoProject } from "./demoProject";
import type { Opening } from "./opening";
import { buildWallCalculationForWall } from "./sipWallLayout";
import {
  buildCalculationSolidSpecsForProject,
  buildCalculationSolidSpecsForWall,
  CALCULATION_SOLID_MIN_EXTENT_M,
  lumberPieceWallElevationRectMm,
} from "./wallCalculation3dSpecs";
import { buildSipSeamVerticalLineSegmentsForProject } from "./sipSeamLines3d";

describe("wallCalculation3dSpecs", () => {
  it("строит SIP и пиломатериал для стены с расчётом", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(wall, profile);
    const proj = { ...p, wallCalculations: [calc] };
    const specs = buildCalculationSolidSpecsForWall(wall, proj, calc);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.some((s) => s.source === "sip")).toBe(true);
    expect(specs.some((s) => s.source === "lumber")).toBe(true);
  });

  it("buildCalculationSolidSpecsForProject агрегирует по всем стенам с расчётом", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(wall, profile);
    const proj = { ...p, wallCalculations: [calc] };
    const all = buildCalculationSolidSpecsForProject(proj);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((s) => s.source === "lumber")).toBe(true);
    for (const s of all) {
      if (s.source === "sip" || s.source === "lumber") {
        expect(Math.min(s.width, s.height, s.depth)).toBeGreaterThan(CALCULATION_SOLID_MIN_EXTENT_M);
      }
    }
  });

  it("даёт вертикальные линии стыков SIP на фасаде между соседними панелями (стык joint_board)", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(wall, profile);
    const proj = { ...p, wallCalculations: [calc] };
    const lines = buildSipSeamVerticalLineSegmentsForProject(proj);
    if (calc.sipRegions.length >= 2) {
      expect(lines.length).toBeGreaterThan(0);
      const forWall = lines.filter((l) => l.wallId === wall.id);
      expect(forWall.length).toBeGreaterThan(0);
    }
  });

  it("строит EPS вплотную к граням центрированной joint_board на прямом стыке", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(wall, profile, {
      openings: [],
      wallJoints: [],
      options: { includeOpeningFraming: false, includeWallConnectionElements: false },
    });
    const proj = { ...p, openings: [], wallCalculations: [calc] };
    const specs = buildCalculationSolidSpecsForWall(wall, proj, calc);
    const eps = specs.filter((s) => s.source === "sip");
    const jb = calc.lumberPieces.find((x) => x.role === "joint_board");
    expect(jb).toBeTruthy();
    const boardThickness = jb!.sectionThicknessMm;
    const boardLeftFace = jb!.startOffsetMm - boardThickness / 2;
    const boardRightFace = jb!.endOffsetMm - boardThickness / 2;
    const seamCenter = (boardLeftFace + boardRightFace) / 2;
    const epsAlong = eps.map((s) => {
      const cMm = s.position[0] / 0.001;
      const dMm = s.depth / 0.001;
      return { start: cMm - dMm / 2, end: cMm + dMm / 2 };
    });
    const leftEnd = Math.max(...epsAlong.filter((r) => r.end <= seamCenter + 1).map((r) => r.end));
    const rightStart = Math.min(...epsAlong.filter((r) => r.start >= seamCenter - 1).map((r) => r.start));
    expect(leftEnd).toBeCloseTo(boardLeftFace, 3);
    expect(rightStart).toBeCloseTo(boardRightFace, 3);
  });

  it("сохраняет ту же логику EPS у центрированной joint_board рядом с окном", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const opening: Opening = {
      id: "eps-joint-window-case",
      wallId: wall.id,
      kind: "window",
      offsetFromStartMm: 3000,
      widthMm: 1200,
      heightMm: 1400,
      sillHeightMm: 900,
    };
    const calc = buildWallCalculationForWall(wall, profile, {
      openings: [opening],
      wallJoints: [],
      options: { includeOpeningFraming: true, includeWallConnectionElements: false },
    });
    const proj = { ...p, openings: [opening], wallCalculations: [calc] };
    const specs = buildCalculationSolidSpecsForWall(wall, proj, calc);
    const eps = specs.filter((s) => s.source === "sip");
    const jb = calc.lumberPieces.find((x) => x.role === "joint_board" && x.endOffsetMm < opening.offsetFromStartMm!);
    expect(jb).toBeTruthy();
    const boardThickness = jb!.sectionThicknessMm;
    const boardLeftFace = jb!.startOffsetMm - boardThickness / 2;
    const boardRightFace = jb!.endOffsetMm - boardThickness / 2;
    const seamCenter = (boardLeftFace + boardRightFace) / 2;
    const epsAlong = eps
      .filter((s) => s.height > 0.2)
      .map((s) => {
        const cMm = s.position[0] / 0.001;
        const dMm = s.depth / 0.001;
        return { start: cMm - dMm / 2, end: cMm + dMm / 2 };
      });
    const leftEnd = Math.max(...epsAlong.filter((r) => r.end <= seamCenter + 1).map((r) => r.end));
    const rightStart = Math.min(...epsAlong.filter((r) => r.start >= seamCenter - 1).map((r) => r.start));
    expect(leftEnd).toBeCloseTo(boardLeftFace, 3);
    expect(rightStart).toBeCloseTo(boardRightFace, 3);
  });

  it("дверь: короткие стойки над проёмом на фасаде упираются в нижнюю плоскость верхней обвязки", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, heightMm: 2500 };
    const profile = p.profiles[0]!;
    const plateT = profile.wallManufacturing?.plateBoardThicknessMm ?? 45;
    const door: Opening = {
      id: "o-door-elev",
      wallId: wall.id,
      kind: "door",
      offsetFromStartMm: 1500,
      widthMm: 1000,
      heightMm: 2100,
    };
    const calc = buildWallCalculationForWall(wall, profile, {
      openings: [door],
      wallJoints: [],
      options: { includeOpeningFraming: true, includeWallConnectionElements: false },
    });
    const proj = { ...p, openings: [door], wallCalculations: [calc] };
    const vCore = wall.heightMm - 2 * plateT;
    const expectedTopLen = Math.round(wall.heightMm - plateT - door.heightMm - plateT);
    expect(expectedTopLen).toBe(Math.round(vCore - door.heightMm));
    const tops = calc.lumberPieces.filter(
      (x) =>
        (x.role === "opening_left_stud" || x.role === "opening_right_stud") &&
        (x.metadata as { studSegment?: string })?.studSegment === "top",
    );
    expect(tops.length).toBeGreaterThan(0);
    const bottomUpperPlateFromBase = wall.heightMm - plateT;
    for (const t of tops) {
      expect(t.lengthMm).toBe(expectedTopLen);
      const rr = lumberPieceWallElevationRectMm(t, wall, proj, calc);
      expect(rr.b0).toBeCloseTo(door.heightMm + plateT, 3);
      expect(rr.b1).toBeCloseTo(bottomUpperPlateFromBase, 3);
    }
  });
});
