import { describe, expect, it } from "vitest";

import { createDemoProject } from "./demoProject";
import type { Opening } from "./opening";
import type { WallJoint } from "./wallJoint";
import {
  buildWallCalculationForWall,
  calculateSipPanelLayoutOnWall,
  collectGkLFrameStudCentersFromSheetRegionsMm,
  computeSipPanelWidthsOpeningAdjacentMm,
  computeSipPanelWidthsSolidMm,
  SipWallLayoutError,
  splitLengthMm,
} from "./sipWallLayout";
import { buildSipPanelPieceMark } from "./wallCalculation";
import { newEntityId } from "./ids";
import type { Profile } from "./profile";

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

  it("ГКЛ/каркас + дверь (frame_gkl_door): полноразмерные стойки, без сегмента «top», без стойки в световом проёме", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, end: { x: 5000, y: 0 }, heightMm: 2500 };
    const plateT = 80;
    const gklProfile = {
      ...p.profiles[0]!,
      id: newEntityId(),
      name: "ГКЛ100",
      defaultWidthMm: 1200,
      compositionMode: "layered" as const,
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
        { id: newEntityId(), orderIndex: 1, materialName: "ПС", materialType: "steel" as const, thicknessMm: plateT },
        { id: newEntityId(), orderIndex: 2, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
      ],
      wallManufacturing: {
        calculationModel: "frame" as const,
        studSpacingMm: 600,
        frameMaterial: "wood" as const,
        doorOpeningFramingPreset: "frame_gkl_door" as const,
        plateBoardThicknessMm: plateT,
        jointBoardThicknessMm: plateT,
      },
    } satisfies Profile;
    const door: Opening = {
      id: "door-gkl",
      wallId: wall.id,
      kind: "door",
      offsetFromStartMm: 2000,
      widthMm: 900,
      heightMm: 2100,
    };
    const calc = buildWallCalculationForWall(wall, gklProfile, {
      openings: [door],
      wallJoints: [],
      options: { includeOpeningFraming: true, includeWallConnectionElements: false },
    });
    const tops = calc.lumberPieces.filter(
      (x) =>
        (x.role === "opening_left_stud" || x.role === "opening_right_stud") &&
        (x.metadata as { studSegment?: string })?.studSegment === "top",
    );
    expect(tops.length).toBe(0);
    const fulls = calc.lumberPieces.filter(
      (x) =>
        (x.role === "opening_left_stud" || x.role === "opening_right_stud") &&
        (x.metadata as { studSegment?: string })?.studSegment === "full",
    );
    expect(fulls.length).toBe(2);
    for (const s of fulls) {
      expect(s.lengthMm).toBe(wall.heightMm);
    }
    const clearLo = door.offsetFromStartMm!;
    const clearHi = door.offsetFromStartMm! + door.widthMm;
    const intruders = calc.lumberPieces.filter((x) => {
      if (x.role !== "framing_member_generic" || x.orientation !== "across_wall") {
        return false;
      }
      const lo = Math.min(x.startOffsetMm, x.endOffsetMm);
      const hi = Math.max(x.startOffsetMm, x.endOffsetMm);
      const interLo = Math.max(lo, clearLo);
      const interHi = Math.min(hi, clearHi);
      return interHi - interLo > 1;
    });
    expect(intruders.length).toBe(0);
    const header = calc.lumberPieces.find((x) => x.role === "opening_header");
    expect(header).toBeTruthy();
    const lintelInto = Math.min(plateT, 50);
    expect(Math.round(header!.endOffsetMm - header!.startOffsetMm)).toBe(
      Math.round(clearHi - clearLo + 2 * lintelInto),
    );
    const leftJ = calc.lumberPieces.find((x) => x.role === "opening_left_stud");
    expect(leftJ).toBeTruthy();
    expect(Math.min(leftJ!.startOffsetMm, leftJ!.endOffsetMm)).toBe(door.offsetFromStartMm! - plateT);
    expect(Math.max(leftJ!.startOffsetMm, leftJ!.endOffsetMm)).toBe(door.offsetFromStartMm!);
  });

  it("сталь ГКЛ: дверь 1000×2100 — стойки 75×50, направляющие/перемычка 75×40, криплы как стойки 75×50, без SIP-сегментов", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, end: { x: 6000, y: 0 }, heightMm: 2500 };
    const T = 80;
    const gklProfile = {
      ...p.profiles[0]!,
      id: newEntityId(),
      name: "ГКЛ_1",
      defaultWidthMm: 1200,
      compositionMode: "layered" as const,
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
        { id: newEntityId(), orderIndex: 1, materialName: "ПС", materialType: "steel" as const, thicknessMm: T },
        { id: newEntityId(), orderIndex: 2, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
      ],
      wallManufacturing: {
        calculationModel: "frame" as const,
        frameMemberWidthMm: T,
        studSpacingMm: 600,
        frameMaterial: "steel" as const,
        doorOpeningFramingPreset: "sip_standard" as const,
        plateBoardThicknessMm: T,
        jointBoardThicknessMm: T,
      },
    } satisfies Profile;
    const door: Opening = {
      id: "door-1k",
      wallId: wall.id,
      kind: "door",
      offsetFromStartMm: 2200,
      widthMm: 1000,
      heightMm: 2100,
    };
    const calc = buildWallCalculationForWall(wall, gklProfile, {
      openings: [door],
      wallJoints: [],
      options: { includeOpeningFraming: true, includeWallConnectionElements: false },
    });
    const trackD = 40;
    const studAlong = 50;
    const jambs = calc.lumberPieces.filter(
      (x) =>
        (x.role === "opening_left_stud" || x.role === "opening_right_stud") &&
        (x.metadata as { studSegment?: string })?.studSegment === "full",
    );
    expect(jambs.length).toBe(2);
    expect(jambs.every((j) => Math.round(j.lengthMm) === wall.heightMm)).toBe(true);
    expect(jambs.every((j) => j.sectionThicknessMm === studAlong && j.sectionDepthMm === 75)).toBe(true);
    const crips = calc.lumberPieces.filter((x) => x.role === "opening_cripple");
    expect(crips.length).toBe(2);
    expect(crips.every((c) => c.sectionThicknessMm === studAlong && c.sectionDepthMm === 75)).toBe(true);
    expect(crips.every((c) => Math.round(c.lengthMm) === Math.round(wall.heightMm - door.heightMm))).toBe(true);
    const hdr = calc.lumberPieces.find((x) => x.role === "opening_header");
    expect(hdr).toBeTruthy();
    expect(Math.round(hdr!.endOffsetMm - hdr!.startOffsetMm)).toBe(1100);
    expect(hdr!.sectionThicknessMm).toBe(trackD);
    expect(hdr!.sectionDepthMm).toBe(75);
    const topPlate = calc.lumberPieces.find((x) => x.role === "upper_plate");
    expect(topPlate?.sectionThicknessMm).toBe(trackD);
    expect(topPlate?.sectionDepthMm).toBe(75);
  });

  it("ГКЛ металл: стена 2848, дверь 1000×2100 — перемычка 1100 мм, левый нижний рельс = roughLo", () => {
    const p = createDemoProject();
    const L = 2848;
    const clearLeft = 1521;
    const wall = { ...p.walls[0]!, end: { x: L, y: 0 }, heightMm: 2500 };
    const T = 80;
    const gklProfile = {
      ...p.profiles[0]!,
      id: newEntityId(),
      name: "ГКЛ_1",
      defaultWidthMm: 1200,
      compositionMode: "layered" as const,
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
        { id: newEntityId(), orderIndex: 1, materialName: "ПС", materialType: "steel" as const, thicknessMm: T },
        { id: newEntityId(), orderIndex: 2, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
      ],
      wallManufacturing: {
        calculationModel: "frame" as const,
        frameMemberWidthMm: T,
        studSpacingMm: 600,
        frameMaterial: "steel" as const,
        doorOpeningFramingPreset: "sip_standard" as const,
        plateBoardThicknessMm: T,
        jointBoardThicknessMm: T,
      },
    } satisfies Profile;
    const door: Opening = {
      id: "door-2848",
      wallId: wall.id,
      kind: "door",
      offsetFromStartMm: clearLeft,
      widthMm: 1000,
      heightMm: 2100,
    };
    const calc = buildWallCalculationForWall(wall, gklProfile, {
      openings: [door],
      wallJoints: [],
      options: { includeOpeningFraming: true, includeWallConnectionElements: false },
    });
    const studAlong = 50;
    const roughLo = clearLeft - studAlong;
    const hdr = calc.lumberPieces.find((x) => x.role === "opening_header");
    expect(hdr).toBeTruthy();
    expect(Math.round(hdr!.endOffsetMm - hdr!.startOffsetMm)).toBe(1100);
    const lowers = calc.lumberPieces
      .filter((x) => x.role === "lower_plate")
      .sort((a, b) => a.startOffsetMm - b.startOffsetMm);
    const leftLower = lowers.find((x) => Math.round(x.startOffsetMm) <= 0);
    expect(leftLower).toBeTruthy();
    expect(Math.round(leftLower!.lengthMm)).toBe(Math.round(roughLo));
  });

  it("ГКЛ frame_gkl_door: у двери один ряд framing_member_generic у rough, листы без модуля 1250", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, end: { x: 5000, y: 0 }, heightMm: 2500 };
    const gklProfile = {
      ...p.profiles[0]!,
      id: newEntityId(),
      name: "ГКЛ1200",
      defaultWidthMm: 1200,
      defaultHeightMm: 2500,
      compositionMode: "layered" as const,
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
        { id: newEntityId(), orderIndex: 1, materialName: "Каркас", materialType: "steel" as const, thicknessMm: 76 },
        { id: newEntityId(), orderIndex: 2, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
      ],
      wallManufacturing: {
        calculationModel: "frame" as const,
        studSpacingMm: 400,
        frameMaterial: "steel" as const,
      },
    } satisfies Profile;
    const door: Opening = {
      id: "d-gkl-5k",
      wallId: wall.id,
      kind: "door",
      offsetFromStartMm: 2000,
      widthMm: 1000,
      heightMm: 2100,
    };
    const calc = buildWallCalculationForWall(wall, gklProfile, {
      openings: [door],
      wallJoints: [],
      options: { includeOpeningFraming: true, includeWallConnectionElements: false },
    });
    const Tj = calc.settingsSnapshot.jointBoardThicknessMm;
    const clearLeft = door.offsetFromStartMm!;
    const clearRight = clearLeft + door.widthMm;
    const roughLo = clearLeft - Tj;
    const roughHi = clearRight + Tj;
    const genericsInJambStrip = calc.lumberPieces.filter((x) => {
      if (x.role !== "framing_member_generic" || x.orientation !== "across_wall") {
        return false;
      }
      const lo = Math.min(x.startOffsetMm, x.endOffsetMm);
      const hi = Math.max(x.startOffsetMm, x.endOffsetMm);
      const cx = (lo + hi) / 2;
      return (cx >= roughLo - 0.6 && cx <= clearLeft + 0.6) || (cx >= clearRight - 0.6 && cx <= roughHi + 0.6);
    });
    expect(genericsInJambStrip).toHaveLength(0);
    const sheetW = calc.sipRegions.map((r) => Math.round(r.widthMm));
    expect(sheetW).not.toContain(1250);
    expect(sheetW.filter((w) => w >= 1199).every((w) => w === 1200)).toBe(true);
    expect(calc.settingsSnapshot.panelNominalWidthMm).toBe(1200);
  });

  it("ГКЛ: центры стоек — шаг от левого края каждого листа, стык листа в наборе", () => {
    expect(
      collectGkLFrameStudCentersFromSheetRegionsMm(
        [
          { startOffsetMm: 0, endOffsetMm: 1200 },
          { startOffsetMm: 1200, endOffsetMm: 2400 },
        ],
        400,
      ),
    ).toEqual([0, 400, 800, 1200, 1600, 2000, 2400]);
    expect(
      collectGkLFrameStudCentersFromSheetRegionsMm([{ startOffsetMm: 0, endOffsetMm: 1200 }], 600),
    ).toEqual([0, 600, 1200]);
  });

  it("ГКЛ: остаточный лист без внутренней стойки, если хвост до края < шага (1200+1200+448, шаг 400)", () => {
    expect(
      collectGkLFrameStudCentersFromSheetRegionsMm(
        [
          { startOffsetMm: 0, endOffsetMm: 1200 },
          { startOffsetMm: 1200, endOffsetMm: 2400 },
          { startOffsetMm: 2400, endOffsetMm: 2848 },
        ],
        400,
      ),
    ).toEqual([0, 400, 800, 1200, 1600, 2000, 2400, 2848]);
    expect(
      collectGkLFrameStudCentersFromSheetRegionsMm([{ startOffsetMm: 2400, endOffsetMm: 2848 }], 400).includes(2800),
    ).toBe(false);
  });

  it("ГКЛ стена 2848 мм, шаг 400: в доборе 448 мм нет внутренней стойки на 2800 (интеграция)", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, end: { x: 2848, y: 0 } };
    const gklProfile = {
      ...p.profiles[0]!,
      id: newEntityId(),
      name: "ГКЛ100",
      defaultWidthMm: 1200,
      defaultHeightMm: 2500,
      compositionMode: "layered" as const,
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
        { id: newEntityId(), orderIndex: 1, materialName: "Каркас", materialType: "steel" as const, thicknessMm: 76 },
        { id: newEntityId(), orderIndex: 2, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
      ],
      wallManufacturing: {
        calculationModel: "frame" as const,
        studSpacingMm: 400,
        frameMaterial: "steel" as const,
      },
    } satisfies Profile;
    const calc = buildWallCalculationForWall(wall, gklProfile, {
      openings: [],
      wallJoints: [],
      options: { includeOpeningFraming: false, includeWallConnectionElements: false },
    });
    expect(calc.sipRegions.map((r) => Math.round(r.widthMm))).toEqual([1200, 1200, 448]);
    const genericCenters = calc.lumberPieces
      .filter((x) => x.role === "framing_member_generic")
      .map((x) => Math.round((x.startOffsetMm + x.endOffsetMm) / 2));
    expect(genericCenters).not.toContain(2800);
  });

  it("ГКЛ/каркас: листы по defaultWidthMm (1200), не по устаревшему panelNominalWidthMm 1250 из merge", () => {
    const p = createDemoProject();
    const wall = { ...p.walls[0]!, end: { x: 2846, y: 0 } };
    const gklProfile = {
      ...p.profiles[0]!,
      id: newEntityId(),
      name: "ГКЛ100",
      defaultWidthMm: 1200,
      defaultHeightMm: 2500,
      compositionMode: "layered" as const,
      layers: [
        { id: newEntityId(), orderIndex: 0, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
        { id: newEntityId(), orderIndex: 1, materialName: "Каркас", materialType: "steel" as const, thicknessMm: 76 },
        { id: newEntityId(), orderIndex: 2, materialName: "ГКЛ", materialType: "gypsum" as const, thicknessMm: 12 },
      ],
      wallManufacturing: {
        calculationModel: "frame" as const,
        panelNominalWidthMm: 1250,
        studSpacingMm: 400,
        frameMaterial: "steel" as const,
      },
    } satisfies Profile;
    const calc = buildWallCalculationForWall(wall, gklProfile);
    const widths = calc.sipRegions.map((r) => Math.round(r.widthMm));
    expect(widths).toEqual([1200, 1200, 446]);
    expect(calc.settingsSnapshot.panelNominalWidthMm).toBe(1200);
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
