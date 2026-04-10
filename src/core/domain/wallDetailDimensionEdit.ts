import type { Opening } from "./opening";
import type { OpeningPositionSpec } from "./openingWindowTypes";
import { defaultOpeningSipConstruction } from "./openingFramingGenerate";
import {
  buildSaveWindowParamsPayloadFromOpening,
  saveWindowParamsAndRegenerateFraming,
} from "./openingWindowMutations";
import {
  clampOpeningLeftEdgeMm,
  clampPlacedOpeningLeftEdgeMm,
  defaultPositionSpecFromLeftEdge,
  validateWindowPlacementOnWall,
} from "./openingWindowGeometry";
import type { Project } from "./project";
import { replaceWallInProject } from "./wallMutations";
import type { Wall } from "./wall";
import { applyWallLengthChangeInProject } from "./wallLengthChangeApply";
import { recalculateWallCalculationIfPresent } from "./wallCalculationRecalc";
import { repositionPlacedDoorLeftEdge, saveDoorParams } from "./openingDoorMutations";
import { repositionPlacedWindowLeftEdge } from "./openingWindowMutations";
import { MIN_WALL_SEGMENT_LENGTH_MM } from "./wallOps";
import { wallLengthMm } from "./wallCalculationGeometry";

/** Размерная линия «Вид стены» → параметр модели. */
export type WallDetailDimEditHandle =
  | { readonly kind: "wall_total_length" }
  | { readonly kind: "wall_height"; readonly wallId: string }
  | { readonly kind: "opening_offset_from_wall_start"; readonly openingId: string }
  | { readonly kind: "opening_width"; readonly openingId: string }
  /** Ширина проёма по дельте к текущей (подсегмент внутри светового проёма, SIP). */
  | { readonly kind: "opening_width_delta"; readonly openingId: string; readonly displayedSpanMm: number }
  | {
      readonly kind: "gap_between_openings";
      readonly leftOpeningId: string;
      readonly rightOpeningId: string;
      /** `absolute` — v = полный зазор; `delta` — сдвиг правого проёма на (v − referenceSpanMm). */
      readonly gapApplyMode?: "absolute" | "delta";
      readonly referenceSpanMm?: number;
    }
  | { readonly kind: "trailing_segment_to_wall_end"; readonly fixedBoundaryAlongMm: number }
  /** Участок 0…h до первого проёма, h < левого края проёма (SIP): сдвиг левого края первого проёма. */
  | { readonly kind: "leading_stub_before_first_opening"; readonly openingId: string; readonly stubEndMm: number }
  /** Промежуток перед ближайшим проёмом справа (внутренний SIP): сдвиг левого края этого проёма. */
  | { readonly kind: "clearance_before_opening_delta"; readonly openingId: string; readonly displayedSpanMm: number }
  /** Стена без проёмов: внутренний SIP-сегмент — длина стены меняется на (v − span). */
  | { readonly kind: "wall_axis_span_edit_total_length"; readonly displayedSpanMm: number }
  | { readonly kind: "opening_height"; readonly openingId: string }
  | { readonly kind: "opening_sill_height"; readonly openingId: string };

export interface WallDetailHorizontalDimSegment {
  readonly a: number;
  readonly b: number;
  readonly text: string;
  /** null — только отображение (внутренний сегмент SIP/листа без прямого параметра). */
  readonly edit: WallDetailDimEditHandle | null;
}

export function wallDetailDimEditHandleKey(h: WallDetailDimEditHandle): string {
  switch (h.kind) {
    case "wall_total_length":
      return "wd:w:total";
    case "wall_height":
      return `wd:w:h:${h.wallId}`;
    case "opening_offset_from_wall_start":
      return `wd:o:off:${h.openingId}`;
    case "opening_width":
      return `wd:o:w:${h.openingId}`;
    case "opening_width_delta":
      return `wd:o:wd:${h.openingId}:${Math.round(h.displayedSpanMm)}`;
    case "gap_between_openings":
      return `wd:o:gap:${h.leftOpeningId}:${h.rightOpeningId}:${h.gapApplyMode ?? "abs"}:${h.referenceSpanMm ?? 0}`;
    case "trailing_segment_to_wall_end":
      return `wd:w:trail:${Math.round(h.fixedBoundaryAlongMm)}`;
    case "leading_stub_before_first_opening":
      return `wd:o:stub1:${h.openingId}:${Math.round(h.stubEndMm)}`;
    case "clearance_before_opening_delta":
      return `wd:o:clr:${h.openingId}:${Math.round(h.displayedSpanMm)}`;
    case "wall_axis_span_edit_total_length":
      return `wd:w:span:${Math.round(h.displayedSpanMm)}`;
    case "opening_height":
      return `wd:o:h:${h.openingId}`;
    case "opening_sill_height":
      return `wd:o:sill:${h.openingId}`;
    default:
      return "wd:unknown";
  }
}

/** Уникальный ключ клика по горизонтальному сегменту (один тип может повторяться на разных интервалах). */
export function wallDetailHorizontalInteractionKey(h: WallDetailDimEditHandle, aMm: number, bMm: number): string {
  const lo = Math.round(Math.min(aMm, bMm) * 100);
  const hi = Math.round(Math.max(aMm, bMm) * 100);
  return `${wallDetailDimEditHandleKey(h)}#${lo}-${hi}`;
}

/** Окна/двери на стене, слева направо. */
export function wallDetailEditableOpeningsSorted(openingsOnWall: readonly Opening[]): Opening[] {
  return [...openingsOnWall]
    .filter((o) => o.offsetFromStartMm != null && (o.kind === "door" || o.kind === "window"))
    .sort((a, b) => (a.offsetFromStartMm ?? 0) - (b.offsetFromStartMm ?? 0));
}

const ASSIGN_EPS = 2.5;

/**
 * Назначает редактирование для любого отображаемого горизонтального сегмента [a,b] (мм вдоль стены).
 * Покрывает хвост до торца, частичные зазоры SIP, заглушку до первого проёма и подсегменты внутри проёма.
 */
export function assignWallDetailHorizontalSegmentEdit(
  a: number,
  b: number,
  wallLenMm: number,
  openingsOnWall: readonly Opening[],
): WallDetailDimEditHandle {
  const L = wallLenMm;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const len = hi - lo;
  const E = ASSIGN_EPS;
  const sorted = wallDetailEditableOpeningsSorted(openingsOnWall);

  const nearEq = (x: number, y: number) => Math.abs(x - y) <= E;

  if (len < 2) {
    return { kind: "wall_total_length" };
  }

  if (nearEq(lo, 0) && nearEq(hi, L)) {
    return { kind: "wall_total_length" };
  }

  /** Любой хвост до правого торца стены: новая длина стены = lo + введённое значение. */
  if (hi >= L - E && lo < L - E) {
    return { kind: "trailing_segment_to_wall_end", fixedBoundaryAlongMm: lo };
  }

  if (sorted.length === 0) {
    if (hi >= L - E) {
      return { kind: "trailing_segment_to_wall_end", fixedBoundaryAlongMm: lo };
    }
    return { kind: "wall_axis_span_edit_total_length", displayedSpanMm: hi - lo };
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const firstLo = first.offsetFromStartMm!;
  const lastHi = last.offsetFromStartMm! + last.widthMm;

  if (nearEq(lo, 0) && nearEq(hi, firstLo)) {
    return { kind: "opening_offset_from_wall_start", openingId: first.id };
  }

  if (lo <= E && hi < firstLo - E) {
    return { kind: "leading_stub_before_first_opening", openingId: first.id, stubEndMm: hi };
  }

  if (lo > E && hi < firstLo - E && hi > lo) {
    return { kind: "clearance_before_opening_delta", openingId: first.id, displayedSpanMm: hi - lo };
  }

  if (nearEq(lo, lastHi) && hi >= L - E) {
    return { kind: "trailing_segment_to_wall_end", fixedBoundaryAlongMm: lastHi };
  }

  for (const o of sorted) {
    const oLo = o.offsetFromStartMm!;
    const oHi = oLo + o.widthMm;
    if (lo < oLo - E || hi > oHi + E) {
      continue;
    }
    if (nearEq(lo, oLo) && nearEq(hi, oHi)) {
      return { kind: "opening_width", openingId: o.id };
    }
    return { kind: "opening_width_delta", openingId: o.id, displayedSpanMm: hi - lo };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const oL = sorted[i]!;
    const oR = sorted[i + 1]!;
    const g0 = oL.offsetFromStartMm! + oL.widthMm;
    const g1 = oR.offsetFromStartMm!;
    if (hi < g0 - E || lo > g1 + E) {
      continue;
    }
    const fullyInsideGap = lo >= g0 - E && hi <= g1 + E && hi > lo;
    if (!fullyInsideGap) {
      continue;
    }
    if (nearEq(lo, g0) && nearEq(hi, g1)) {
      return {
        kind: "gap_between_openings",
        leftOpeningId: oL.id,
        rightOpeningId: oR.id,
        gapApplyMode: "absolute",
      };
    }
    return {
      kind: "gap_between_openings",
      leftOpeningId: oL.id,
      rightOpeningId: oR.id,
      gapApplyMode: "delta",
      referenceSpanMm: hi - lo,
    };
  }

  const nextAfter = sorted.find((o) => (o.offsetFromStartMm ?? 0) > lo + 0.5);
  if (nextAfter) {
    return {
      kind: "clearance_before_opening_delta",
      openingId: nextAfter.id,
      displayedSpanMm: hi - lo,
    };
  }

  return { kind: "trailing_segment_to_wall_end", fixedBoundaryAlongMm: lo };
}

/**
 * @deprecated Используйте {@link assignWallDetailHorizontalSegmentEdit}; оставлено для тестов совместимости.
 */
export function classifyWallDetailHorizontalSegment(
  a: number,
  b: number,
  wallLenMm: number,
  openingsOnWall: readonly Opening[],
  epsMm = 1,
): WallDetailDimEditHandle | null {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo < 2) {
    return null;
  }
  void epsMm;
  return assignWallDetailHorizontalSegmentEdit(a, b, wallLenMm, openingsOnWall);
}

export function buildWallDetailOpeningChainSegmentsWithEdit(
  wallLenMm: number,
  openingsOnWall: readonly Opening[],
): WallDetailHorizontalDimSegment[] {
  const points = [0, wallLenMm];
  for (const o of openingsOnWall) {
    if (o.offsetFromStartMm == null) {
      continue;
    }
    if (o.kind !== "door" && o.kind !== "window") {
      continue;
    }
    points.push(o.offsetFromStartMm, o.offsetFromStartMm + o.widthMm);
  }
  points.sort((a, b) => a - b);
  const out: WallDetailHorizontalDimSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (b - a < 2) {
      continue;
    }
    const edit = assignWallDetailHorizontalSegmentEdit(a, b, wallLenMm, openingsOnWall);
    out.push({ a, b, text: `${Math.round(b - a)}`, edit });
  }
  return out;
}

export function mapSipOrSheetHorizontalSegmentsWithEdit(
  segments: readonly { readonly a: number; readonly b: number; readonly text: string }[],
  wallLenMm: number,
  openingsOnWall: readonly Opening[],
): WallDetailHorizontalDimSegment[] {
  return segments.map((s) => ({
    ...s,
    edit: assignWallDetailHorizontalSegmentEdit(s.a, s.b, wallLenMm, openingsOnWall),
  }));
}

function validateWallHeightForOpenings(project: Project, wallId: string, newHeightMm: number): string | null {
  if (!Number.isFinite(newHeightMm) || newHeightMm < MIN_WALL_SEGMENT_LENGTH_MM) {
    return "Высота стены должна быть не меньше 1 мм.";
  }
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) {
    return "Стена не найдена.";
  }
  for (const o of project.openings) {
    if (o.wallId !== wallId || o.offsetFromStartMm == null) {
      continue;
    }
    if (o.kind === "window") {
      const sill = o.sillHeightMm ?? o.position?.sillLevelMm ?? 900;
      if (sill < 0) {
        continue;
      }
      if (sill + o.heightMm > newHeightMm + 1e-3) {
        return "Проём не помещается по высоте стены (уровень низа + высота окна).";
      }
    } else if (o.kind === "door" && o.heightMm > newHeightMm + 1e-3) {
      return "Высота двери больше высоты стены.";
    }
  }
  return null;
}

function normalizeMmInput(raw: number): { readonly ok: true; readonly mm: number } | { readonly ok: false; readonly error: string } {
  if (!Number.isFinite(raw) || raw <= 0) {
    return { ok: false, error: "Введите положительное число (мм)." };
  }
  const mm = Math.round(raw);
  if (mm < 1) {
    return { ok: false, error: "Минимальное значение 1 мм." };
  }
  return { ok: true, mm };
}

function normalizedWallDetailMm(
  handle: WallDetailDimEditHandle,
  raw: number,
): { readonly ok: true; readonly mm: number } | { readonly ok: false; readonly error: string } {
  if (handle.kind === "opening_sill_height") {
    if (!Number.isFinite(raw) || raw < 0) {
      return { ok: false, error: "Уровень низа: неотрицательное число, мм." };
    }
    return { ok: true, mm: Math.round(raw) };
  }
  return normalizeMmInput(raw);
}

/**
 * Применить новое значение размера (мм) к модели и пересчитать конструкцию стены при наличии расчёта.
 */
export function applyWallDetailDimensionEdit(
  project: Project,
  wallId: string,
  handle: WallDetailDimEditHandle,
  newValueMmRaw: number,
): { readonly project: Project } | { readonly error: string } {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) {
    return { error: "Стена не найдена." };
  }

  const n = normalizedWallDetailMm(handle, newValueMmRaw);
  if (!n.ok) {
    return { error: n.error };
  }
  const v = n.mm;

  switch (handle.kind) {
    case "wall_total_length": {
      const r = applyWallLengthChangeInProject(project, wallId, "end", v);
      return "error" in r ? r : { project: r.project };
    }
    case "trailing_segment_to_wall_end": {
      const newLen = handle.fixedBoundaryAlongMm + v;
      const r = applyWallLengthChangeInProject(project, wallId, "end", newLen);
      return "error" in r ? r : { project: r.project };
    }
    case "opening_offset_from_wall_start": {
      const op = project.openings.find((o) => o.id === handle.openingId);
      const r =
        op?.kind === "door"
          ? repositionPlacedDoorLeftEdge(project, handle.openingId, v)
          : repositionPlacedWindowLeftEdge(project, handle.openingId, v);
      return "error" in r ? r : { project: r.project };
    }
    case "gap_between_openings": {
      const left = project.openings.find((o) => o.id === handle.leftOpeningId);
      const right = project.openings.find((o) => o.id === handle.rightOpeningId);
      if (!left || !right || left.offsetFromStartMm == null || right.offsetFromStartMm == null) {
        return { error: "Проёмы не найдены." };
      }
      if (handle.gapApplyMode === "delta" && handle.referenceSpanMm != null) {
        const delta = v - handle.referenceSpanMm;
        const newLeftRight = right.offsetFromStartMm + delta;
        const rr =
          right.kind === "door"
            ? repositionPlacedDoorLeftEdge(project, handle.rightOpeningId, newLeftRight)
            : repositionPlacedWindowLeftEdge(project, handle.rightOpeningId, newLeftRight);
        return "error" in rr ? rr : { project: rr.project };
      }
      const newLeftRight = left.offsetFromStartMm + left.widthMm + v;
      const rr =
        right.kind === "door"
          ? repositionPlacedDoorLeftEdge(project, handle.rightOpeningId, newLeftRight)
          : repositionPlacedWindowLeftEdge(project, handle.rightOpeningId, newLeftRight);
      return "error" in rr ? rr : { project: rr.project };
    }
    case "leading_stub_before_first_opening": {
      const op = project.openings.find((o) => o.id === handle.openingId);
      if (!op || op.wallId !== wallId || op.offsetFromStartMm == null) {
        return { error: "Проём не найден." };
      }
      const cur = op.offsetFromStartMm;
      const newLeft = cur + (v - handle.stubEndMm);
      const r =
        op.kind === "door"
          ? repositionPlacedDoorLeftEdge(project, handle.openingId, newLeft)
          : repositionPlacedWindowLeftEdge(project, handle.openingId, newLeft);
      return "error" in r ? r : { project: r.project };
    }
    case "clearance_before_opening_delta": {
      const op = project.openings.find((o) => o.id === handle.openingId);
      if (!op || op.wallId !== wallId || op.offsetFromStartMm == null) {
        return { error: "Проём не найден." };
      }
      const delta = v - handle.displayedSpanMm;
      const newLeft = op.offsetFromStartMm + delta;
      const r =
        op.kind === "door"
          ? repositionPlacedDoorLeftEdge(project, handle.openingId, newLeft)
          : repositionPlacedWindowLeftEdge(project, handle.openingId, newLeft);
      return "error" in r ? r : { project: r.project };
    }
    case "opening_width_delta": {
      const op = project.openings.find((o) => o.id === handle.openingId);
      if (!op || op.wallId !== wallId || op.offsetFromStartMm == null) {
        return { error: "Проём не найден." };
      }
      const newW = Math.max(1, Math.round(op.widthMm + (v - handle.displayedSpanMm)));
      if (op.kind === "door") {
        const clamped = clampPlacedOpeningLeftEdgeMm(wall, newW, op.offsetFromStartMm, project, "door");
        const val = validateWindowPlacementOnWall(wall, clamped, newW, project, op.id, { openingKind: "door" });
        if (!val.ok) {
          return { error: val.reason };
        }
        const position = defaultPositionSpecFromLeftEdge(wall, clamped, newW, 0);
        return saveDoorParams(project, op.id, {
          widthMm: newW,
          heightMm: op.heightMm,
          isEmptyOpening: op.isEmptyOpening ?? false,
          doorType: op.doorType ?? "single",
          doorSwing: op.doorSwing ?? "in_right",
          doorTrimMm: op.doorTrimMm ?? 50,
          position,
          sipConstruction: op.sipConstruction ?? defaultOpeningSipConstruction(project.profiles),
        });
      }
      if (op.kind !== "window") {
        return { error: "Редактирование не поддерживается." };
      }
      const clamped = clampOpeningLeftEdgeMm(wall, newW, op.offsetFromStartMm, project);
      const val = validateWindowPlacementOnWall(wall, clamped, newW, project, op.id);
      if (!val.ok) {
        return { error: val.reason };
      }
      const sill = op.sillHeightMm ?? op.position?.sillLevelMm ?? 900;
      const sip = op.sipConstruction ?? defaultOpeningSipConstruction(project.profiles);
      const merged: Opening = {
        ...op,
        widthMm: newW,
        offsetFromStartMm: clamped,
        position: defaultPositionSpecFromLeftEdge(wall, clamped, newW, sill),
        sillHeightMm: sill,
      };
      const payload = buildSaveWindowParamsPayloadFromOpening(merged, wall, sip);
      return saveWindowParamsAndRegenerateFraming(project, op.id, payload, { interactiveMove: true });
    }
    case "wall_axis_span_edit_total_length": {
      const L0 = wallLengthMm(wall);
      const newL = L0 + (v - handle.displayedSpanMm);
      const r = applyWallLengthChangeInProject(project, wallId, "end", newL);
      return "error" in r ? r : { project: r.project };
    }
    case "opening_width": {
      const op = project.openings.find((o) => o.id === handle.openingId);
      if (!op || op.wallId !== wallId || op.offsetFromStartMm == null) {
        return { error: "Проём не найден." };
      }
      if (op.kind === "door") {
        const clamped = clampPlacedOpeningLeftEdgeMm(wall, v, op.offsetFromStartMm, project, "door");
        const val = validateWindowPlacementOnWall(wall, clamped, v, project, op.id, { openingKind: "door" });
        if (!val.ok) {
          return { error: val.reason };
        }
        const position = defaultPositionSpecFromLeftEdge(wall, clamped, v, 0);
        return saveDoorParams(project, op.id, {
          widthMm: v,
          heightMm: op.heightMm,
          isEmptyOpening: op.isEmptyOpening ?? false,
          doorType: op.doorType ?? "single",
          doorSwing: op.doorSwing ?? "in_right",
          doorTrimMm: op.doorTrimMm ?? 50,
          position,
          sipConstruction: op.sipConstruction ?? defaultOpeningSipConstruction(project.profiles),
        });
      }
      if (op.kind !== "window") {
        return { error: "Редактирование ширины этого проёма не поддерживается." };
      }
      const clamped = clampOpeningLeftEdgeMm(wall, v, op.offsetFromStartMm, project);
      const val = validateWindowPlacementOnWall(wall, clamped, v, project, op.id);
      if (!val.ok) {
        return { error: val.reason };
      }
      const sill = op.sillHeightMm ?? op.position?.sillLevelMm ?? 900;
      const sip = op.sipConstruction ?? defaultOpeningSipConstruction(project.profiles);
      const merged: Opening = {
        ...op,
        widthMm: v,
        offsetFromStartMm: clamped,
        position: defaultPositionSpecFromLeftEdge(wall, clamped, v, sill),
        sillHeightMm: sill,
      };
      const payload = buildSaveWindowParamsPayloadFromOpening(merged, wall, sip);
      return saveWindowParamsAndRegenerateFraming(project, op.id, payload, { interactiveMove: true });
    }
    case "opening_height": {
      const op = project.openings.find((o) => o.id === handle.openingId);
      if (!op || op.wallId !== wallId || op.offsetFromStartMm == null) {
        return { error: "Проём не найден." };
      }
      if (v < 1) {
        return { error: "Высота проёма должна быть больше нуля." };
      }
      if (op.kind === "door") {
        if (v > wall.heightMm + 1e-3) {
          return { error: "Высота двери больше высоты стены." };
        }
        const clamped = clampPlacedOpeningLeftEdgeMm(wall, op.widthMm, op.offsetFromStartMm, project, "door");
        const position = defaultPositionSpecFromLeftEdge(wall, clamped, op.widthMm, 0);
        return saveDoorParams(project, op.id, {
          widthMm: op.widthMm,
          heightMm: v,
          isEmptyOpening: op.isEmptyOpening ?? false,
          doorType: op.doorType ?? "single",
          doorSwing: op.doorSwing ?? "in_right",
          doorTrimMm: op.doorTrimMm ?? 50,
          position,
          sipConstruction: op.sipConstruction ?? defaultOpeningSipConstruction(project.profiles),
        });
      }
      if (op.kind !== "window") {
        return { error: "Редактирование не поддерживается." };
      }
      const sill = op.sillHeightMm ?? op.position?.sillLevelMm ?? 900;
      if (sill + v > wall.heightMm + 1e-3) {
        return { error: "Световой проём выходит за высоту стены (уровень низа + высота)." };
      }
      const sip = op.sipConstruction ?? defaultOpeningSipConstruction(project.profiles);
      const merged: Opening = { ...op, heightMm: v };
      const payload = buildSaveWindowParamsPayloadFromOpening(merged, wall, sip);
      return saveWindowParamsAndRegenerateFraming(project, op.id, payload, { interactiveMove: true });
    }
    case "opening_sill_height": {
      const op = project.openings.find((o) => o.id === handle.openingId);
      if (!op || op.kind !== "window" || op.wallId !== wallId || op.offsetFromStartMm == null) {
        return { error: "Только для окон на стене." };
      }
      if (v + op.heightMm > wall.heightMm + 1e-3) {
        return { error: "Световой проём выходит за высоту стены." };
      }
      const sip = op.sipConstruction ?? defaultOpeningSipConstruction(project.profiles);
      const position: OpeningPositionSpec = {
        ...(op.position ?? defaultPositionSpecFromLeftEdge(wall, op.offsetFromStartMm, op.widthMm, v)),
        sillLevelMm: v,
      };
      const merged: Opening = {
        ...op,
        sillHeightMm: v,
        position,
      };
      const payload = buildSaveWindowParamsPayloadFromOpening(merged, wall, sip);
      return saveWindowParamsAndRegenerateFraming(project, op.id, payload, { interactiveMove: true });
    }
    case "wall_height": {
      const err = validateWallHeightForOpenings(project, wallId, v);
      if (err) {
        return { error: err };
      }
      const nextWall: Wall = { ...wall, heightMm: v };
      let p = replaceWallInProject(project, wallId, nextWall);
      p = recalculateWallCalculationIfPresent(p, wallId);
      return { project: p };
    }
    default: {
      return { error: "Неизвестный тип размера." };
    }
  }
}
