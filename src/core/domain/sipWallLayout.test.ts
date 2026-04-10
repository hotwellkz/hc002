import { describe, expect, it } from "vitest";

import { createDemoProject } from "./demoProject";
import type { Opening } from "./opening";
import type { WallJoint } from "./wallJoint";
import {
  buildWallCalculationForWall,
  calculateSipPanelLayoutOnWall,
  computeSipPanelWidthsOpeningAdjacentMm,
  computeSipPanelWidthsSolidMm,
  SipWallLayoutError,
  splitLengthMm,
} from "./sipWallLayout";
import { buildSipPanelPieceMark } from "./wallCalculation";

describe("splitLengthMm", () => {
  it("если длина меньше стандарта — один кусок", () => {
    expect(splitLengthMm(5800, 6000)).toEqual([5800]);
  });
  it("если длина равна стандарту — один кусок", () => {
    expect(splitLengthMm(6000, 6000)).toEqual([6000]);
  });
  it("режет по 6000 + остаток", () => {
    expect(splitLengthMm(6263, 6000)).toEqual([6000, 263]);
  });
  it("малый остаток перераспределяет между двумя последними", () => {
    expect(splitLengthMm(6050, 6000)).toEqual([5950, 100]);
  });
  it("малый остаток при нескольких полных заготовках", () => {
    expect(splitLengthMm(12050, 6000)).toEqual([6000, 5950, 100]);
  });
  it("сумма чанков равна полной длине (обвязка по сегментам заготовки)", () => {
    for (const L of [1000, 6000, 6263, 6050, 8001, 12000, 12050]) {
      const chunks = splitLengthMm(L, 6000);
      const sum = chunks.reduce((a, b) => a + b, 0);
      expect(sum).toBe(L);
    }
  });
});

describe("computeSipPanelWidthsSolidMm / calculateSipPanelLayoutOnWall", () => {
  it("5295 => четыре полных 1250 и добор 295", () => {
    const w = computeSipPanelWidthsSolidMm(5295, 1250, 250);
    expect(w).toEqual([1250, 1250, 1250, 1250, 295]);
    expect(calculateSipPanelLayoutOnWall(5295, 1250, 250)).toEqual(w);
  });
  it("5000 => четыре панели по 1250", () => {
    expect(computeSipPanelWidthsSolidMm(5000, 1250, 250)).toEqual([1250, 1250, 1250, 1250]);
  });
  it("6250 => ровно пять панелей по 1250", () => {
    expect(computeSipPanelWidthsSolidMm(6250, 1250, 250)).toEqual([1250, 1250, 1250, 1250, 1250]);
  });
  it("6363 => четыре целых + 1113 + 250 (не два симметричных нестандарта)", () => {
    expect(computeSipPanelWidthsSolidMm(6363, 1250, 250)).toEqual([1250, 1250, 1250, 1250, 1113, 250]);
  });
  it("6100 => без кусков меньше 250", () => {
    const w = computeSipPanelWidthsSolidMm(6100, 1250, 250);
    expect(w.every((x) => x >= 250)).toBe(true);
    expect(w.reduce((a, b) => a + b, 0)).toBe(6100);
  });
  it("одна панель на коротком участке", () => {
    expect(computeSipPanelWidthsSolidMm(800, 1250, 250)).toEqual([800]);
  });
  it("остаток < min: MIN + широкий добор (1300 => 1050 + 250)", () => {
    const w = computeSipPanelWidthsSolidMm(1300, 1250, 250);
    expect(w).toEqual([1050, 250]);
    expect(w.reduce((a, b) => a + b, 0)).toBe(1300);
  });
  it("бросает на слишком короткой длине", () => {
    expect(() => computeSipPanelWidthsSolidMm(100, 1250, 250)).toThrow(SipWallLayoutError);
  });
});

describe("computeSipPanelWidthsOpeningAdjacentMm", () => {
  it("допускает последний кусок < 250 у проёма", () => {
    const w = computeSipPanelWidthsOpeningAdjacentMm(6363, 1250);
    expect(w).toEqual([1250, 1250, 1250, 1250, 1250, 113]);
    expect(w[w.length - 1]).toBeLessThan(250);
  });
});

describe("buildWallCalculationForWall", () => {
  it("SIP-панели начинаются с края стены (0) и идут модулями 1250 + добор только последней", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, end: { x: 5295, y: 0 } };
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(wall, profile);
    const widths = calc.sipRegions.map((r) => Math.round(r.widthMm));
    expect(calc.sipRegions[0]!.startOffsetMm).toBe(0);
    expect(widths).toEqual([1250, 1250, 1250, 1250, 295]);
  });

  it("глухая стена 6363: раскладка 1250×4 + 1113 + 250", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, end: { x: 6363, y: 0 } };
    const profile = p.profiles[0]!;
    const calc = buildWallCalculationForWall(wall, profile);
    const widths = calc.sipRegions.map((r) => Math.round(r.widthMm));
    expect(widths).toEqual([1250, 1250, 1250, 1250, 1113, 250]);
  });

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

  it("дверной проём: боковые стойки на нижней обвязке — длина heightMm − plate, над проёмом +plate к верху ядра", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, heightMm: 2500 };
    const profile = p.profiles[0]!;
    const plateT = profile.wallManufacturing?.plateBoardThicknessMm ?? 45;
    const vCore = wall.heightMm - 2 * plateT;
    const door: Opening = {
      id: "o-door",
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
    const middles = calc.lumberPieces.filter(
      (x) =>
        (x.role === "opening_left_stud" || x.role === "opening_right_stud") &&
        (x.metadata as { studSegment?: string })?.studSegment === "middle",
    );
    expect(middles.length).toBeGreaterThan(0);
    for (const m of middles) {
      expect(m.lengthMm).toBe(Math.round(door.heightMm - plateT));
    }
    const tops = calc.lumberPieces.filter(
      (x) =>
        (x.role === "opening_left_stud" || x.role === "opening_right_stud") &&
        (x.metadata as { studSegment?: string })?.studSegment === "top",
    );
    expect(tops.length).toBeGreaterThan(0);
    const expectedTopLen = Math.round(vCore - door.heightMm);
    for (const t of tops) {
      expect(t.lengthMm).toBe(expectedTopLen);
    }
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

  it("для окна узкий остаток у края (<250) не блокирует расчёт", () => {
    const p = createDemoProject();
    const wall = p.walls[0]!;
    const profile = p.profiles[0]!;
    const opening: Opening = {
      id: "o-edge-window",
      wallId: wall.id,
      kind: "window",
      offsetFromStartMm: 120,
      widthMm: 1200,
      heightMm: 1300,
      sillHeightMm: 900,
    };
    expect(() =>
      buildWallCalculationForWall(wall, profile, {
        openings: [opening],
        wallJoints: [],
        options: { includeOpeningFraming: true, includeWallConnectionElements: true },
      }),
    ).not.toThrow();
  });
});
