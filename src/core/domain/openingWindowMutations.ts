import type { Opening } from "./opening";
import type { OpeningFramingPiece } from "./openingFramingPiece";
import {
  defaultOpeningSipConstruction,
  generateOpeningFramingPieces,
} from "./openingFramingGenerate";
import {
  DEFAULT_SILL_OVERHANG_MM,
  DEFAULT_VIEW_PRESET_KEY,
  DEFAULT_WINDOW_FORM_KEY,
  windowFormName,
} from "./windowFormCatalog";
import {
  clampOpeningLeftEdgeMm,
  defaultPositionSpecFromLeftEdge,
  offsetFromStartFromPositionSpec,
  validateWindowPlacementOnWall,
} from "./openingWindowGeometry";
import { recalculateWallCalculationStrict } from "./wallCalculationRecalc";
import { getProfileById } from "./profileOps";
import type { OpeningPositionSpec, OpeningSipConstructionSpec } from "./openingWindowTypes";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";
import type { Wall } from "./wall";

function nowIso(): string {
  return new Date().toISOString();
}

export function nextWindowSequenceNumber(project: Project): number {
  let m = 0;
  for (const o of project.openings) {
    if (o.kind === "window" && o.windowSequenceNumber != null && o.windowSequenceNumber > m) {
      m = o.windowSequenceNumber;
    }
  }
  return m + 1;
}

function withoutFramingForOpening(project: Project, openingId: string): OpeningFramingPiece[] {
  return project.openingFramingPieces.filter((p) => p.openingId !== openingId);
}

export interface PlaceDraftWindowResult {
  readonly project: Project;
  readonly opening: Opening;
}

/**
 * Привязка черновика окна к стене после клика (геометрия от курсора).
 */
export function placeDraftWindowOnWall(
  project: Project,
  draftOpeningId: string,
  wallId: string,
  leftEdgeAlongMm: number,
): PlaceDraftWindowResult | { readonly error: string } {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) {
    return { error: "Стена не найдена." };
  }
  const idx = project.openings.findIndex((o) => o.id === draftOpeningId);
  if (idx < 0) {
    return { error: "Окно не найдено." };
  }
  const prev = project.openings[idx]!;
  if (prev.kind !== "window") {
    return { error: "Можно размещать только окна." };
  }
  if (prev.wallId != null) {
    return { error: "Окно уже привязано к стене." };
  }

  const W = prev.widthMm;
  const clamped = clampOpeningLeftEdgeMm(wall, W, leftEdgeAlongMm);
  const v = validateWindowPlacementOnWall(wall, clamped, W, project, prev.id);
  if (!v.ok) {
    return { error: v.reason };
  }

  const seq = nextWindowSequenceNumber(project);
  const mark = `ОК-${seq}`;
  const sillLevel = 900;
  const position = defaultPositionSpecFromLeftEdge(wall, clamped, W, sillLevel);

  const nextOpening: Opening = {
    ...prev,
    wallId,
    offsetFromStartMm: clamped,
    position,
    sillHeightMm: sillLevel,
    windowSequenceNumber: seq,
    markLabel: mark,
    updatedAt: nowIso(),
  };

  const openings = [...project.openings];
  openings[idx] = nextOpening;

  return {
    project: touchProjectMeta({ ...project, openings }),
    opening: nextOpening,
  };
}

/** Сборка payload из уже размещённого окна (редактирование / финализация после клика). */
export function buildSaveWindowParamsPayloadFromOpening(
  opening: Opening,
  wall: Wall,
  sip: OpeningSipConstructionSpec,
): SaveWindowParamsPayload {
  const fk = opening.formKey ?? DEFAULT_WINDOW_FORM_KEY;
  const off = opening.offsetFromStartMm;
  const W = opening.widthMm;
  const sill = opening.sillHeightMm ?? opening.position?.sillLevelMm ?? 900;
  const position =
    opening.position ??
    defaultPositionSpecFromLeftEdge(wall, off ?? 0, W, sill);
  return {
    formKey: fk,
    formName: opening.formName?.trim() || windowFormName(fk),
    widthMm: W,
    heightMm: opening.heightMm,
    viewPreset: opening.viewPreset ?? DEFAULT_VIEW_PRESET_KEY,
    sillOverhangMm: opening.sillOverhangMm ?? DEFAULT_SILL_OVERHANG_MM,
    isEmptyOpening: opening.isEmptyOpening ?? false,
    position,
    sipConstruction: sip,
  };
}

/**
 * После placeDraftWindowOnWall: SIP по умолчанию, пересчёт offset и генерация openingFramingPieces.
 */
export function finalizeWindowPlacementWithDefaults(
  project: Project,
  openingId: string,
): { readonly project: Project } | { readonly error: string } {
  const o = project.openings.find((x) => x.id === openingId);
  if (!o || o.wallId == null || o.offsetFromStartMm == null) {
    return { error: "Окно не размещено на стене." };
  }
  const wall = project.walls.find((w) => w.id === o.wallId);
  if (!wall) {
    return { error: "Стена не найдена." };
  }
  const sip = o.sipConstruction ?? defaultOpeningSipConstruction(project.profiles);
  const payload = buildSaveWindowParamsPayloadFromOpening(o, wall, sip);
  return saveWindowParamsAndRegenerateFraming(project, openingId, payload);
}

export interface SaveWindowParamsPayload {
  readonly formKey: Opening["formKey"];
  readonly formName: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly viewPreset: NonNullable<Opening["viewPreset"]>;
  readonly sillOverhangMm: number;
  readonly isEmptyOpening: boolean;
  readonly position: OpeningPositionSpec;
  readonly sipConstruction: OpeningSipConstructionSpec;
}

/**
 * Сохранение вкладок форма/позиция/SIP: пересчёт offset, генерация обрамления.
 */
export function saveWindowParamsAndRegenerateFraming(
  project: Project,
  openingId: string,
  payload: SaveWindowParamsPayload,
): { readonly project: Project } | { readonly error: string } {
  const idx = project.openings.findIndex((o) => o.id === openingId);
  if (idx < 0) {
    return { error: "Окно не найдено." };
  }
  const prev = project.openings[idx]!;
  if (prev.wallId == null || prev.offsetFromStartMm == null) {
    return { error: "Сначала разместите окно на стене." };
  }
  const wall = project.walls.find((w) => w.id === prev.wallId);
  if (!wall) {
    return { error: "Стена не найдена." };
  }

  const W = payload.widthMm;
  const left = offsetFromStartFromPositionSpec(wall, W, payload.position);
  const v = validateWindowPlacementOnWall(wall, left, W, project, openingId);
  if (!v.ok) {
    return { error: v.reason };
  }

  let sip = payload.sipConstruction;
  const missingProfile =
    !sip.aboveProfileId &&
    !sip.lintelTopProfileId &&
    !sip.lintelBottomProfileId &&
    !sip.sideProfileId &&
    !sip.belowProfileId;
  if (missingProfile) {
    sip = defaultOpeningSipConstruction(project.profiles);
  }

  const profileCheckIds = [
    sip.aboveProfileId,
    sip.lintelTopProfileId,
    sip.lintelBottomProfileId,
    sip.sideProfileId,
    sip.belowProfileId,
  ].filter((x): x is string => Boolean(x));
  for (const pid of profileCheckIds) {
    if (!getProfileById(project, pid)) {
      return { error: "Один из профилей конструкции SIP не найден в проекте. Выберите профиль из списка." };
    }
  }

  const nextOpening: Opening = {
    ...prev,
    widthMm: W,
    heightMm: payload.heightMm,
    formKey: payload.formKey,
    formName: payload.formName,
    viewPreset: payload.viewPreset,
    sillOverhangMm: payload.sillOverhangMm,
    isEmptyOpening: payload.isEmptyOpening,
    position: payload.position,
    sipConstruction: sip,
    offsetFromStartMm: left,
    sillHeightMm: payload.position.sillLevelMm,
    updatedAt: nowIso(),
  };

  const baseMark = nextOpening.markLabel?.trim() || `ОК-${nextOpening.windowSequenceNumber ?? "?"}`;
  const framing = generateOpeningFramingPieces(nextOpening, wall.id, sip, baseMark, project);
  const framingRest = withoutFramingForOpening(project, openingId);

  const openings = [...project.openings];
  openings[idx] = nextOpening;

  let nextProject = touchProjectMeta({
    ...project,
    openings,
    openingFramingPieces: [...framingRest, ...framing],
  });
  const recalc = recalculateWallCalculationStrict(nextProject, wall.id);
  if ("error" in recalc) {
    return { error: recalc.error };
  }
  nextProject = recalc.project;
  return { project: nextProject };
}

/**
 * Сместить размещённое окно вдоль стены (левый край), с валидацией и пересборкой обрамления/спеки.
 */
export function repositionPlacedWindowLeftEdge(
  project: Project,
  openingId: string,
  leftEdgeMm: number,
): { readonly project: Project } | { readonly error: string } {
  const o = project.openings.find((x) => x.id === openingId);
  if (!o || o.kind !== "window" || o.wallId == null || o.offsetFromStartMm == null) {
    return { error: "Окно не на стене." };
  }
  const wall = project.walls.find((w) => w.id === o.wallId);
  if (!wall) {
    return { error: "Стена не найдена." };
  }
  const clamped = clampOpeningLeftEdgeMm(wall, o.widthMm, leftEdgeMm);
  const v = validateWindowPlacementOnWall(wall, clamped, o.widthMm, project, openingId);
  if (!v.ok) {
    return { error: v.reason };
  }
  const sill = o.sillHeightMm ?? o.position?.sillLevelMm ?? 900;
  const position = defaultPositionSpecFromLeftEdge(wall, clamped, o.widthMm, sill);
  const merged: Opening = {
    ...o,
    offsetFromStartMm: clamped,
    position,
    sillHeightMm: sill,
  };
  const sip = o.sipConstruction ?? defaultOpeningSipConstruction(project.profiles);
  const payload = buildSaveWindowParamsPayloadFromOpening(merged, wall, sip);
  return saveWindowParamsAndRegenerateFraming(project, openingId, payload);
}

export function removeOpeningFramingPiecesForWallIds(project: Project, wallIds: ReadonlySet<string>): Project {
  const wallSet = wallIds;
  return {
    ...project,
    openingFramingPieces: project.openingFramingPieces.filter((p) => !wallSet.has(p.wallId)),
  };
}
