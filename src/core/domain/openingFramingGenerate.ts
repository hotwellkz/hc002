import { newEntityId } from "./ids";
import type { Opening } from "./opening";
import type { OpeningFramingPiece, OpeningFramingPieceKind } from "./openingFramingPiece";
import type { OpeningSipConstructionSpec } from "./openingWindowTypes";
import type { Profile } from "./profile";
import type { Project } from "./project";
import { getProfileById } from "./profileOps";
import type { Wall } from "./wall";
import { resolveEffectiveWallManufacturing } from "./wallManufacturing";

const KIND_ORDER: readonly OpeningFramingPieceKind[] = [
  "above",
  "lintel_top",
  "lintel_bottom",
  "side_left",
  "side_right",
  "side_fix_left",
  "side_fix_right",
  "below",
];

/** Суффикс марки: ОК-1-TOP1, ОК-1-L1, … */
const KIND_SUFFIX: Readonly<Record<OpeningFramingPieceKind, string>> = {
  above: "TOP",
  lintel_top: "LINTT",
  lintel_bottom: "LINTB",
  side_left: "L",
  side_right: "R",
  side_fix_left: "FIXL",
  side_fix_right: "FIXR",
  below: "BOT",
};

/** Вылет горизонталей за чистый проём, мм. */
const HEADER_TAIL_MM = 100;
/** Зазор между стыкующимися вертикальными сегментами (тип 2/3), мм. */
const SIDE_SEGMENT_GAP_MM = 12;
/** Добавка к высоте проёма для расчётной длины вертикалей (опирание на обвязку / зону перемычек), мм. */
const SIDE_VERTICAL_EXTRA_MM = 180;
/** Длина закрепляющей стойки (доля от высоты проёма, макс мм). */
const FIX_STUD_MAX_MM = 720;
const FIX_STUD_MIN_MM = 320;

function horizontalSpanMm(opening: Opening): number {
  return Math.max(1, Math.round(opening.widthMm));
}

function verticalSpanMm(opening: Opening): number {
  return Math.max(1, Math.round(opening.heightMm));
}

function studWidthAlongWallMm(project: Project, profileId: string | null): number {
  const p = profileId ? getProfileById(project, profileId) : undefined;
  if (!p?.layers.length) {
    return 45;
  }
  const t0 = p.layers[0]!.thicknessMm;
  return Math.max(36, Math.min(100, t0));
}

function jointHalfPackMm(wall: Wall | undefined, project: Project): number {
  if (!wall?.profileId) {
    return 40;
  }
  const prof = getProfileById(project, wall.profileId);
  if (!prof) {
    return 40;
  }
  const m = resolveEffectiveWallManufacturing(prof);
  return Math.max(28, Math.min(80, m.jointBoardThicknessMm));
}

function sideSegmentCount(sideType: OpeningSipConstructionSpec["sideType"]): number {
  if (sideType === "type1") {
    return 1;
  }
  if (sideType === "type2") {
    return 2;
  }
  return 3;
}

function sideSegmentLengthsMm(totalMm: number, nSeg: number): number[] {
  if (nSeg < 1) {
    return [];
  }
  if (nSeg === 1) {
    return [Math.max(200, Math.round(totalMm))];
  }
  const gap = SIDE_SEGMENT_GAP_MM * (nSeg - 1);
  const usable = Math.max(200 * nSeg, totalMm - gap);
  const base = Math.floor(usable / nSeg);
  const rem = Math.round(usable - base * nSeg);
  const out: number[] = [];
  for (let i = 0; i < nSeg; i++) {
    out.push(base + (i < rem ? 1 : 0));
  }
  return out;
}

function pushPiece(
  out: OpeningFramingPiece[],
  baseMark: string,
  wallId: string,
  openingId: string,
  kind: OpeningFramingPieceKind,
  profileId: string,
  lengthMm: number,
  seq: { n: number },
): void {
  const suf = KIND_SUFFIX[kind];
  seq.n += 1;
  out.push({
    id: newEntityId(),
    openingId,
    wallId,
    kind,
    profileId,
    lengthMm: Math.round(lengthMm),
    markLabel: `${baseMark}-${suf}${seq.n}`,
    sequenceIndex: KIND_ORDER.indexOf(kind) * 100 + seq.n,
  });
}

/**
 * Элементы обрамления по вкладке «Конструкция SIP» и габаритам проёма.
 * Длины — для спецификации и 2D/3D; стык с SIP-панелями учитывается через пересчёт wallCalculation.
 */
export function generateOpeningFramingPieces(
  opening: Opening,
  wallId: string,
  sip: OpeningSipConstructionSpec,
  baseMark: string,
  project: Project,
): OpeningFramingPiece[] {
  const wall = project.walls.find((w) => w.id === wallId);
  const Tj = jointHalfPackMm(wall, project);
  const studW = studWidthAlongWallMm(project, sip.sideProfileId);
  const out: OpeningFramingPiece[] = [];
  const seq = { n: 0 };
  const h = horizontalSpanMm(opening);
  const v = verticalSpanMm(opening);

  const addIf = (kind: OpeningFramingPieceKind, profileId: string | null, len: number, double: boolean) => {
    if (!profileId || len < 50) {
      return;
    }
    pushPiece(out, baseMark, wallId, opening.id, kind, profileId, len, seq);
    if (double) {
      pushPiece(out, baseMark, wallId, opening.id, kind, profileId, len, seq);
    }
  };

  const aboveLen = h + 2 * HEADER_TAIL_MM;
  addIf("above", sip.aboveProfileId, aboveLen, sip.aboveDouble);

  const innerLintel = Math.max(240, h - 2 * Math.max(Tj, studW * 0.85));
  addIf("lintel_top", sip.lintelTopProfileId, innerLintel, sip.lintelTopDouble === true);
  addIf("lintel_bottom", sip.lintelBottomProfileId, innerLintel, sip.lintelBottomDouble === true);

  const nSide = sideSegmentCount(sip.sideType);
  const sideTotal = v + SIDE_VERTICAL_EXTRA_MM;
  const segLens = sideSegmentLengthsMm(sideTotal, nSide);

  if (sip.sideProfileId) {
    for (const len of segLens) {
      pushPiece(out, baseMark, wallId, opening.id, "side_left", sip.sideProfileId, len, seq);
    }
    for (const len of segLens) {
      pushPiece(out, baseMark, wallId, opening.id, "side_right", sip.sideProfileId, len, seq);
    }
  }

  if (sip.sideClosingStuds && sip.sideProfileId) {
    const fixLen = Math.max(
      FIX_STUD_MIN_MM,
      Math.min(FIX_STUD_MAX_MM, Math.round(v * 0.35 + 120)),
    );
    pushPiece(out, baseMark, wallId, opening.id, "side_fix_left", sip.sideProfileId, fixLen, seq);
    pushPiece(out, baseMark, wallId, opening.id, "side_fix_right", sip.sideProfileId, fixLen, seq);
  }

  const belowLen = h + 2 * HEADER_TAIL_MM;
  addIf("below", sip.belowProfileId, belowLen, sip.belowDouble);

  return out.sort((a, b) => a.sequenceIndex - b.sequenceIndex || a.markLabel.localeCompare(b.markLabel, "ru"));
}

export function findDefaultBoardProfile145x45(profiles: readonly Profile[]): Profile | null {
  for (const p of profiles) {
    if (p.category !== "board" && p.category !== "beam" && p.category !== "custom") {
      continue;
    }
    const name = p.name.toLowerCase();
    if (name.includes("145") && name.includes("45")) {
      return p;
    }
    let sumT = 0;
    for (const L of p.layers) {
      sumT += L.thicknessMm;
    }
    if (Math.abs(sumT - 145) < 8 && p.layers.some((l) => Math.abs(l.thicknessMm - 45) < 8)) {
      return p;
    }
  }
  const board = profiles.find((p) => p.category === "board");
  return board ?? null;
}

export function defaultOpeningSipConstruction(profiles: readonly Profile[]): OpeningSipConstructionSpec {
  const def = findDefaultBoardProfile145x45(profiles);
  const pid = def?.id ?? null;
  return {
    aboveProfileId: pid,
    aboveDouble: false,
    lintelTopProfileId: pid,
    lintelTopDouble: false,
    lintelBottomProfileId: pid,
    lintelBottomDouble: false,
    sideProfileId: pid,
    sideType: "type1",
    sideClosingStuds: false,
    belowProfileId: pid,
    belowDouble: false,
  };
}
