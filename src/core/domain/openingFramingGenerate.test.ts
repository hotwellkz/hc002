import { describe, expect, it } from "vitest";

import type { Opening } from "./opening";
import type { Profile } from "./profile";
import { createEmptyProject, touchProjectMeta } from "./projectFactory";
import type { Wall } from "./wall";
import { generateOpeningFramingPieces, defaultOpeningSipConstruction } from "./openingFramingGenerate";

function testBoardProfile(id: string): Profile {
  return {
    id,
    name: "145×45 тест",
    category: "board",
    compositionMode: "layered",
    layers: [
      { id: `${id}-l0`, orderIndex: 0, materialName: "wood", materialType: "wood", thicknessMm: 45 },
    ],
  };
}

function minimalWall(id: string, layerId: string): Wall {
  return {
    id,
    layerId,
    start: { x: 0, y: 0 },
    end: { x: 8000, y: 0 },
    thicknessMm: 200,
    heightMm: 2800,
    profileId: undefined,
    baseElevationMm: 0,
  };
}

function win(id: string): Opening {
  return {
    id,
    wallId: "w1",
    kind: "window",
    offsetFromStartMm: 2000,
    widthMm: 1250,
    heightMm: 1300,
    formKey: "rectangle",
    isEmptyOpening: false,
    createdAt: "t",
    updatedAt: "t",
  };
}

describe("generateOpeningFramingPieces", () => {
  it("тип 1 — по одной вертикали с каждой стороны", () => {
    const base = createEmptyProject();
    const lid = base.activeLayerId;
    const brd = testBoardProfile("brd-test");
    const p = touchProjectMeta({
      ...base,
      profiles: [brd],
      walls: [minimalWall("w1", lid)],
      openings: [win("o1")],
    });
    const sip = { ...defaultOpeningSipConstruction(p.profiles), sideProfileId: brd.id };
    const pieces = generateOpeningFramingPieces(p.openings[0]!, "w1", sip, "ОК-1", p);
    const left = pieces.filter((x) => x.kind === "side_left");
    const right = pieces.filter((x) => x.kind === "side_right");
    expect(left.length).toBe(1);
    expect(right.length).toBe(1);
  });

  it("тип 3 — три сегмента на сторону", () => {
    const base = createEmptyProject();
    const lid = base.activeLayerId;
    const brd = testBoardProfile("brd-t3");
    const p = touchProjectMeta({
      ...base,
      profiles: [brd],
      walls: [minimalWall("w1", lid)],
      openings: [win("o1")],
    });
    const sip = {
      ...defaultOpeningSipConstruction(p.profiles),
      sideProfileId: brd.id,
      sideType: "type3" as const,
    };
    const pieces = generateOpeningFramingPieces(p.openings[0]!, "w1", sip, "ОК-2", p);
    expect(pieces.filter((x) => x.kind === "side_left").length).toBe(3);
    expect(pieces.filter((x) => x.kind === "side_right").length).toBe(3);
  });

  it("закрепляющие стойки — отдельные виды", () => {
    const base = createEmptyProject();
    const lid = base.activeLayerId;
    const brd = testBoardProfile("brd-fix");
    const p = touchProjectMeta({
      ...base,
      profiles: [brd],
      walls: [minimalWall("w1", lid)],
      openings: [win("o1")],
    });
    const sip = {
      ...defaultOpeningSipConstruction(p.profiles),
      sideProfileId: brd.id,
      sideClosingStuds: true,
    };
    const pieces = generateOpeningFramingPieces(p.openings[0]!, "w1", sip, "ОК-3", p);
    expect(pieces.some((x) => x.kind === "side_fix_left")).toBe(true);
    expect(pieces.some((x) => x.kind === "side_fix_right")).toBe(true);
    expect(pieces.find((x) => x.kind === "side_fix_left")?.markLabel).toMatch(/FIXL/);
  });
});
