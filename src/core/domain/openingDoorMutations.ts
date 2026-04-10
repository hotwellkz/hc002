import type { Opening } from "./opening";
import {
  clampPlacedOpeningLeftEdgeMm,
  defaultPositionSpecFromLeftEdge,
  offsetFromStartFromPositionSpec,
  validateWindowPlacementOnWall,
} from "./openingWindowGeometry";
import { defaultOpeningSipConstruction } from "./openingFramingGenerate";
import type { OpeningPositionSpec, OpeningSipConstructionSpec } from "./openingWindowTypes";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";
import { recalculateWallCalculationIfPresent } from "./wallCalculationRecalc";

function nowIso(): string {
  return new Date().toISOString();
}

export function nextDoorSequenceNumber(project: Project): number {
  let m = 0;
  for (const o of project.openings) {
    if (o.kind === "door" && o.doorSequenceNumber != null && o.doorSequenceNumber > m) {
      m = o.doorSequenceNumber;
    }
  }
  return m + 1;
}

export function placeDraftDoorOnWall(
  project: Project,
  draftOpeningId: string,
  wallId: string,
  leftEdgeAlongMm: number,
): { readonly project: Project; readonly opening: Opening } | { readonly error: string } {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) {
    return { error: "Стена не найдена." };
  }
  const idx = project.openings.findIndex((o) => o.id === draftOpeningId);
  if (idx < 0) {
    return { error: "Дверь не найдена." };
  }
  const prev = project.openings[idx]!;
  if (prev.kind !== "door") {
    return { error: "Можно размещать только двери." };
  }
  const clamped = clampPlacedOpeningLeftEdgeMm(wall, prev.widthMm, leftEdgeAlongMm, project, "door");
  const v = validateWindowPlacementOnWall(wall, clamped, prev.widthMm, project, prev.id, { openingKind: "door" });
  if (!v.ok) {
    return { error: v.reason };
  }
  const seq = nextDoorSequenceNumber(project);
  const mark = `Д-${seq}`;
  const position = defaultPositionSpecFromLeftEdge(wall, clamped, prev.widthMm, 0);
  const nextOpening: Opening = {
    ...prev,
    wallId,
    offsetFromStartMm: clamped,
    position,
    sillHeightMm: 0,
    doorSequenceNumber: seq,
    markLabel: mark,
    updatedAt: nowIso(),
  };
  const openings = [...project.openings];
  openings[idx] = nextOpening;
  return { project: touchProjectMeta({ ...project, openings }), opening: nextOpening };
}

export interface SaveDoorParamsPayload {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly isEmptyOpening: boolean;
  readonly doorType: "single";
  readonly doorSwing: "in_right" | "in_left" | "out_right" | "out_left";
  readonly doorTrimMm: number;
  readonly position: OpeningPositionSpec;
  readonly sipConstruction: OpeningSipConstructionSpec;
}

export function saveDoorParams(
  project: Project,
  openingId: string,
  payload: SaveDoorParamsPayload,
): { readonly project: Project } | { readonly error: string } {
  const idx = project.openings.findIndex((o) => o.id === openingId);
  if (idx < 0) {
    return { error: "Дверь не найдена." };
  }
  const prev = project.openings[idx]!;
  if (prev.kind !== "door" || prev.wallId == null) {
    return { error: "Сначала разместите дверь на стене." };
  }
  const wall = project.walls.find((w) => w.id === prev.wallId);
  if (!wall) {
    return { error: "Стена не найдена." };
  }
  const left = offsetFromStartFromPositionSpec(wall, payload.widthMm, payload.position, project, "door");
  const v = validateWindowPlacementOnWall(wall, left, payload.widthMm, project, openingId, { openingKind: "door" });
  if (!v.ok) {
    return { error: v.reason };
  }
  const nextOpening: Opening = {
    ...prev,
    widthMm: payload.widthMm,
    heightMm: payload.heightMm,
    isEmptyOpening: payload.isEmptyOpening,
    doorType: payload.doorType,
    doorSwing: payload.doorSwing,
    doorTrimMm: payload.doorTrimMm,
    position: payload.position,
    sipConstruction: payload.sipConstruction,
    offsetFromStartMm: left,
    sillHeightMm: 0,
    updatedAt: nowIso(),
  };
  const openings = [...project.openings];
  openings[idx] = nextOpening;
  let next = touchProjectMeta({ ...project, openings });
  /** Для двери не блокируем ручное размещение/перемещение ограничением min SIP panel. */
  next = recalculateWallCalculationIfPresent(next, wall.id);
  return { project: next };
}

export function repositionPlacedDoorLeftEdge(
  project: Project,
  openingId: string,
  leftEdgeMm: number,
): { readonly project: Project } | { readonly error: string } {
  const o = project.openings.find((x) => x.id === openingId);
  if (!o || o.kind !== "door" || o.wallId == null || o.offsetFromStartMm == null) {
    return { error: "Дверь не на стене." };
  }
  const wall = project.walls.find((w) => w.id === o.wallId);
  if (!wall) {
    return { error: "Стена не найдена." };
  }
  const clamped = clampPlacedOpeningLeftEdgeMm(wall, o.widthMm, leftEdgeMm, project, "door");
  const v = validateWindowPlacementOnWall(wall, clamped, o.widthMm, project, openingId, { openingKind: "door" });
  if (!v.ok) {
    return { error: v.reason };
  }
  const position = defaultPositionSpecFromLeftEdge(wall, clamped, o.widthMm, 0);
  return saveDoorParams(project, openingId, {
    widthMm: o.widthMm,
    heightMm: o.heightMm,
    isEmptyOpening: o.isEmptyOpening ?? false,
    doorType: o.doorType ?? "single",
    doorSwing: o.doorSwing ?? "in_right",
    doorTrimMm: o.doorTrimMm ?? 50,
    position,
    sipConstruction: o.sipConstruction ?? defaultOpeningSipConstruction(project.profiles),
  });
}

