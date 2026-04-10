import { describe, expect, it } from "vitest";

import {
  filterFramingStudsClearOfDoorOpenings,
  removeGkLFramingStudsOverlappingDoorJambs,
} from "./frameWallOpeningLayout";
import type { LumberPieceDraftInput } from "./wallCalculationNormalize";

describe("filterFramingStudsClearOfDoorOpenings", () => {
  it("удаляет framing_member_generic, пересекающий световой проём между внутренними гранями стоек", () => {
    const Tj = 80;
    const door = { id: "d1", wallId: "w1", kind: "door" as const, offsetFromStartMm: 2000, widthMm: 900, heightMm: 2100 };
    const drafts: LumberPieceDraftInput[] = [
      {
        id: "keep-edge",
        wallId: "w1",
        calculationId: "c",
        role: "framing_member_generic",
        sectionThicknessMm: Tj,
        sectionDepthMm: Tj,
        startOffsetMm: 0,
        endOffsetMm: Tj,
        lengthMm: 2400,
        orientation: "across_wall",
      },
      {
        id: "remove-inside",
        wallId: "w1",
        calculationId: "c",
        role: "framing_member_generic",
        sectionThicknessMm: Tj,
        sectionDepthMm: Tj,
        startOffsetMm: 2300 - Tj / 2,
        endOffsetMm: 2300 + Tj / 2,
        lengthMm: 2400,
        orientation: "across_wall",
      },
      {
        id: "keep-joint",
        wallId: "w1",
        calculationId: "c",
        role: "joint_board",
        sectionThicknessMm: 45,
        sectionDepthMm: 145,
        startOffsetMm: 1000,
        endOffsetMm: 1045,
        lengthMm: 2400,
        orientation: "across_wall",
      },
    ];
    const out = filterFramingStudsClearOfDoorOpenings(drafts, [door], Tj);
    expect(out.some((d) => d.id === "keep-edge")).toBe(true);
    expect(out.some((d) => d.id === "remove-inside")).toBe(false);
    expect(out.some((d) => d.id === "keep-joint")).toBe(true);
  });
});

describe("removeGkLFramingStudsOverlappingDoorJambs", () => {
  it("убирает framing_member_generic в полосе дверной стойки (стык листа = roughLo)", () => {
    const Tj = 50;
    const door = { id: "d1", wallId: "w1", kind: "door" as const, offsetFromStartMm: 2000, widthMm: 1000, heightMm: 2100 };
    const drafts: LumberPieceDraftInput[] = [
      {
        id: "dup-at-rough",
        wallId: "w1",
        calculationId: "c",
        role: "framing_member_generic",
        sectionThicknessMm: Tj,
        sectionDepthMm: 75,
        startOffsetMm: 1950 - Tj / 2,
        endOffsetMm: 1950 + Tj / 2,
        lengthMm: 2500,
        orientation: "across_wall",
      },
      {
        id: "jamb",
        wallId: "w1",
        calculationId: "c",
        role: "opening_left_stud",
        sectionThicknessMm: Tj,
        sectionDepthMm: 75,
        startOffsetMm: 1950,
        endOffsetMm: 2000,
        lengthMm: 2500,
        orientation: "across_wall",
      },
    ];
    const out = removeGkLFramingStudsOverlappingDoorJambs(drafts, [door], Tj);
    expect(out.some((d) => d.id === "dup-at-rough")).toBe(false);
    expect(out.some((d) => d.id === "jamb")).toBe(true);
  });
});
