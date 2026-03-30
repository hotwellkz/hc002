import { describe, expect, it } from "vitest";

import { createDemoProject } from "./demoProject";
import type { Opening } from "./opening";
import type { WallJoint } from "./wallJoint";
import {
  buildWallCalculationForWall,
  computePanelWidthsMm,
  SipWallLayoutError,
  splitLengthMm,
} from "./sipWallLayout";
import { buildSipPanelPieceMark } from "./wallCalculation";

describe("splitLengthMm", () => {
  it("делит длину > max на сбалансированные куски", () => {
    expect(splitLengthMm(9220, 6000)).toEqual([4610, 4610]);
  });
  it("одна деталь если укладывается", () => {
    expect(splitLengthMm(4000, 6000)).toEqual([4000]);
  });
  it("сумма чанков равна полной длине (обвязка по сегментам заготовки)", () => {
    for (const L of [1000, 8000, 8001, 12000]) {
      const chunks = splitLengthMm(L, 6000);
      const sum = chunks.reduce((a, b) => a + b, 0);
      expect(sum).toBe(L);
    }
  });
});

describe("computePanelWidthsMm", () => {
  it("одна панель на всю внутреннюю длину", () => {
    const w = computePanelWidthsMm(800, 1250, 250, 45);
    expect(w).toEqual([800]);
  });
  it("не даёт последней панели меньше min (перераспределение)", () => {
    const Tj = 45;
    const L = 1300;
    const w = computePanelWidthsMm(L, 1250, 250, Tj);
    expect(w.length).toBeGreaterThanOrEqual(1);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(250);
    const sumPanels = w.reduce((a, b) => a + b, 0);
    const joints = (w.length - 1) * Tj;
    expect(sumPanels + joints).toBe(L);
  });
  it("бросает на слишком короткой длине", () => {
    expect(() => computePanelWidthsMm(100, 1250, 250, 45)).toThrow(SipWallLayoutError);
  });
});

describe("buildWallCalculationForWall", () => {
  it("верхняя обвязка от 0 до L чанками без укорачивания под вертикальные доски", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(wall, profile);
    const L = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const uppers = calc.lumberPieces.filter((x) => x.role === "upper_plate");
    expect(uppers.length).toBeGreaterThan(0);
    expect(uppers[0]!.pieceMark).toMatch(/-TB-/);
    const lowers = calc.lumberPieces.filter((x) => x.role === "lower_plate");
    expect(lowers[0]!.pieceMark).toMatch(/-BB-/);
    expect(uppers[0]!.startOffsetMm).toBe(0);
    expect(uppers[uppers.length - 1]!.endOffsetMm).toBeCloseTo(L, 2);
  });

  it("длина вертикальных досок (JB/EB) = высота стены минус верхняя и нижняя обвязка", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const m = profile.wallManufacturing?.plateBoardThicknessMm ?? 45;
    const expected = Math.max(0, Math.round(wall.heightMm - m - m));
    const calc = buildWallCalculationForWall(wall, profile);
    for (const piece of calc.lumberPieces) {
      if (piece.role === "joint_board" || piece.role === "edge_board") {
        expect(piece.lengthMm).toBe(expected);
      }
    }
  });

  it("проём вырезает SIP-зоны и добавляет обрамление", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const opening: Opening = {
      id: "o-test",
      wallId: wall.id,
      kind: "window",
      offsetFromStartMm: 2000,
      widthMm: 1200,
      heightMm: 1500,
      sillHeightMm: 900,
    };
    const calc = buildWallCalculationForWall(wall, profile, {
      openings: [opening],
      wallJoints: [],
      options: { includeOpeningFraming: true, includeWallConnectionElements: false },
    });
    const o0 = opening.offsetFromStartMm!;
    const o1 = o0 + opening.widthMm;
    for (const r of calc.sipRegions) {
      const overlaps = r.startOffsetMm < o1 - 1e-3 && r.endOffsetMm > o0 + 1e-3;
      expect(overlaps).toBe(false);
      expect(r.pieceMark).toBe(buildSipPanelPieceMark(wall.markLabel ?? "", r.index));
    }
    expect(calc.lumberPieces.some((x) => x.role === "opening_left_stud")).toBe(true);
    expect(calc.lumberPieces.some((x) => x.role === "opening_header")).toBe(true);
    expect(calc.lumberPieces.some((x) => x.role === "opening_sill")).toBe(true);
  });

  it("Т-узел на основной стене добавляет tee_joint_board", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const tee: WallJoint = {
      id: "tj1",
      kind: "T_ABUTMENT",
      wallAId: "other",
      wallAEnd: "start",
      wallBId: wall.id,
      teePointOnMainMm: {
        x: (wall.start.x + wall.end.x) / 2,
        y: (wall.start.y + wall.end.y) / 2,
      },
    };
    const calc = buildWallCalculationForWall(wall, profile, {
      openings: [],
      wallJoints: [tee],
      options: { includeOpeningFraming: false, includeWallConnectionElements: true },
    });
    expect(calc.lumberPieces.some((x) => x.role === "tee_joint_board")).toBe(true);
  });
});
